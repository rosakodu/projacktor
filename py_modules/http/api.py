"""Aggregated API handlers for downloads, library, settings, status and disk."""

import os
import shutil

from ..core.env import logger
from ..db.settings_repo import load_settings, save_settings
from .api_downloads import (
    handle_downloads_list,
    handle_downloads_stats,
    handle_downloads_add,
    handle_downloads_resume_all,
    handle_downloads_patch,
    handle_downloads_delete,
)
from .api_library import (
    handle_library_list,
    handle_library_details,
    handle_library_patch,
    handle_library_delete,
)


def handle_settings_get(handler, path="", query=None):
    handler.send_json(load_settings())


def handle_settings_put(handler, path="", query=None):
    save_settings(handler.get_body())
    handler.send_json({"success": True})


def handle_status(handler, path="", query=None):
    dm_running = bool(handler.app_context and handler.app_context.dm and handler.app_context.dm._running)
    handler.send_json({"aria2c": "running" if dm_running else "stopped"})


def handle_disk(handler, path="", query=None):
    dp = os.path.expanduser(load_settings().get('download_path', '~/Videos/Projacktor'))
    try:
        total, used, free = shutil.disk_usage(dp)
    except Exception as e:
        logger.warning(f"Error checking disk usage for {dp}: {e}")
        free = 0
    handler.send_json({"free": free})


__all__ = [
    "handle_downloads_list",
    "handle_downloads_stats",
    "handle_downloads_add",
    "handle_downloads_resume_all",
    "handle_downloads_patch",
    "handle_downloads_delete",
    "handle_library_list",
    "handle_library_details",
    "handle_library_patch",
    "handle_library_delete",
    "handle_settings_get",
    "handle_settings_put",
    "handle_status",
    "handle_disk",
]
