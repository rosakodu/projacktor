import os
import sys

# Ensure system Python paths and standard packages (http, email, urllib) are available in PyInstaller sandbox
import glob

candidate_libs = []
py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
for base in ["/usr/lib", "/usr/lib64"]:
    candidate_libs.append(f"{base}/python{py_ver}")
for p in sorted(glob.glob("/usr/lib/python3*") + glob.glob("/usr/lib64/python3*"), reverse=True):
    if os.path.isdir(p) and p not in candidate_libs:
        candidate_libs.append(p)

for sys_lib in candidate_libs:
    if not os.path.isdir(sys_lib):
        continue
    for p in [sys_lib, f"{sys_lib}/lib-dynload", f"{sys_lib}/site-packages"]:
        if os.path.isdir(p) and p not in sys.path:
            sys.path.append(p)

import http
for sys_lib in candidate_libs:
    http_dir = os.path.join(sys_lib, "http")
    if hasattr(http, "__path__") and os.path.isdir(http_dir) and http_dir not in http.__path__:
        http.__path__.append(http_dir)

try:
    import email
    for sys_lib in candidate_libs:
        email_dir = os.path.join(sys_lib, "email")
        if hasattr(email, "__path__") and os.path.isdir(email_dir) and email_dir not in email.__path__:
            email.__path__.append(email_dir)
except Exception:
    pass

try:
    import urllib
    for sys_lib in candidate_libs:
        urllib_dir = os.path.join(sys_lib, "urllib")
        if hasattr(urllib, "__path__") and os.path.isdir(urllib_dir) and urllib_dir not in urllib.__path__:
            urllib.__path__.append(urllib_dir)
except Exception:
    pass

_plugin_dir = os.path.dirname(os.path.abspath(__file__))
if _plugin_dir not in sys.path:
    sys.path.insert(0, _plugin_dir)

import time
import threading
import asyncio

from py_modules import (
    init_db,
    rescan_library_from_disk,
    logger,
    load_settings,
    auto_enrich_library_metadata,
    DownloadManager,
    TorrServerManager,
    ThreadedHTTPServer,
    ProjacktorRequestHandler,
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PORT,
    SystemService,
    WatchlistService,
    HistoryService,
    LibraryService,
    DownloadService,
    StreamService
)
from py_modules import http_server

plugin_instance = None


