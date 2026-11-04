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
from py_modules.services import AppContext, get_app_context, set_app_context
from py_modules import http_server

plugin_instance = None


class Plugin:
    """Projacktor Decky Loader Plugin facade."""

    def __init__(self, context=None):
        global plugin_instance
        plugin_instance = self
        self.context = context or get_app_context()
        set_app_context(self.context)

    @property
    def server(self):
        return self.context.http_server if self.context else None

    @server.setter
    def server(self, val):
        if self.context:
            self.context.http_server = val

    @property
    def server_thread(self):
        return self.context.server_thread if self.context else None

    @server_thread.setter
    def server_thread(self, val):
        if self.context:
            self.context.server_thread = val

    @property
    def dm(self):
        return self.context.aria2_manager if self.context else None

    @dm.setter
    def dm(self, val):
        if self.context:
            self.context.aria2_manager = val

    @property
    def ts(self):
        return self.context.torrserver_manager if self.context else None

    @ts.setter
    def ts(self, val):
        if self.context:
            self.context.torrserver_manager = val

    @property
    def system(self):
        return self.context.system

    @property
    def watchlist(self):
        return self.context.watchlist

    @property
    def history(self):
        return self.context.history

    @property
    def library(self):
        return self.context.library

    @property
    def downloads(self):
        return self.context.downloads

    @property
    def streaming(self):
        return self.context.streaming

    @property
    def inhibit_proc(self):
        return self.system.inhibit_proc

    @inhibit_proc.setter
    def inhibit_proc(self, val):
        self.system.inhibit_proc = val

    def _get_http_port(self) -> int:
        return self.context.get_http_port()

    def _get_http_base_url(self) -> str:
        return self.context.get_http_base_url()

    async def _main(self):
        logger.info("Projacktor: Starting plugin")
        if not self.context:
            self.context = AppContext()
            set_app_context(self.context)
        sett = load_settings()
        await self.context.start(sett)
        if self.server:
            self.server.app_context = self.context

    async def _unload(self):
        logger.info("Projacktor: Unloading plugin")
        if self.context:
            await self.context.stop()

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
        return await self.context.system.inhibit_sleep(reason)

    async def uninhibit_sleep(self, reason: str = "video"):
        return await self.context.system.uninhibit_sleep(reason)

    async def ping_sleep_inhibit(self):
        return await self.context.system.ping_sleep_inhibit()

    async def get_torrserver_status(self):
        return self.context.system.get_torrserver_status()

    async def drop_stream(self, torrent_hash: str):
        return self.context.system.drop_stream(torrent_hash=torrent_hash)

    async def get_status(self):
        return await self.context.system.get_status()

    async def get_settings(self):
        return self.context.system.get_settings()

    async def save_settings(self, settings_json: str):
        return self.context.system.save_settings(settings_json)

    async def get_storage_drives(self):
        return self.context.system.get_storage_drives()

    async def get_disk_space(self):
        return self.context.system.get_disk_space()

    async def check_jacred(self, url: str):
        return await self.context.system.check_jacred(url)

    async def get_steam_language(self):
        return self.context.system.get_steam_language()

    async def clear_cache(self):
        return await self.context.system.clear_cache()

    # Watchlist
    async def get_watchlist(self):
        return self.context.watchlist.get_watchlist()

    async def add_to_watchlist(self, data: str):
        return self.context.watchlist.add_to_watchlist(data)

    async def remove_from_watchlist(self, tmdb_id: int):
        return self.context.watchlist.remove_from_watchlist(tmdb_id)

    async def is_in_watchlist(self, tmdb_id: int):
        return self.context.watchlist.is_in_watchlist(tmdb_id)

    # History
    async def get_watch_history(self):
        return self.context.history.get_watch_history()

    async def save_watch_progress(self, data: str):
        return self.context.history.save_watch_progress(data)

    async def start_history_download(self, history_id: int):
        return await self.context.history.start_history_download(history_id)

    async def delete_watch_history_item(self, item_id: int):
        return self.context.history.delete_watch_history_item(item_id)

    async def clear_watch_history(self):
        return self.context.history.clear_watch_history()

    # Downloads
    async def get_downloads_count(self):
        return self.context.downloads.get_downloads_count()

    async def get_downloads(self):
        return self.context.downloads.get_downloads()

    def _cleanup_old_torrent_download(self, mid: int, ddir: str, old_gid: str = "", old_hash: str = ""):
        self.context.downloads.cleanup_old_torrent_download(mid, ddir, old_gid, old_hash)

    async def start_download(self, mid: int, file_indices: str = ""):
        return await self.context.downloads.start_download(mid, file_indices)

    async def add_download(self, data: str):
        return await self.context.downloads.add_download(data)

    async def pause_download(self, did: int):
        return self.context.downloads.pause_download(did)

    async def resume_download(self, did: int):
        return await self.context.downloads.resume_download(did)

    async def resume_all_downloads(self):
        return self.context.downloads.resume_all_downloads()

    async def delete_download(self, did: int):
        return self.context.downloads.delete_download(did)

    async def download_episode(self, mid: int, file_index: int):
        return await self.context.downloads.download_episode(mid, file_index)

    async def cancel_episode_download(self, mid: int, file_index: int):
        return await self.context.downloads.cancel_episode_download(mid, file_index)

    async def pause_episode_download(self, mid: int, file_index: int):
        return await self.context.downloads.pause_episode_download(mid, file_index)

    async def delete_episode(self, mid: int, file_index: int):
        return await self.context.downloads.delete_episode(mid, file_index)

    # Library & Episodes
    @classmethod
    def _episode_sort_key(cls, ep):
        return LibraryService._episode_sort_key(ep)

    @staticmethod
    def _natural_keys(text):
        return LibraryService._natural_keys(text)

    async def get_episodes(self, mid: int):
        return await self.context.library.get_episodes(mid)

    async def get_torrent_episodes(self, magnet: str, title: str = "", poster_path: str = ""):
        return await self.context.library.get_torrent_episodes(magnet, title=title, poster_path=poster_path)

    async def add_to_library(self, payload_json: str):
        return await self.context.library.add_to_library(payload_json)

    async def get_library(self):
        return await self.context.library.get_library()

    async def delete_library_item(self, mid: int):
        return await self.context.library.delete_library_item(mid)

    async def rescan_library(self):
        return await self.context.library.rescan_library()

    # Streaming & Playback
    async def prepare_stream(self, mid: int, file_index: int = 0, force_online: bool = False, magnet: str = ""):
        return await self.context.streaming.prepare_stream(
            mid=mid,
            file_index=file_index,
            force_online=force_online,
            magnet=magnet
        )

    async def play_media(self, file_path: str):
        return self.context.streaming.play_media(file_path)
