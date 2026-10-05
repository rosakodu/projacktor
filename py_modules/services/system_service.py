"""System & settings domain service for Projacktor."""

import os
import re
import json
import shutil
import asyncio
import subprocess
import time
import threading

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
        self._lock = threading.Lock()
        self._active_reasons = set()
        self._last_heartbeat = time.time()
        self._watchdog_running = True
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, name="Projacktor-SleepWatchdog", daemon=True)
        self._watchdog_thread.start()

    def _reset_screensaver_idle(self):
        """Reset idle timer on X11 / Gamescope / Freedesktop."""
        try:
            subprocess.Popen(
                ["dbus-send", "--session", "--dest=org.freedesktop.ScreenSaver",
                 "--type=method_call", "/org/freedesktop/ScreenSaver",
                 "org.freedesktop.ScreenSaver.SimulateUserActivity"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except Exception:
            pass
        try:
            subprocess.Popen(["xdg-screensaver", "reset"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

    async def inhibit_sleep(self, reason: str = "video") -> dict:
        try:
            with self._lock:
                self._active_reasons.add(reason)
                self._last_heartbeat = time.time()
                self._ensure_inhibit_proc_running()
            self._reset_screensaver_idle()
            logger.info(f"Projacktor: Sleep inhibited (reason='{reason}', active={self._active_reasons})")
            return {"success": True}
        except Exception as e:
            logger.error(f"SystemService inhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def uninhibit_sleep(self, reason: str = "video") -> dict:
        try:
            with self._lock:
                self._active_reasons.discard(reason)
                if not self._active_reasons:
                    self._stop_inhibit_proc()
            logger.info(f"Projacktor: Sleep uninhibited (reason='{reason}', active={self._active_reasons})")
            return {"success": True}
        except Exception as e:
            logger.error(f"SystemService uninhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def ping_sleep_inhibit(self) -> dict:
        with self._lock:
            self._last_heartbeat = time.time()
            if "video" in self._active_reasons:
                self._ensure_inhibit_proc_running()
        self._reset_screensaver_idle()
        return {"success": True}

    def _ensure_inhibit_proc_running(self):
        if not self.inhibit_proc or self.inhibit_proc.poll() is not None:
            reasons_str = ", ".join(sorted(self._active_reasons)) or "active playback"
            self.inhibit_proc = subprocess.Popen(
                [
                    "systemd-inhibit",
                    "--what=idle",
                    "--who=Projacktor",
                    f"--why=Active in Projacktor ({reasons_str})",
                    "sleep",
                    "infinity"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            logger.info(f"Projacktor: Started systemd-inhibit proc PID={self.inhibit_proc.pid}")

    def _stop_inhibit_proc(self):
        if self.inhibit_proc and self.inhibit_proc.poll() is None:
            try:
                self.inhibit_proc.terminate()
                self.inhibit_proc.wait(timeout=1)
            except Exception:
                try:
                    self.inhibit_proc.kill()
                except Exception:
                    pass
            self.inhibit_proc = None
            logger.info("Projacktor: Stopped systemd-inhibit proc")

    def _watchdog_loop(self):
        while self._watchdog_running:
            time.sleep(15)
            with self._lock:
                if "video" in self._active_reasons:
                    if time.time() - self._last_heartbeat > 100:
                        logger.warning("Projacktor: Video sleep inhibit heartbeat timed out, auto-releasing")
                        self._active_reasons.discard("video")
                        if not self._active_reasons:
                            self._stop_inhibit_proc()

    def stop_inhibit(self):
        self._watchdog_running = False
        with self._lock:
            self._active_reasons.clear()
            self._stop_inhibit_proc()

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