class Plugin:
    """Projacktor Decky Loader Plugin facade."""

    def __init__(self):
        global plugin_instance
        plugin_instance = self
        http_server.plugin_instance = self
        self.server = None
        self.server_thread = None
        self.dm = None
        self.ts = None

        # Domain services
        self.system = SystemService()
        self.watchlist = WatchlistService()
        self.history = HistoryService()
        self.library = LibraryService()
        self.downloads = DownloadService()
        self.streaming = StreamService()

    @property
    def inhibit_proc(self):
        return self.system.inhibit_proc

    @inhibit_proc.setter
    def inhibit_proc(self, val):
        self.system.inhibit_proc = val

    def _get_http_port(self) -> int:
        sett = load_settings()
        return sett.get('http_server_port', DEFAULT_HTTP_PORT)

    def _get_http_base_url(self) -> str:
        return f"http://{DEFAULT_HTTP_HOST}:{self._get_http_port()}"

    async def _main(self):
        logger.info("Projacktor: Starting plugin")
        init_db()
        sett = load_settings()

        # Восстановление скачанных файлов с актуальным путем загрузок
        try:
            dp = sett.get('download_path', '')
            rescan_library_from_disk(download_path=dp)
            threading.Thread(target=auto_enrich_library_metadata, daemon=True).start()
        except Exception as e:
            logger.error(f"Error rescanning library on startup: {e}")

        self.dm = DownloadManager(sett.get('aria2_port', 6800))
        self.dm.start()

        ts_port = sett.get('torrserver_port', 8095)
        self.ts = TorrServerManager(port=ts_port)
        self.ts.start()

        http_port = self._get_http_port()
        self.server = ThreadedHTTPServer((DEFAULT_HTTP_HOST, http_port), ProjacktorRequestHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        logger.info(f"Projacktor: Started HTTP server on {DEFAULT_HTTP_HOST}:{http_port}")

    async def _unload(self):
        logger.info("Projacktor: Unloading plugin")
        t_start = time.time()
        self.system.stop_inhibit()

        threads = []
        if self.server:
            def _stop_srv():
                try:
                    self.server.server_close()
                except Exception:
                    pass
                try:
                    self.server.shutdown()
                except Exception:
                    pass
            threads.append(threading.Thread(target=_stop_srv, daemon=True, name="StopServer"))

        if self.dm:
            threads.append(threading.Thread(target=self.dm.stop, daemon=True, name="StopDM"))

        if self.ts:
            threads.append(threading.Thread(target=self.ts.stop, daemon=True, name="StopTS"))

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=1.5)

        logger.info(f"Projacktor: Unload finished cleanly in {time.time() - t_start:.2f}s")

    async def _uninstall(self):
        logger.info("Projacktor: Uninstall hook called (user settings and database safely preserved)")

    async def _migration(self):
        logger.info("Projacktor: Migration hook called")
        try:
            init_db()
            sett = load_settings()
            dp = sett.get('download_path', '')
            rescan_library_from_disk(download_path=dp)
        except Exception as e:
            logger.warning(f"Projacktor: Migration warning: {e}")

    # ==================== RPC Methods ====================

    # System & Settings
    async def inhibit_sleep(self, reason: str = "video"):
        return await self.system.inhibit_sleep(reason)

    async def uninhibit_sleep(self, reason: str = "video"):
        return await self.system.uninhibit_sleep(reason)

    async def ping_sleep_inhibit(self):
        return await self.system.ping_sleep_inhibit()

    async def get_torrserver_status(self):
        return self.system.get_torrserver_status(self.ts)

    async def drop_stream(self, torrent_hash: str):
        return self.system.drop_stream(self.ts, torrent_hash)

    async def get_status(self):
        return await self.system.get_status(self.dm, self.ts)

    async def get_settings(self):
        return self.system.get_settings()

    async def save_settings(self, settings_json: str):
        return self.system.save_settings(settings_json)

    async def get_storage_drives(self):
        return self.system.get_storage_drives()

    async def get_disk_space(self):
        return self.system.get_disk_space()

    async def check_jacred(self, url: str):
        return await self.system.check_jacred(url)

    async def get_steam_language(self):
        return self.system.get_steam_language()

    async def clear_cache(self):
        return await self.system.clear_cache(self.dm, ProjacktorRequestHandler)

    # Watchlist
    async def get_watchlist(self):
        return self.watchlist.get_watchlist()

    async def add_to_watchlist(self, data: str):
        return self.watchlist.add_to_watchlist(data)

    async def remove_from_watchlist(self, tmdb_id: int):
        return self.watchlist.remove_from_watchlist(tmdb_id)

    async def is_in_watchlist(self, tmdb_id: int):
        return self.watchlist.is_in_watchlist(tmdb_id)

    # History
    async def get_watch_history(self):
        return self.history.get_watch_history()

    async def save_watch_progress(self, data: str):
        return self.history.save_watch_progress(data)

    async def start_history_download(self, history_id: int):
        return await self.history.start_history_download(history_id, self.library, self.downloads, self.dm)

    async def delete_watch_history_item(self, item_id: int):
        return self.history.delete_watch_history_item(item_id)

    async def clear_watch_history(self):
        return self.history.clear_watch_history()

    # Downloads
    async def get_downloads_count(self):
        return self.downloads.get_downloads_count()

    async def get_downloads(self):
        return self.downloads.get_downloads()

    def _cleanup_old_torrent_download(self, mid: int, ddir: str, old_gid: str = "", old_hash: str = ""):
        self.downloads.cleanup_old_torrent_download(mid, ddir, old_gid, old_hash, self.dm)

    async def start_download(self, mid: int, file_indices: str = ""):
        return await self.downloads.start_download(mid, file_indices, self.dm)

    async def add_download(self, data: str):
        return await self.downloads.add_download(data, self.library, self.dm)

    async def pause_download(self, did: int):
        return self.downloads.pause_download(did, self.dm)

    async def resume_download(self, did: int):
        return await self.downloads.resume_download(did, self.dm)

    async def resume_all_downloads(self):
        return self.downloads.resume_all_downloads(self.dm)

    async def delete_download(self, did: int):
        return self.downloads.delete_download(did, self.dm)

    async def download_episode(self, mid: int, file_index: int):
        return await self.downloads.download_episode(mid, file_index, self.dm, self.library, ts=self.ts)

    async def cancel_episode_download(self, mid: int, file_index: int):
        return await self.downloads.cancel_episode_download(mid, file_index, self.dm, self.library, ts=self.ts)

    async def pause_episode_download(self, mid: int, file_index: int):
        return await self.downloads.pause_episode_download(mid, file_index, self.dm, self.library, ts=self.ts)

    async def delete_episode(self, mid: int, file_index: int):
        return await self.downloads.delete_episode(mid, file_index, self.dm, self.library, ts=self.ts)

    # Library & Episodes
    @classmethod
    def _episode_sort_key(cls, ep):
        return LibraryService._episode_sort_key(ep)

    @staticmethod
    def _natural_keys(text):
        return LibraryService._natural_keys(text)

    async def get_episodes(self, mid: int):
        return await self.library.get_episodes(mid, ts=self.ts, dm=self.dm)

    async def get_torrent_episodes(self, magnet: str, title: str = "", poster_path: str = ""):
        return await self.library.get_torrent_episodes(magnet, title=title, poster_path=poster_path, ts=self.ts)

    async def add_to_library(self, payload_json: str):
        return await self.library.add_to_library(
            payload_json,
            dm=self.dm,
            cleanup_cb=lambda mid, ddir, gid, h: self.downloads.cleanup_old_torrent_download(mid, ddir, gid, h, self.dm)
        )

    async def get_library(self):
        return await self.library.get_library()

    async def delete_library_item(self, mid: int):
        return await self.library.delete_library_item(mid, dm=self.dm)

    async def rescan_library(self):
        return await self.library.rescan_library()

    # Streaming & Playback
    async def prepare_stream(self, mid: int, file_index: int = 0, force_online: bool = False, magnet: str = ""):
        return await self.streaming.prepare_stream(
            mid=mid,
            file_index=file_index,
            force_online=force_online,
            magnet=magnet,
            ts=self.ts,
            dm=self.dm,
            library_service=self.library,
            base_url_cb=self._get_http_base_url
        )

    async def play_media(self, file_path: str):
        return self.streaming.play_media(file_path)
