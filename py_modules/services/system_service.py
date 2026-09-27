"""System & settings domain service for Projacktor."""

import os
import re
import json
import shutil
import asyncio
import subprocess

from ..db import get_db, logger, CONFIG_DIR, get_user_home
from ..common import (
    load_settings,
    save_settings as common_save_settings,
    ping_jacred,
    get_available_storage_drives,
    get_steam_language as common_get_steam_language
)
from ..constants import DEFAULT_HTTP_PORT


class SystemService:
    def __init__(self):
        self.inhibit_proc = None

    async def inhibit_sleep(self) -> dict:
        try:
            if not self.inhibit_proc or self.inhibit_proc.poll() is not None:
                self.inhibit_proc = subprocess.Popen(
                    ["systemd-inhibit", "--what=idle", "--who=Projacktor", "--why=Downloading in MagicBlack screen-off mode", "sleep", "infinity"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info("Projacktor: Sleep inhibited for MagicBlack screen-off download")
            return {"success": True}
        except Exception as e:
            logger.error(f"SystemService inhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def uninhibit_sleep(self) -> dict:
        try:
            if self.inhibit_proc and self.inhibit_proc.poll() is None:
                self.inhibit_proc.terminate()
                try:
                    self.inhibit_proc.wait(timeout=1)
                except Exception:
                    self.inhibit_proc.kill()
                self.inhibit_proc = None
                logger.info("Projacktor: Sleep uninhibited")
            return {"success": True}
        except Exception as e:
            logger.error(f"SystemService uninhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    def stop_inhibit(self):
        if self.inhibit_proc and self.inhibit_proc.poll() is None:
            try:
                self.inhibit_proc.terminate()
            except Exception:
                pass

    def get_torrserver_status(self, ts) -> dict:
        running = ts.ensure_running() if ts else False
        port = ts.port if ts else 8095
        return {
            "running": running,
            "port": port
        }

    def drop_stream(self, ts, torrent_hash: str) -> bool:
        if ts and torrent_hash:
            return ts.drop_torrent(torrent_hash)
        return False

    async def get_status(self, dm, ts) -> dict:
        sett = load_settings()
        dp = os.path.expanduser(sett.get('download_path', '~/Videos/Projacktor'))
        try:
            total, used, free = shutil.disk_usage(dp)
        except Exception:
            try:
                total, used, free = shutil.disk_usage(get_user_home())
            except Exception:
                total, used, free = 0, 0, 0
            
        try:
            j_ok = await asyncio.wait_for(
                asyncio.to_thread(ping_jacred, sett.get('jacred_url') or '', timeout=3),
                timeout=4.0
            )
        except Exception:
            j_ok = False
        ts_ok = ts.ensure_running() if ts else False
        drives = get_available_storage_drives()
        
        return {
            "aria2_running": dm._running if dm else False,
            "torrserver_running": ts_ok,
            "torrserver_port": ts.port if ts else 8095,
            "jacred_status": j_ok,
            "free_disk_space": free,
            "total_disk_space": total,
            "used_disk_space": used,
            "download_path": dp,
            "available_drives": drives
        }

    def get_settings(self) -> dict:
        return load_settings()

    def save_settings(self, settings_json: str):
        try:
            data = json.loads(settings_json) if isinstance(settings_json, str) else settings_json
            common_save_settings(data)
            return True
        except Exception as e:
            logger.error(f"SystemService save_settings error: {e}")
            return False

    def get_storage_drives(self) -> list[dict]:
        return get_available_storage_drives()

    def get_disk_space(self) -> dict:
        sett = load_settings()
        dp = os.path.expanduser(sett.get('download_path', '~/Videos/Projacktor'))
        try:
            total, used, free = shutil.disk_usage(dp)
        except Exception:
            try:
                total, used, free = shutil.disk_usage(get_user_home())
            except Exception:
                total, used, free = 0, 0, 0
        return {
            "free": free,
            "total": total,
            "used": used,
            "path": dp
        }

    async def check_jacred(self, url: str) -> bool:
        if not url:
            return False
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(ping_jacred, url, timeout=3),
                timeout=4.0
            )
        except Exception as e:
            logger.error(f"SystemService check_jacred error: {e}")
            return False

    def get_steam_language(self) -> str:
        return common_get_steam_language()

    async def clear_cache(self, dm, http_request_handler_cls=None) -> bool:
        try:
            if http_request_handler_cls and hasattr(http_request_handler_cls, 'tmdb_cache'):
                http_request_handler_cls.tmdb_cache.clear()
            
            cache_dir = os.path.join(CONFIG_DIR, "cache")
            if os.path.isdir(cache_dir):
                for item in os.listdir(cache_dir):
                    item_path = os.path.join(cache_dir, item)
                    try:
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path, ignore_errors=True)
                        else:
                            os.remove(item_path)
                    except Exception as e:
                        logger.warning(f"Failed to delete {item_path}: {e}")

            if dm:
                try:
                    dm.purge_download_result()
                except Exception as e:
                    logger.warning(f"Failed to purge aria2 download results: {e}")

            try:
                db = get_db()
                rows = db.execute("SELECT download_dir, status FROM downloads").fetchall()
                db.close()
                for r in rows:
                    dd = r['download_dir']
                    if dd and os.path.isdir(dd) and r['status'] != 'completed':
                        for root, _, files in os.walk(dd):
                            for f in files:
                                if f.endswith(".aria2") or f.startswith("[METADATA]"):
                                    try:
                                        os.remove(os.path.join(root, f))
                                    except Exception:
                                        pass
            except Exception as e:
                logger.warning(f"Error cleaning download cache files: {e}")

            logger.info("Cache and temporary download files cleared successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False
