"""
Application Context (DI Container) for Projacktor.
Manages domain service singletons, background daemons, and application lifecycle.
"""

import time
import threading
import logging
from typing import Optional

from ..constants import (
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PORT,
    DEFAULT_ARIA2_PORT,
    DEFAULT_TORRSERVER_PORT
)
from ..db import init_db, logger
from ..common import load_settings, auto_enrich_library_metadata

from .system_service import SystemService
from .watchlist_service import WatchlistService
from .history_service import HistoryService
from .library_service import LibraryService
from .download_service import DownloadService
from .stream_service import StreamService

_global_context: Optional['AppContext'] = None


def get_app_context() -> 'AppContext':
    """Returns the active global AppContext singleton."""
    global _global_context
    if _global_context is None:
        _global_context = AppContext()
    return _global_context


def set_app_context(ctx: 'AppContext') -> None:
    """Sets the active global AppContext singleton."""
    global _global_context
    _global_context = ctx


class AppContext:
    """Central Dependency Injection container holding services and managers."""

    def __init__(self):
        # Daemon managers and servers
        self.aria2_manager = None
        self.torrserver_manager = None
        self.http_server = None
        self.server_thread = None

        # Domain services initialized with context reference
        self.system = SystemService(context=self)
        self.watchlist = WatchlistService(context=self)
        self.history = HistoryService(context=self)
        self.library = LibraryService(context=self)
        self.downloads = DownloadService(context=self)
        self.streaming = StreamService(context=self)

    # Convenience aliases
    @property
    def dm(self):
        return self.aria2_manager

    @dm.setter
    def dm(self, val):
        self.aria2_manager = val

    @property
    def ts(self):
        return self.torrserver_manager

    @ts.setter
    def ts(self, val):
        self.torrserver_manager = val

    @property
    def server(self):
        return self.http_server

    @server.setter
    def server(self, val):
        self.http_server = val

    def get_http_port(self) -> int:
        sett = load_settings()
        return sett.get('http_server_port', DEFAULT_HTTP_PORT)

    def get_http_base_url(self) -> str:
        return f"http://{DEFAULT_HTTP_HOST}:{self.get_http_port()}"

    async def start(self, settings: Optional[dict] = None) -> None:
        """Starts database, daemons, background rescanner and HTTP server."""
        from ..download_manager import DownloadManager
        from ..torrserver import TorrServerManager
        from ..http_server import ThreadedHTTPServer, ProjacktorRequestHandler
        from .library_scanner import rescan_library_from_disk

        logger.info("AppContext: Starting services and managers")
        init_db()
        sett = settings or load_settings()

        # Background library rescan
        try:
            dp = sett.get('download_path', '')
            rescan_library_from_disk(download_path=dp)
            threading.Thread(target=auto_enrich_library_metadata, daemon=True, name="AutoEnrichWorker").start()
        except Exception as e:
            logger.error(f"AppContext: Error rescanning library on startup: {e}")

        # Start Aria2
        aria2_port = sett.get('aria2_port', DEFAULT_ARIA2_PORT)
        self.aria2_manager = DownloadManager(aria2_port)
        self.aria2_manager.start()

        # Start TorrServer
        ts_port = sett.get('torrserver_port', DEFAULT_TORRSERVER_PORT)
        self.torrserver_manager = TorrServerManager(port=ts_port)
        self.torrserver_manager.start()

        # Start HTTP server
        http_port = self.get_http_port()
        self.http_server = ThreadedHTTPServer((DEFAULT_HTTP_HOST, http_port), ProjacktorRequestHandler)
        self.http_server.app_context = self
        self.server_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True, name="HTTPServerThread")
        self.server_thread.start()
        logger.info(f"AppContext: HTTP server started on {DEFAULT_HTTP_HOST}:{http_port}")

    async def stop(self) -> None:
        """Gracefully shuts down daemons, HTTP server and inhibit locks."""
        logger.info("AppContext: Stopping services and managers")
        t_start = time.time()
        self.system.stop_inhibit()

        threads = []
        if self.http_server:
            def _stop_srv():
                try:
                    self.http_server.server_close()
                except Exception:
                    pass
                try:
                    self.http_server.shutdown()
                except Exception:
                    pass
            threads.append(threading.Thread(target=_stop_srv, daemon=True, name="StopServer"))

        if self.aria2_manager:
            threads.append(threading.Thread(target=self.aria2_manager.stop, daemon=True, name="StopDM"))

        if self.torrserver_manager:
            threads.append(threading.Thread(target=self.torrserver_manager.stop, daemon=True, name="StopTS"))

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=1.5)

        logger.info(f"AppContext: Stopped cleanly in {time.time() - t_start:.2f}s")
