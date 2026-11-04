"""Projacktor domain services."""

from .system_service import SystemService
from .watchlist_service import WatchlistService
from .history_service import HistoryService
from .library_service import LibraryService
from .download_service import DownloadService
from .stream_service import StreamService
from .context import AppContext, get_app_context, set_app_context
from .library_scanner import (
    LibraryScanner,
    rescan_library_from_disk,
    trigger_background_auto_scan,
)

__all__ = [
    "SystemService",
    "WatchlistService",
    "HistoryService",
    "LibraryService",
    "DownloadService",
    "StreamService",
    "AppContext",
    "get_app_context",
    "set_app_context",
    "LibraryScanner",
    "rescan_library_from_disk",
    "trigger_background_auto_scan",
]
