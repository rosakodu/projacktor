import os
import re
import time
import sqlite3
import threading
import logging
from typing import Optional, Callable

from ..db import DB_PATH, get_user_home, db_get_setting, logger
from ..common import clean_media_title, auto_enrich_library_metadata
from ..media.probe import is_header_ready

VIDEO_EXTENSIONS = {
    '.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov',
    '.m4v', '.wmv', '.flv', '.3gp', '.m2ts', '.mpg', '.mpeg'
}

CATEGORIES = [
    ("Фильмы", "movie"),
    ("Movies", "movie"),
    ("Films", "movie"),
    ("Сериалы", "tv"),
    ("Series", "tv"),
    ("TV", "tv"),
    ("TV Shows", "tv"),
]

SKIP_DIR_NAMES = {
    'steam', 'steamapps', 'node_modules', '__pycache__',
    '.thumbnails', '.cache', '.config', '.git'
}


class LibraryScanner:
    """Filesystem discovery scanner for media files on local disk and removable storage."""

    _last_auto_scan_time = 0.0
    _is_auto_scanning = False
    _lock = threading.Lock()

    def __init__(self, library_service=None):
        self.library_service = library_service

    @classmethod
    def trigger_auto_scan(cls) -> None:
        """Triggers a debounced (25-second cooldown) background scan in a daemon thread."""
        with cls._lock:
            now = time.time()
            if (now - cls._last_auto_scan_time) < 25.0 or cls._is_auto_scanning:
                return
            cls._is_auto_scanning = True
            cls._last_auto_scan_time = now

        def _worker():
            try:
                scanner = cls()
                scanner.scan_disk()
            except Exception as e:
                logger.error(f"[auto_scan] Error in background rescan: {e}")
            finally:
                with cls._lock:
                    cls._is_auto_scanning = False

        t = threading.Thread(target=_worker, name="Projacktor-AutoScanWorker", daemon=True)
        t.start()

    def get_search_roots(self, download_path: Optional[str] = None) -> list[str]:
        """Resolves active download directories, home folders and mounted removable drives."""
        search_roots = []

        sett_dp = download_path
        if not sett_dp:
            try:
                sett_dp = db_get_setting("download_path", "")
            except Exception:
                pass

        if sett_dp:
            r_dp = os.path.realpath(os.path.expanduser(sett_dp))
            if os.path.isdir(r_dp):
                search_roots.append(r_dp)

        user_home = get_user_home()
        for alt in [
            os.path.join(user_home, "Videos", "Projacktor"),
            os.path.join(user_home, "Videos"),
            os.path.join(user_home, "Movies", "Projacktor"),
            os.path.join(user_home, "Movies"),
            os.path.join(user_home, "Video", "Projactor"),
            os.path.join(user_home, "Video", "Projecktor"),
            os.path.join(user_home, "Video"),
            os.path.join(user_home, "videos", "projacktor"),
            os.path.join(user_home, "videos"),
            os.path.join(user_home, "movies", "projacktor"),
            os.path.join(user_home, "movies"),
        ]:
            r_alt = os.path.realpath(alt)
            if r_alt not in search_roots and os.path.isdir(r_alt):
                search_roots.append(r_alt)

        media_bases = ["/run/media", os.path.join("/run/media", os.path.basename(user_home))]
        for mb in media_bases:
            if os.path.isdir(mb):
                try:
                    for entry in os.listdir(mb):
                        entry_path = os.path.join(mb, entry)
                        if os.path.isdir(entry_path):
                            for sd_sub in [
                                "Videos/Projacktor", "Movies/Projacktor",
                                "Videos", "Movies", "Projacktor",
                                "videos/projacktor", "movies/projacktor", "videos", "movies"
                            ]:
                                candidate = os.path.realpath(os.path.join(entry_path, sd_sub))
                                if candidate not in search_roots and os.path.isdir(candidate):
                                    search_roots.append(candidate)
                except Exception:
                    pass

        return search_roots

    @staticmethod
    def extract_torrent_magnet(item_dir: str) -> str:
        """Finds 48-char .torrent file inside folder to derive BTIH magnet."""
        if item_dir and os.path.isdir(item_dir):
            try:
                for f in os.listdir(item_dir):
                    if f.endswith('.torrent') and len(f) == 48:
                        return f"magnet:?xt=urn:btih:{f[:-8].lower()}"
            except Exception:
                pass
        return ""



    def find_video_files(self, item_dir: str, indexed_files: set) -> tuple[list[tuple[str, str, int]], bool]:
        """Detects valid video files in a folder and determines if .aria2 active download exists."""
        vfiles = []
        has_aria2 = False
        for dirpath, _, filenames in os.walk(item_dir):
            for fn in filenames:
                if fn.endswith('.aria2'):
                    has_aria2 = True

        for dirpath, _, filenames in os.walk(item_dir):
            for fn in filenames:
                ext = os.path.splitext(fn)[1].lower()
                if ext in VIDEO_EXTENSIONS:
                    fp = os.path.realpath(os.path.join(dirpath, fn))
                    if fp in indexed_files:
                        continue
                    try:
                        sz = os.path.getsize(fp)
                        if sz >= 100 * 1024 and is_header_ready(fp):
                            if has_aria2 and os.stat(fp).st_blocks * 512 < sz * 0.95:
                                continue
                            vfiles.append((fp, fn, sz))
                            indexed_files.add(fp)
                    except Exception:
                        pass
        return vfiles, has_aria2

    def scan_disk(
        self,
        download_path: Optional[str] = None,
        conn: Optional[sqlite3.Connection] = None,
        progress_cb: Optional[Callable[[int], None]] = None
    ) -> int:
        """Executes full scan of search roots and populates media and downloads tables."""
        from .library_service import LibraryService

        lib_svc = self.library_service or LibraryService()

        should_close = False
        if conn is None:
            try:
                conn = sqlite3.connect(DB_PATH, timeout=10.0)
                conn.row_factory = sqlite3.Row
                should_close = True
            except Exception as e:
                logger.error(f"LibraryScanner.scan_disk failed to connect to db: {e}")
                return 0

        restored_count = 0
        indexed_files = set()

        try:
            search_roots = self.get_search_roots(download_path)
            cursor = conn.cursor()
            known_cat_names = {c[0].lower() for c in CATEGORIES}

            for root in search_roots:
                if not os.path.isdir(root):
                    continue

                # 1. Standard categories inside search root
                for cat_name, media_type in CATEGORIES:
                    cat_dir = os.path.join(root, cat_name)
                    if not os.path.isdir(cat_dir):
                        continue

                    for folder_name in sorted(os.listdir(cat_dir)):
                        item_dir = os.path.join(cat_dir, folder_name)
                        if os.path.isdir(item_dir):
                            vfiles, has_aria2 = self.find_video_files(item_dir, indexed_files)
                            if vfiles:
                                detected_magnet = self.extract_torrent_magnet(item_dir)
                                lib_svc.save_scanned_folder(
                                    cursor=cursor,
                                    item_dir=item_dir,
                                    folder_name=folder_name,
                                    media_type=media_type,
                                    vfiles=vfiles,
                                    has_aria2=has_aria2,
                                    detected_magnet=detected_magnet
                                )
                                restored_count += 1
                                if progress_cb:
                                    progress_cb(restored_count)

                # 2. Recursive scan of other folders and loose video files
                for dirpath, dirs, filenames in os.walk(root):
                    dirs[:] = [
                        d for d in dirs
                        if not d.startswith('.') and d.lower() not in SKIP_DIR_NAMES and d.lower() not in known_cat_names
                    ]

                    if os.path.basename(dirpath).lower() in known_cat_names:
                        continue

                    if any(f.endswith('.aria2') for f in filenames):
                        continue

                    local_vfiles = []
                    for fn in filenames:
                        ext = os.path.splitext(fn)[1].lower()
                        if ext in VIDEO_EXTENSIONS and not fn.endswith('.aria2'):
                            fp = os.path.realpath(os.path.join(dirpath, fn))
                            if fp not in indexed_files:
                                try:
                                    sz = os.path.getsize(fp)
                                    if sz >= 100 * 1024 and is_header_ready(fp):
                                        local_vfiles.append((fp, fn, sz))
                                except Exception:
                                    pass

                    if not local_vfiles:
                        continue

                    folder_name = os.path.basename(dirpath)
                    is_root_dir = (os.path.realpath(dirpath) == os.path.realpath(root))
                    is_season_folder = any(kw in folder_name.lower() for kw in ["season", "сезон", "s0", "s1", "серии"])
                    has_episode_files = sum(
                        1 for _, fn, _ in local_vfiles
                        if re.search(r'(?i)\b(s\d{1,2}e\d{1,4}|s\d{1,2}|\bep?[-_\s]*\d{1,4}|серия\s*\d+)\b', fn)
                    ) >= 2
                    is_structured_release = (not is_root_dir) and (len(local_vfiles) > 1 and (is_season_folder or has_episode_files))

                    if is_structured_release:
                        detected_magnet = self.extract_torrent_magnet(dirpath)
                        for fp, fn, sz in local_vfiles:
                            indexed_files.add(fp)
                        lib_svc.save_scanned_folder(
                            cursor=cursor,
                            item_dir=dirpath,
                            folder_name=folder_name,
                            media_type="tv",
                            vfiles=local_vfiles,
                            has_aria2=False,
                            detected_magnet=detected_magnet
                        )
                        restored_count += 1
                        if progress_cb:
                            progress_cb(restored_count)
                    else:
                        for fp, fn, sz in local_vfiles:
                            indexed_files.add(fp)
                            lib_svc.save_scanned_single_file(
                                cursor=cursor,
                                fp=fp,
                                fn=fn,
                                sz=sz,
                                parent_dir=dirpath
                            )
                            restored_count += 1
                            if progress_cb:
                                progress_cb(restored_count)

            conn.commit()

            try:
                auto_enrich_library_metadata(conn)
            except Exception as e_meta:
                logger.debug(f"auto_enrich_library_metadata background check: {e_meta}")

            if restored_count > 0:
                logger.info(f"[LibraryScanner] Successfully indexed {restored_count} media items into library")
        except Exception as e:
            logger.error(f"[LibraryScanner] Error scanning disk media: {e}")
        finally:
            if should_close:
                conn.close()

        return restored_count


def rescan_library_from_disk(download_path: Optional[str] = None, conn: Optional[sqlite3.Connection] = None) -> int:
    """Delegates library disk scanning to LibraryScanner."""
    return LibraryScanner().scan_disk(download_path=download_path, conn=conn)


def trigger_background_auto_scan() -> None:
    """Delegates background autoscan triggering to LibraryScanner."""
    LibraryScanner.trigger_auto_scan()
