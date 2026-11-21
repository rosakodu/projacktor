import asyncio
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from py_modules.db.connection import SafeRow
from py_modules.db.schema import _execute_schema_and_migrations
from py_modules.download_manager import DownloadManager
from py_modules.http import api_downloads, api_library, stream_local
from py_modules.services.download_service import DownloadService
from py_modules.services.history_service import HistoryService
from py_modules.services.library_service import LibraryService
from py_modules.services.watchlist_service import WatchlistService


class BackendRegressionTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.db_path = self.root / "library.db"

    def connect(self):
        db = sqlite3.connect(self.db_path)
        db.row_factory = SafeRow
        db.execute("PRAGMA foreign_keys=ON")
        self.addCleanup(db.close)
        return db

    def test_legacy_migration_preserves_references_and_separates_media_types(self):
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE media (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, tmdb_id INTEGER UNIQUE,
                    media_type TEXT NOT NULL, title TEXT, poster_path TEXT, backdrop_path TEXT
                );
                CREATE TABLE watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, tmdb_id INTEGER UNIQUE,
                    media_type TEXT NOT NULL, title TEXT, original_title TEXT, year TEXT,
                    overview TEXT, poster_path TEXT, backdrop_path TEXT, vote_average REAL
                );
                CREATE TABLE media_files (
                    id INTEGER PRIMARY KEY, media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                    file_path TEXT
                );
                INSERT INTO media VALUES (11, 101, 'tv', 'Series', '', '');
                INSERT INTO watchlist (id, tmdb_id, media_type, title) VALUES (9, 101, 'tv', 'Series');
                INSERT INTO media_files VALUES (5, 11, '/library/example.mp4');
                INSERT INTO media VALUES (50, 102, 'tv', 'Deleted', '', '');
                DELETE FROM media WHERE id=50;
            """)

        _execute_schema_and_migrations(self.db_path)
        _execute_schema_and_migrations(self.db_path)
        with self.connect() as db:
            movie_id = db.execute(
                "INSERT INTO media (tmdb_id, media_type, title) VALUES (101, 'movie', 'Movie')"
            ).lastrowid
            self.assertEqual(movie_id, 51)
            self.assertEqual(db.execute("SELECT media_id FROM media_files").fetchone()[0], 11)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

        watchlist = WatchlistService()
        with patch("py_modules.services.watchlist_service.get_db", self.connect):
            self.assertTrue(watchlist.add_to_watchlist({"tmdb_id": 101, "media_type": "movie"})["success"])
            self.assertFalse(watchlist.remove_from_watchlist(101))
            self.assertTrue(watchlist.remove_from_watchlist(101, "movie"))
            self.assertFalse(watchlist.is_in_watchlist(101, "movie"))
            self.assertTrue(watchlist.is_in_watchlist(101, "tv"))

        history = HistoryService()
        with patch("py_modules.services.history_service.get_db", self.connect):
            for media_type in ("movie", "tv"):
                self.assertTrue(history.save_watch_progress({
                    "tmdb_id": 101, "title": "Same title", "media_type": media_type,
                    "current_time": 10, "duration": 100,
                }))
            self.assertEqual(
                {(item["media_type"], item["media_id"]) for item in history.get_watch_history()},
                {("movie", movie_id), ("tv", 11)},
            )

    def test_aria2_failure_does_not_create_pending_download(self):
        _execute_schema_and_migrations(self.db_path)
        dm = Mock()
        dm.add_download.return_value = None
        handler = Mock(app_context=SimpleNamespace(dm=dm))
        handler.get_body.return_value = {"magnet": "fixture", "tmdb_id": 1}
        with patch.object(api_downloads, "get_db", self.connect), patch.object(
            api_downloads, "load_settings", return_value={"download_path": str(self.root)}
        ):
            api_downloads.handle_downloads_add(handler)

        handler.send_json.assert_called_once_with(
            {"success": False, "error": "aria2 failed to add download"}, status=502
        )
        with self.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM downloads").fetchone()[0], 0)

    def test_decky_download_failure_does_not_create_active_download(self):
        _execute_schema_and_migrations(self.db_path)
        with self.connect() as db:
            mid = db.execute(
                "INSERT INTO media (media_type, title, magnet_uri, download_dir) VALUES (?, ?, ?, ?)",
                ("movie", "Fixture", "magnet:?xt=urn:btih:" + "a" * 40, str(self.root)),
            ).lastrowid
        dm = Mock()
        dm._rpc_call.return_value = []
        dm.add_download.return_value = None
        with patch("py_modules.services.download_service.get_db", self.connect):
            result = asyncio.run(DownloadService().start_download(mid, dm=dm))

        self.assertFalse(result["success"])
        with self.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM downloads").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT status FROM media WHERE id=?", (mid,)).fetchone()[0], "catalog")

    def test_delete_library_item_preserves_shared_directory_and_other_files(self):
        _execute_schema_and_migrations(self.db_path)
        library = self.root / "Videos"
        library.mkdir()
        target = library / "first.mp4"
        unrelated = library / "second.mp4"
        sidecar = library / "first.mp4.aria2"
        unrelated_sidecar = library / "second.mp4.aria2"
        for file in (target, unrelated, sidecar, unrelated_sidecar):
            file.touch()

        with self.connect() as db:
            for mid, path in [(1, target), (2, unrelated)]:
                db.execute("INSERT INTO media (id, title, media_type, download_dir) VALUES (?, ?, 'tv', ?)",
                           (mid, path.stem, str(library)))
                db.execute("INSERT INTO media_files (media_id, file_path, file_name) VALUES (?, ?, ?)",
                           (mid, str(path), path.name))

        with patch("py_modules.services.library_service.get_db", self.connect), patch(
            "py_modules.services.media_cleanup.load_settings", return_value={"download_path": str(library)}
        ):
            self.assertTrue(asyncio.run(LibraryService().delete_library_item(1)))

        self.assertTrue(library.is_dir())
        self.assertTrue(unrelated.is_file())
        self.assertTrue(unrelated_sidecar.is_file())
        self.assertFalse(target.exists())
        self.assertFalse(sidecar.exists())
        with self.connect() as db:
            self.assertEqual(db.execute("SELECT id FROM media").fetchone()[0], 2)

    def test_delete_episode_does_not_search_shared_directory_for_same_name(self):
        _execute_schema_and_migrations(self.db_path)
        library = self.root / "Videos"
        first = library / "first"
        second = library / "second"
        for folder in (first, second):
            folder.mkdir(parents=True)
            (folder / "episode01.mp4").touch()

        with self.connect() as db:
            db.execute("INSERT INTO media (id, title, media_type, download_dir) VALUES (1, 'Fixture', 'tv', ?)",
                       (str(library),))
        episode = {"index": 1, "name": "episode01.mp4", "path": "first/episode01.mp4", "downloaded": True}
        service = Mock(get_episodes=AsyncMock(return_value=[episode]))
        with patch("py_modules.services.download_service.get_db", self.connect), patch(
            "py_modules.services.media_cleanup.load_settings", return_value={"download_path": str(library)}
        ):
            result = asyncio.run(DownloadService().delete_episode(1, 1, library_service=service))

        self.assertTrue(result["success"])
        self.assertFalse((first / episode["name"]).exists())
        self.assertTrue((second / episode["name"]).is_file())

    def test_missing_completed_download_is_marked_for_retry(self):
        _execute_schema_and_migrations(self.db_path)
        missing_dir = str(self.root / "missing")
        with self.connect() as db:
            db.execute("INSERT INTO media (id, title, media_type, status) VALUES (1, 'Fixture', 'tv', 'downloaded')")
            db.execute("""
                INSERT INTO downloads (media_id, magnet_uri, download_dir, status, progress, downloaded_size)
                VALUES (1, 'fixture', ?, 'completed', 100, 500)
            """, (missing_dir,))

        with self.connect() as db:
            DownloadManager.__new__(DownloadManager)._update_db_inner(db, {}, [])
            row = db.execute("SELECT status, progress, downloaded_size FROM downloads").fetchone()
            self.assertEqual(dict(row), {"status": "error", "progress": 0, "downloaded_size": 0})
            self.assertEqual(db.execute("SELECT status FROM media").fetchone()[0], "catalog")

    def test_library_hides_missing_download_without_hiding_other_failures(self):
        _execute_schema_and_migrations(self.db_path)
        with self.connect() as db:
            for mid in (1, 2):
                db.execute("INSERT INTO media (id, title, media_type) VALUES (?, 'Fixture', 'tv')", (mid,))
                db.execute("""
                    INSERT INTO downloads (media_id, magnet_uri, download_dir, status)
                    VALUES (?, 'fixture', ?, 'completed')
                """, (mid, str(self.root / "missing")))
            DownloadManager.__new__(DownloadManager)._update_db_inner(db, {}, [])
            db.execute("UPDATE downloads SET error_message='Network failure' WHERE media_id=2")

        with patch("py_modules.services.library_service.get_db", self.connect), patch(
            "py_modules.services.library_service.trigger_background_auto_scan"
        ):
            items = asyncio.run(LibraryService().get_library())
        self.assertEqual([item["id"] for item in items], [2])

        handler = Mock()
        with patch.object(api_library, "get_db", self.connect):
            api_library.handle_library_list(handler)
        self.assertEqual([item["id"] for item in handler.send_json.call_args.args[0]], [2])

    def test_library_hides_deleted_files_in_existing_directories_including_legacy_items(self):
        _execute_schema_and_migrations(self.db_path)
        empty_dir = self.root / "Empty"
        shared_dir = self.root / "Shared"
        empty_dir.mkdir()
        shared_dir.mkdir()
        existing = shared_dir / "neighbour.mp4"
        existing.write_bytes(b"xxxxftyp" + bytes(120_000))

        with self.connect() as db:
            for mid, status, directory in [
                (1, "downloaded", empty_dir),
                (2, "downloaded", shared_dir),
                (3, "downloaded", shared_dir),
                (4, "catalog", empty_dir),
                (5, "downloaded", shared_dir),
            ]:
                db.execute("""
                    INSERT INTO media (id, title, media_type, in_library, status, download_dir)
                    VALUES (?, 'Fixture', 'movie', 1, ?, ?)
                """, (mid, status, str(directory)))
            for mid, status in [(1, "completed"), (4, "queued"), (5, "completed")]:
                db.execute("INSERT INTO downloads (media_id, magnet_uri, status) VALUES (?, 'fixture', ?)", (mid, status))
            for mid, path in [(2, shared_dir / "deleted.mp4"), (5, existing)]:
                db.execute("""
                    INSERT INTO media_files (media_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)
                """, (mid, str(path), path.name, existing.stat().st_size))

        with patch("py_modules.services.library_service.get_db", self.connect), patch(
            "py_modules.services.library_service.trigger_background_auto_scan"
        ):
            items = asyncio.run(LibraryService().get_library())
        self.assertEqual([item["id"] for item in items], [5, 4, 3])

        handler = Mock()
        with patch.object(api_library, "get_db", self.connect):
            api_library.handle_library_list(handler)
        self.assertEqual([item["id"] for item in handler.send_json.call_args.args[0]], [5, 4, 3])

    def test_stream_requires_file_within_library_root(self):
        library = self.root / "Videos"
        sibling = self.root / "Videos-other"
        library.mkdir()
        sibling.mkdir()
        video = library / "movie.mp4"
        outside = sibling / "movie.mp4"
        video.touch()
        outside.touch()
        link = library / "link.mp4"
        link.symlink_to(outside)

        with patch.object(stream_local, "load_settings", return_value={"download_path": str(library)}):
            self.assertEqual(
                stream_local.check_stream_security(Mock(), str(video), False, str(video)), str(video)
            )
            for path, status in ((outside, 403), (link, 403), (library, 404)):
                with self.subTest(path=path):
                    handler = Mock()
                    self.assertIsNone(stream_local.check_stream_security(handler, str(path), False, str(path)))
                    handler.send_response.assert_called_once_with(status)
