import os
import sys

# Ensure system Python paths and http package path are available in PyInstaller sandbox
py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
sys_lib = f"/usr/lib/python{py_ver}"
for p in [sys_lib, f"{sys_lib}/lib-dynload", f"{sys_lib}/site-packages"]:
    if os.path.isdir(p) and p not in sys.path:
        sys.path.append(p)

import http
if hasattr(http, "__path__") and f"{sys_lib}/http" not in http.__path__:
    http.__path__.append(f"{sys_lib}/http")

_plugin_dir = os.path.dirname(os.path.abspath(__file__))
if _plugin_dir not in sys.path:
    sys.path.insert(0, _plugin_dir)

import json
import sqlite3
import subprocess
import threading
import urllib.request
import urllib.parse
import urllib.error
import time
import shutil
import re
import socket
import ssl
import traceback
import hashlib
import asyncio
import secrets
from datetime import datetime

from py_modules import (
    get_user_home,
    init_db,
    get_db,
    SafeRow,
    DB_LOCK,
    CONFIG_DIR,
    DB_PATH,
    SETTINGS_PATH,
    INITIAL_DOWNLOAD_PATH,
    VIDEO_DIR,
    DEFAULT_SETTINGS,
    logger,
    get_ssl_context,
    normalize_jacred_url,
    ping_jacred,
    load_settings,
    save_settings,
    get_bin_path,
    _clean_env,
    _build_gui_env,
    POPULAR_TRACKERS,
    get_steam_language,
    get_available_storage_drives,
    DownloadManager,
    TorrServerManager,
    extract_hash_from_magnet,
    extract_ts_files,
    is_header_ready,
    unwrap_stream_source,
    probe_media_file,
    PROBE_CACHE,
    ThreadedHTTPServer,
    ProjacktorRequestHandler
)
from py_modules import http_server

plugin_instance = None

class Plugin:
    def __init__(self):
        global plugin_instance
        plugin_instance = self
        http_server.plugin_instance = self
        self.server = None
        self.server_thread = None
        self.dm = None
        self.ts = None
        self.inhibit_proc = None

    async def _main(self):
        logger.info("Projacktor: Starting plugin")
        init_db()
        sett = load_settings()
        
        self.dm = DownloadManager(sett.get('aria2_port', 6800))
        self.dm.start()

        ts_port = sett.get('torrserver_port', 8095)
        self.ts = TorrServerManager(port=ts_port)
        self.ts.start()
        
        self.server = ThreadedHTTPServer(('127.0.0.1', 8400), ProjacktorRequestHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        logger.info("Projacktor: Started HTTP server on port 8400")

    async def _unload(self):
        logger.info("Projacktor: Unloading plugin")
        t_start = time.time()
        if self.inhibit_proc and self.inhibit_proc.poll() is None:
            try:
                self.inhibit_proc.terminate()
            except Exception:
                pass

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
        logger.info("Projacktor: Uninstalling plugin")
        try:
            shutil.rmtree(CONFIG_DIR)
        except Exception as e:
            logger.error(f"Error during uninstall cleanup: {e}")

    # Методы RPC (вызываются из JS-фронтенда)
    async def inhibit_sleep(self):
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
            logger.error(f"inhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def uninhibit_sleep(self):
        try:
            if self.inhibit_proc and self.inhibit_proc.poll() is None:
                self.inhibit_proc.terminate()
                try:
                    self.inhibit_proc.wait(timeout=1)
                except:
                    self.inhibit_proc.kill()
                self.inhibit_proc = None
                logger.info("Projacktor: Sleep uninhibited")
            return {"success": True}
        except Exception as e:
            logger.error(f"uninhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def get_torrserver_status(self):
        running = self.ts.ensure_running() if self.ts else False
        port = self.ts.port if self.ts else 8095
        return {
            "running": running,
            "port": port
        }

    async def drop_stream(self, torrent_hash: str):
        if self.ts and torrent_hash:
            return self.ts.drop_torrent(torrent_hash)
        return False

    async def get_status(self):
        sett = load_settings()
        dp = os.path.expanduser(sett.get('download_path', '~/Videos/Projacktor'))
        try:
            total, used, free = shutil.disk_usage(dp)
        except Exception:
            try:
                total, used, free = shutil.disk_usage(get_user_home())
            except Exception:
                total, used, free = 0, 0, 0
            
        j_ok = ping_jacred(sett.get('jacred_url') or '', timeout=4)
        ts_ok = self.ts.ensure_running() if self.ts else False
        drives = get_available_storage_drives()
        
        return {
            "aria2_running": self.dm._running if self.dm else False,
            "torrserver_running": ts_ok,
            "torrserver_port": self.ts.port if self.ts else 8095,
            "jacred_status": j_ok,
            "free_disk_space": free,
            "total_disk_space": total,
            "used_disk_space": used,
            "download_path": dp,
            "drives": drives
        }

    async def get_settings(self):
        return load_settings()

    async def save_settings(self, settings_json: str):
        try:
            s = json.loads(settings_json)
            save_settings(s)
            return True
        except:
            return False

    async def get_downloads_count(self):
        db = get_db()
        c = db.execute("SELECT COUNT(id) FROM downloads WHERE status NOT IN ('completed', 'error')").fetchone()
        db.close()
        return c[0] if c else 0

    async def get_storage_drives(self):
        return get_available_storage_drives()

    async def get_disk_space(self):
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
            "total": total,
            "used": used,
            "free": free,
            "path": dp,
            "drives": get_available_storage_drives()
        }

    async def check_jacred(self, url: str):
        return ping_jacred(url, timeout=6)

    async def get_steam_language(self):
        try:
            home = get_user_home()
            vdf_candidates = [
                os.path.join(home, ".steam", "registry.vdf"),
                os.path.join(home, ".steam", "steam", "registry.vdf"),
                os.path.join(home, ".local", "share", "Steam", "registry.vdf"),
            ]
            for vdf_path in vdf_candidates:
                if os.path.exists(vdf_path):
                    try:
                        with open(vdf_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            match = re.search(r'"language"\s+"([^"]+)"', content, re.IGNORECASE)
                            if match:
                                return match.group(1).lower()
                    except Exception:
                        pass
            for env_var in ["STEAM_CLIENT_LANGUAGE", "LANGUAGE", "LC_ALL", "LANG"]:
                val = os.environ.get(env_var)
                if val:
                    return val.lower()
        except: pass
        return "ru"

    async def get_watchlist(self):
        db = get_db()
        try:
            rows = db.execute("SELECT * FROM watchlist ORDER BY id DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    async def add_to_watchlist(self, data: str):
        try:
            body = json.loads(data) if isinstance(data, str) else data
            tmdb_id = body.get('tmdb_id') or body.get('id')
            if not tmdb_id:
                return {"success": False, "error": "tmdb_id is required"}
            title = body.get('title') or body.get('name') or "Без названия"
            original_title = body.get('original_title') or body.get('original_name') or ""
            media_type = body.get('media_type') or "movie"
            year = str(body.get('year') or body.get('release_date') or body.get('first_air_date') or "")[:4]
            overview = body.get('overview') or ""
            poster_path = body.get('poster_path') or ""
            backdrop_path = body.get('backdrop_path') or ""
            vote_average = float(body.get('vote_average') or 0)

            db = get_db()
            try:
                db.execute("""
                    INSERT INTO watchlist (tmdb_id, media_type, title, original_title, year, overview, poster_path, backdrop_path, vote_average)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tmdb_id) DO UPDATE SET
                        title=excluded.title,
                        original_title=excluded.original_title,
                        media_type=excluded.media_type,
                        year=excluded.year,
                        overview=excluded.overview,
                        poster_path=excluded.poster_path,
                        backdrop_path=excluded.backdrop_path,
                        vote_average=excluded.vote_average
                """, (tmdb_id, media_type, title, original_title, year, overview, poster_path, backdrop_path, vote_average))
                db.commit()
                return {"success": True}
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin add_to_watchlist error: {e}")
            return {"success": False, "error": str(e)}

    async def remove_from_watchlist(self, tmdb_id: int):
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watchlist WHERE tmdb_id=?", (tmdb_id,))
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin remove_from_watchlist error: {e}")
            return False

    async def is_in_watchlist(self, tmdb_id: int):
        try:
            db = get_db()
            try:
                row = db.execute("SELECT id FROM watchlist WHERE tmdb_id=?", (tmdb_id,)).fetchone()
                return bool(row)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin is_in_watchlist error: {e}")
            return False

    async def get_watch_history(self):
        db = get_db()
        try:
            rows = db.execute("SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT 100").fetchall()
            items = []
            for r in rows:
                d = dict(r)
                local_file = None
                # Check if existing file_path is already valid
                if d.get('file_path') and os.path.isfile(d.get('file_path')):
                    local_file = d['file_path']
                else:
                    # Check if subsequently downloaded
                    if d.get('tmdb_id'):
                        mf = db.execute("""
                            SELECT f.file_path FROM media_files f
                            JOIN media m ON f.media_id = m.id
                            WHERE m.tmdb_id = ?
                            ORDER BY f.id ASC LIMIT 1
                        """, (d['tmdb_id'],)).fetchone()
                        if mf and os.path.isfile(mf['file_path']):
                            local_file = mf['file_path']
                    if not local_file and d.get('title'):
                        mf = db.execute("""
                            SELECT f.file_path FROM media_files f
                            JOIN media m ON f.media_id = m.id
                            WHERE m.title = ?
                            ORDER BY f.id ASC LIMIT 1
                        """, (d['title'],)).fetchone()
                        if mf and os.path.isfile(mf['file_path']):
                            local_file = mf['file_path']

                # Enrich missing or broken poster/backdrop from media table
                m_row = None
                if d.get('media_id'):
                    m_row = db.execute("SELECT tmdb_id, poster_path, backdrop_path FROM media WHERE id=?", (d['media_id'],)).fetchone()
                if not m_row and d.get('tmdb_id'):
                    m_row = db.execute("SELECT tmdb_id, poster_path, backdrop_path FROM media WHERE tmdb_id=?", (d['tmdb_id'],)).fetchone()
                if not m_row and d.get('title'):
                    m_row = db.execute("SELECT tmdb_id, poster_path, backdrop_path FROM media WHERE title=?", (d['title'],)).fetchone()

                if m_row:
                    if not d.get('tmdb_id') and m_row['tmdb_id']:
                        d['tmdb_id'] = m_row['tmdb_id']
                    if (not d.get('poster_path') or len(d.get('poster_path', '')) < 10 or d['poster_path'] == '/3908.jpg') and m_row['poster_path']:
                        d['poster_path'] = m_row['poster_path']
                    if not d.get('backdrop_path') and m_row['backdrop_path']:
                        d['backdrop_path'] = m_row['backdrop_path']

                dl_status = None
                if local_file:
                    d['file_path'] = local_file
                    d['is_downloaded'] = True
                    dl_status = 'completed'
                else:
                    d['is_downloaded'] = False
                    dl_row = None
                    if d.get('media_id'):
                        dl_row = db.execute(
                            "SELECT status FROM downloads WHERE media_id=? ORDER BY id DESC LIMIT 1",
                            (d['media_id'],)
                        ).fetchone()
                    if not dl_row and d.get('tmdb_id'):
                        dl_row = db.execute("""
                            SELECT d.status FROM downloads d
                            JOIN media m ON d.media_id = m.id
                            WHERE m.tmdb_id = ?
                            ORDER BY d.id DESC LIMIT 1
                        """, (d['tmdb_id'],)).fetchone()
                    if dl_row:
                        dl_status = dl_row['status']
                d['download_status'] = dl_status
                items.append(d)
            return items
        finally:
            db.close()

    async def save_watch_progress(self, data: str):
        try:
            body = json.loads(data) if isinstance(data, str) else data
            title = (body.get('title') or '').strip()
            if not title:
                return False

            clean_title = re.sub(r'\s*\(Онлайн\)\s*', '', title, flags=re.I).strip()
            tmdb_id = body.get('tmdb_id')
            media_id = body.get('media_id')
            original_title = body.get('original_title') or ""
            media_type = body.get('media_type') or "movie"
            year = str(body.get('year') or "")[:4]
            poster_path = body.get('poster_path') or ""
            backdrop_path = body.get('backdrop_path') or ""
            overview = body.get('overview') or ""
            file_path = body.get('file_path') or ""
            stream_url = body.get('stream_url') or ""
            torrent_hash = body.get('torrent_hash') or ""
            is_online = 1 if body.get('is_online') else 0
            episode_name = (body.get('episode_name') or '').strip()
            season_number = body.get('season_number')
            episode_number = body.get('episode_number')
            current_time = float(body.get('current_time') or 0)
            duration = float(body.get('duration') or 0)
            progress = round((current_time / duration * 100), 1) if duration > 0 else 0

            db = get_db()
            try:
                # Если media_id не передан, попробуем найти его в базе media
                if not media_id:
                    if tmdb_id:
                        m_row = db.execute("SELECT id, tmdb_id, poster_path, backdrop_path FROM media WHERE tmdb_id=?", (tmdb_id,)).fetchone()
                        if m_row:
                            media_id = m_row['id']
                            if not poster_path:
                                poster_path = m_row['poster_path']
                            if not backdrop_path:
                                backdrop_path = m_row['backdrop_path']
                    if not media_id and clean_title:
                        m_row = db.execute("SELECT id, tmdb_id, poster_path, backdrop_path FROM media WHERE title=?", (clean_title,)).fetchone()
                        if m_row:
                            media_id = m_row['id']
                            if not tmdb_id and m_row['tmdb_id']:
                                tmdb_id = m_row['tmdb_id']
                            if not poster_path:
                                poster_path = m_row['poster_path']
                            if not backdrop_path:
                                backdrop_path = m_row['backdrop_path']

                # Ищем существующую запись по названию и серии (или tmdb_id)
                existing = None
                if episode_name:
                    if tmdb_id:
                        existing = db.execute(
                            "SELECT id FROM watch_history WHERE tmdb_id=? AND episode_name=?",
                            (tmdb_id, episode_name)
                        ).fetchone()
                    if not existing:
                        existing = db.execute(
                            "SELECT id FROM watch_history WHERE title=? AND episode_name=?",
                            (clean_title, episode_name)
                        ).fetchone()
                else:
                    if tmdb_id:
                        existing = db.execute(
                            "SELECT id FROM watch_history WHERE tmdb_id=? AND (episode_name IS NULL OR episode_name='')",
                            (tmdb_id,)
                        ).fetchone()
                    if not existing:
                        existing = db.execute(
                            "SELECT id FROM watch_history WHERE title=? AND (episode_name IS NULL OR episode_name='')",
                            (clean_title,)
                        ).fetchone()

                now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                is_dl_flag = 1 if (not is_online and file_path and not file_path.startswith("http") and os.path.isfile(file_path)) else None

                if existing:
                    db.execute("""
                        UPDATE watch_history
                        SET current_time=?, duration=?, progress=?, watched_at=?,
                            file_path=COALESCE(NULLIF(?, ''), file_path),
                            stream_url=COALESCE(NULLIF(?, ''), stream_url),
                            torrent_hash=COALESCE(NULLIF(?, ''), torrent_hash),
                            is_online=?,
                            is_downloaded=COALESCE(?, is_downloaded),
                            poster_path=COALESCE(NULLIF(?, ''), poster_path),
                            backdrop_path=COALESCE(NULLIF(?, ''), backdrop_path),
                            tmdb_id=COALESCE(?, tmdb_id),
                            media_id=COALESCE(?, media_id)
                        WHERE id=?
                    """, (current_time, duration, progress, now_ts,
                          file_path, stream_url, torrent_hash, is_online,
                          is_dl_flag,
                          poster_path, backdrop_path, tmdb_id, media_id, existing['id']))
                else:
                    db.execute("""
                        INSERT INTO watch_history (
                            media_id, tmdb_id, title, original_title, media_type, year,
                            poster_path, backdrop_path, overview,
                            file_path, stream_url, torrent_hash, is_online, is_downloaded,
                            episode_name, season_number, episode_number,
                            current_time, duration, progress, watched_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (media_id, tmdb_id, clean_title, original_title, media_type, year,
                          poster_path, backdrop_path, overview,
                          file_path, stream_url, torrent_hash, is_online, (1 if is_dl_flag else 0),
                          episode_name, season_number, episode_number,
                          current_time, duration, progress, now_ts))
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin save_watch_progress error: {e}")
            return False

    async def start_history_download(self, history_id: int):
        db = get_db()
        try:
            h = db.execute("SELECT * FROM watch_history WHERE id=?", (history_id,)).fetchone()
            if not h:
                return {"success": False, "error": "Запись истории не найдена"}

            mid = h['media_id'] if 'media_id' in h.keys() and h['media_id'] else None
            m = None
            if mid:
                m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m and h.get('tmdb_id'):
                m = db.execute("SELECT * FROM media WHERE tmdb_id=?", (h['tmdb_id'],)).fetchone()
            if not m and h.get('title'):
                m = db.execute("SELECT * FROM media WHERE title=?", (h['title'],)).fetchone()

            if not m:
                return {"success": False, "error": "Медиа-проект не найден в базе"}

            mid = m['id']

            # Гарантируем наличие magnet_uri
            if not m.get('magnet_uri') and h.get('torrent_hash'):
                hash_val = h['torrent_hash']
                trackers = "&".join(f"tr={urllib.parse.quote(t)}" for t in POPULAR_TRACKERS[:5])
                m_magnet = f"magnet:?xt=urn:btih:{hash_val}&{trackers}"
                db.execute("UPDATE media SET magnet_uri=? WHERE id=?", (m_magnet, mid))

            # Гарантируем наличие download_dir
            if not m.get('download_dir'):
                m_type = m.get('media_type') or 'movie'
                m_dir = os.path.join(VIDEO_DIR, "Фильмы" if m_type == 'movie' else "Сериалы", m['title'])
                db.execute("UPDATE media SET download_dir=? WHERE id=?", (m_dir, mid))

            # Включаем проект в библиотеку
            db.execute("UPDATE media SET in_library=1 WHERE id=?", (mid,))
            db.commit()

            # Определяем точный file_index для серии в раздаче
            file_idx_str = ""
            media_type = m.get('media_type') or h.get('media_type') or 'movie'
            ep_num = h.get('episode_number')
            ep_name = h.get('episode_name') or ''
            file_path = h.get('file_path') or ''

            if media_type == 'tv' or ep_num is not None or ep_name:
                try:
                    episodes = await self.get_episodes(mid)
                    matched_ep = None
                    if ep_name:
                        for ep in episodes:
                            if ep.get('name') == ep_name or (ep_name and ep_name in ep.get('name', '')):
                                matched_ep = ep
                                break
                    if not matched_ep and file_path:
                        f_base = os.path.basename(file_path)
                        for ep in episodes:
                            if ep.get('name') == f_base or ep.get('path') == file_path:
                                matched_ep = ep
                                break
                    if not matched_ep and ep_num is not None:
                        for ep in episodes:
                            _, parsed_ep, _ = self._episode_sort_key(ep.get('name', ''))
                            if parsed_ep == ep_num:
                                matched_ep = ep
                                break
                    if matched_ep and matched_ep.get('index') is not None:
                        file_idx_str = str(matched_ep['index'])
                except Exception as e:
                    logger.warning(f"Failed to resolve episode file index for history item {history_id}: {e}")

            # Запускаем загрузку
            res = await self.start_download(mid, file_idx_str)
            if self.dm:
                self.dm.sync_once()
            return {"success": True, "media_id": mid, "result": res}
        except Exception as e:
            logger.error(f"Plugin start_history_download error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            try:
                db.close()
            except:
                pass

    async def delete_watch_history_item(self, item_id: int):
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watch_history WHERE id=?", (item_id,))
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin delete_watch_history_item error: {e}")
            return False

    async def clear_watch_history(self):
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watch_history")
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin clear_watch_history error: {e}")
            return False

    async def get_downloads(self):
        db = get_db()
        try:
            dls = db.execute("""
                SELECT d.*, 
                       COALESCE(m.title, d.torrent_title, 'Медиа') AS title,
                       m.year,
                       m.poster_path,
                       m.backdrop_path,
                       m.media_type,
                       m.overview
                FROM downloads d
                LEFT JOIN media m ON d.media_id = m.id
                WHERE d.status IN ('downloading', 'paused', 'queued', 'seeding', 'completed', 'error')
                  AND (d.downloaded_size > 0 OR (d.aria2_gid IS NOT NULL AND d.aria2_gid != '') OR d.status != 'queued')
                ORDER BY d.id DESC
            """).fetchall()
            return [dict(row) for row in dls]
        finally:
            db.close()

    def _cleanup_old_torrent_download(self, mid: int, ddir: str, old_gid: str = "", old_hash: str = ""):
        """Останавливает и удаляет старую раздачу из aria2 и очищает недокачанные файлы."""
        logger.info(f"Replacing torrent: cleaning old task mid={mid}, gid={old_gid}, hash={old_hash}")
        if self.dm:
            if old_gid:
                try:
                    self.dm._rpc_call("aria2.forceRemove", [old_gid])
                except Exception:
                    try:
                        self.dm.remove(old_gid)
                    except Exception: pass
                try:
                    self.dm._rpc_call("aria2.removeDownloadResult", [old_gid])
                except Exception: pass

            if old_hash:
                try:
                    active = self.dm._rpc_call("aria2.tellActive") or []
                    waiting = self.dm._rpc_call("aria2.tellWaiting", [0, 100]) or []
                    stopped = self.dm._rpc_call("aria2.tellStopped", [0, 100]) or []
                    for t in active + waiting + stopped:
                        h = (t.get('infoHash') or '').lower()
                        if h == old_hash.lower():
                            t_gid = t.get('gid')
                            try:
                                self.dm._rpc_call("aria2.forceRemove", [t_gid])
                            except Exception:
                                try:
                                    self.dm.remove(t_gid)
                                except Exception: pass
                            try:
                                self.dm._rpc_call("aria2.removeDownloadResult", [t_gid])
                            except Exception: pass
                except Exception as e:
                    logger.warning(f"Error removing old hash {old_hash} from aria2: {e}")

        # Очищаем записи media_files и удаляем старые файлы
        db = get_db()
        try:
            cur = db.cursor()
            old_files = cur.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in old_files:
                fp = f['file_path']
                try:
                    if os.path.exists(fp):
                        os.remove(fp)
                    if os.path.exists(fp + ".aria2"):
                        os.remove(fp + ".aria2")
                except Exception as fe:
                    logger.warning(f"Error removing old file {fp}: {fe}")
            cur.execute("DELETE FROM media_files WHERE media_id=?", (mid,))
            db.commit()
        except Exception as e:
            logger.warning(f"Error clearing media_files for media {mid}: {e}")
        finally:
            db.close()

        # Удаляем оставшиеся .aria2 файлы в папке загрузки
        try:
            if ddir and os.path.isdir(ddir):
                for fn in os.listdir(ddir):
                    if fn.endswith(".aria2"):
                        try:
                            os.remove(os.path.join(ddir, fn))
                        except Exception: pass
        except Exception as e:
            logger.warning(f"Error cleaning .aria2 in {ddir}: {e}")

    async def add_to_library(self, payload_json: str):
        try:
            data = json.loads(payload_json)
            magnet = data.get('magnet', '')
            tmdb_id = data.get('tmdb_id')
            title = data.get('title', '')
            year = data.get('year', '')
            mtype = data.get('media_type', 'movie')
            quality = data.get('quality', '')
            torrent_title = data.get('torrent_title', '')
            poster_path = data.get('poster_path', '')
            backdrop_path = data.get('backdrop_path', '')
            overview = data.get('overview', '')
            in_lib = 1 if data.get('in_library', True) else 0

            base_dir = VIDEO_DIR
            folder = "Фильмы" if mtype == 'movie' else "Сериалы"
            safe_title = re.sub(r'[/\\?%*:|"<>!]', '', title).strip() or "Media"
            ddir = os.path.join(base_dir, folder, f"{safe_title} ({year})".strip())
            os.makedirs(ddir, exist_ok=True)
            
            db = get_db()
            try:
                cursor = db.cursor()
                cursor.execute("SELECT id, in_library, magnet_uri FROM media WHERE tmdb_id=?", (tmdb_id,))
                row = cursor.fetchone()
                if not row:
                    cursor.execute("""
                        INSERT INTO media (tmdb_id, title, year, media_type, poster_path, backdrop_path, overview,
                                           magnet_uri, torrent_title, quality, download_dir, in_library, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'catalog')
                    """, (tmdb_id, title, year, mtype, poster_path, backdrop_path, overview,
                          magnet, torrent_title, quality, ddir, in_lib))
                    mid = cursor.lastrowid
                else:
                    mid = row['id']
                    final_in_lib = 1 if (row['in_library'] == 1 or in_lib == 1) else 0
                    cursor.execute("""
                        UPDATE media 
                        SET title=?, year=?, media_type=?,
                            poster_path=COALESCE(NULLIF(poster_path, ''), ?),
                            backdrop_path=COALESCE(NULLIF(backdrop_path, ''), ?),
                            overview=COALESCE(NULLIF(overview, ''), ?),
                            magnet_uri=?, torrent_title=?, quality=?, download_dir=?, in_library=?
                        WHERE id=?
                    """, (title, year, mtype, poster_path, backdrop_path, overview,
                          magnet, torrent_title, quality, ddir, final_in_lib, mid))
                
                if in_lib:
                    cursor.execute("SELECT id, magnet_uri, aria2_gid FROM downloads WHERE media_id=?", (mid,))
                    dl_row = cursor.fetchone()
                    if not dl_row:
                        cursor.execute("""
                            INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, status, quality)
                            VALUES (?, ?, ?, ?, 'queued', ?)
                        """, (mid, magnet, torrent_title, ddir, quality))
                    else:
                        old_mag = dl_row['magnet_uri'] or ''
                        old_hash = ""
                        if "xt=urn:btih:" in old_mag.lower():
                            try:
                                old_hash = old_mag.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                            except: pass
                        new_hash = ""
                        if "xt=urn:btih:" in (magnet or "").lower():
                            try:
                                new_hash = magnet.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                            except: pass

                        if old_hash and new_hash and old_hash != new_hash:
                            logger.info(f"add_to_library: Replacing torrent {old_hash} -> {new_hash} for media {mid}")
                            self._cleanup_old_torrent_download(mid, ddir, dl_row.get('aria2_gid') or '', old_hash)
                            cursor.execute("""
                                UPDATE downloads 
                                SET magnet_uri=?, torrent_title=?, download_dir=?, quality=?,
                                    aria2_gid=NULL, status='queued', progress=0, download_speed=0,
                                    downloaded_size=0, total_size=0, error_message=NULL
                                WHERE id=?
                            """, (magnet, torrent_title, ddir, quality, dl_row['id']))
                        else:
                            cursor.execute("""
                                UPDATE downloads 
                                SET magnet_uri=?, torrent_title=?, download_dir=?, quality=?
                                WHERE id=?
                            """, (magnet, torrent_title, ddir, quality, dl_row['id']))
                    
                db.commit()
                return {"success": True, "id": mid}
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin add_to_library error: {e}")
            return {"success": False, "error": str(e)}

    async def start_download(self, mid: int, file_indices: str = ""):
        try:
            db = get_db()
            try:
                cursor = db.cursor()
                m = cursor.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
                if not m:
                    return {"success": False, "error": "Media not found"}
                
                magnet = m['magnet_uri']
                ddir = m['download_dir']
                if not magnet or not ddir:
                    return {"success": False, "error": "Magnet link missing"}
                    
                os.makedirs(ddir, exist_ok=True)
                dl = cursor.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
                gid = dl['aria2_gid'] if dl else None
                
                options = {
                    "dir": ddir,
                    "file-allocation": "none",
                    "bt-prioritize-piece": "head=50M,tail=15M"
                }
                if file_indices:
                    options["select-file"] = str(file_indices)
                    
                target_hash = ""
                if "xt=urn:btih:" in (magnet or "").lower():
                    try:
                        target_hash = magnet.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                    except: pass

                st = None
                if gid and self.dm:
                    cand_st = self.dm.get_status(gid)
                    if cand_st and not (cand_st.get('status') == 'error' and str(cand_st.get('errorCode', '')) in ('12', '13')):
                        cand_hash = (cand_st.get('infoHash') or '').lower()
                        if cand_hash and target_hash and cand_hash != target_hash:
                            logger.info(f"start_download: Detected different torrent {cand_hash} != {target_hash}, cleaning old task")
                            self._cleanup_old_torrent_download(mid, ddir, gid, cand_hash)
                            gid = None
                            cursor.execute("""
                                UPDATE downloads
                                SET aria2_gid=NULL, status='queued', progress=0, download_speed=0,
                                    downloaded_size=0, total_size=0, error_message=NULL
                                WHERE media_id=?
                            """, (mid,))
                            db.commit()
                        else:
                            st = cand_st

                # Проверяем также по хешу в dl_row
                if dl and not st:
                    dl_mag = dl.get('magnet_uri') or ''
                    dl_hash = ""
                    if "xt=urn:btih:" in dl_mag.lower():
                        try:
                            dl_hash = dl_mag.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                        except: pass
                    if dl_hash and target_hash and dl_hash != target_hash:
                        logger.info(f"start_download: dl_hash {dl_hash} != {target_hash}, cleaning old task")
                        self._cleanup_old_torrent_download(mid, ddir, gid or '', dl_hash)
                        gid = None

                # Если нет валидного st по gid, проверяем существующие задачи в aria2 по target_hash
                if not st and target_hash and self.dm:
                    active = self.dm._rpc_call("aria2.tellActive") or []
                    waiting = self.dm._rpc_call("aria2.tellWaiting", [0, 100]) or []
                    stopped = self.dm._rpc_call("aria2.tellStopped", [0, 100]) or []
                    for cand in active + waiting + stopped:
                        if cand.get('infoHash', '').lower() == target_hash:
                            if cand.get('status') == 'error' and str(cand.get('errorCode', '')) in ('12', '13'):
                                continue
                            followed = cand.get('followedBy')
                            if followed and len(followed) > 0:
                                f_cand = self.dm.get_status(followed[0])
                                if f_cand and not (f_cand.get('status') == 'error' and str(f_cand.get('errorCode', '')) in ('12', '13')):
                                    st = f_cand
                                    gid = st.get('gid')
                                    break
                            st = cand
                            gid = st.get('gid')
                            break

                if st and self.dm:
                    followed = st.get('followedBy')
                    if followed and len(followed) > 0:
                        gid = followed[0]
                        st = self.dm.get_status(gid) or st
                    if file_indices:
                        self.dm.select_files(gid, str(file_indices))
                    self.dm.resume(gid)
                    if dl:
                        cursor.execute("UPDATE downloads SET aria2_gid=?, status='downloading', error_message=NULL, magnet_uri=?, torrent_title=?, quality=? WHERE id=?", 
                                       (gid, magnet, m['torrent_title'], m['quality'], dl['id']))
                    else:
                        cursor.execute("""
                            INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                            VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                        """, (mid, magnet, m['torrent_title'], ddir, gid, m['quality']))
                    cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
                    
                    if target_hash:
                        try:
                            cursor.execute("UPDATE watch_history SET torrent_hash=?, is_downloaded=0, watched_at=CURRENT_TIMESTAMP WHERE media_id=? OR tmdb_id=?", 
                                           (target_hash, mid, m['tmdb_id']))
                        except Exception as e:
                            logger.warning(f"Failed to update watch_history: {e}")
                        
                    db.commit()
                    if self.dm:
                        self.dm.sync_once()
                    return {"success": True, "gid": gid}

                new_gid = self.dm.add_download(magnet, ddir, options) if self.dm else ""
                if dl:
                    cursor.execute("UPDATE downloads SET aria2_gid=?, status='downloading', error_message=NULL, magnet_uri=?, torrent_title=?, quality=? WHERE id=?", 
                                   (new_gid, magnet, m['torrent_title'], m['quality'], dl['id']))
                else:
                    cursor.execute("""
                        INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                        VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                    """, (mid, magnet, m['torrent_title'], ddir, new_gid, m['quality']))
                    
                cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
                
                if target_hash:
                    try:
                        cursor.execute("UPDATE watch_history SET torrent_hash=?, is_downloaded=0, watched_at=CURRENT_TIMESTAMP WHERE media_id=? OR tmdb_id=?", 
                                       (target_hash, mid, m['tmdb_id']))
                    except Exception as e:
                        logger.warning(f"Failed to update watch_history: {e}")
                    
                db.commit()
                if self.dm:
                    self.dm.sync_once()
                return {"success": True, "gid": new_gid}
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Plugin start_download error: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    def _natural_keys(text):
        return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(text))]

    @classmethod
    def _episode_sort_key(cls, ep):
        if isinstance(ep, str):
            name = ep
        elif isinstance(ep, dict):
            name = ep.get('name', '') or ep.get('path', '') or ep.get('file_name', '') or ''
        else:
            name = str(ep or '')

        base, _ = os.path.splitext(os.path.basename(name))
        # 1. Match S01E02, s1e2, s01.e02, etc.
        m = re.search(r'[sS](\d+)[\.\s_-]*[eE](\d+)', base)
        if m:
            return (int(m.group(1)), int(m.group(2)), cls._natural_keys(name))
        # 2. Match 1x02, 01x02
        m = re.search(r'(\d+)[xX](\d+)', base)
        if m:
            return (int(m.group(1)), int(m.group(2)), cls._natural_keys(name))
        # 3. Match Season/Сезон
        s_m = re.search(r'(?:[sS]eason|[сС]езон)\s*(\d+)', base, re.I)
        season = int(s_m.group(1)) if s_m else 1
        # 4. Match Episode/Серия/Сер/Эпизод/Ep/E
        e_m = re.search(r'(?:[eE]pisode|[eE]p\.?|[сС]ерия|[сС]ер\.?|[эЭ]пизод)\s*(\d+)', base, re.I)
        if e_m:
            return (season, int(e_m.group(1)), cls._natural_keys(name))
        # 5. Match number before серия (e.g. "5 серия")
        e_m2 = re.search(r'(\d+)\s*(?:серия|сер|выпуск|эпизод)', base, re.I)
        if e_m2:
            return (season, int(e_m2.group(1)), cls._natural_keys(name))
        # 6. Anime / clean standalone episode number (e.g. "Berserk 01.mkv", "One Piece - 100 [1080p]")
        cleaned = re.sub(r'(?i)\b(1080p|720p|480p|2160p|4k|x264|x265|h264|h265|hevc|bdrip|web-dl|webrip|dvdrip|aac|dts|flac|mp3|rus|eng|jap|sub|dub)\b', ' ', base)
        cleaned = re.sub(r'\b(19\d\d|20\d\d)\b', ' ', cleaned)
        e_m3 = re.search(r'(?:^|[\s\-_\.#])(\d{1,4})(?:v\d)?(?:[\s\-_\.#]|$)', cleaned)
        if e_m3:
            return (season, int(e_m3.group(1)), cls._natural_keys(name))
        # 7. Fallback: natural sort
        return (season, 999999, cls._natural_keys(name))

    async def get_episodes(self, mid: int):
        try:
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return []
            
            video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
            existing_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY file_name ASC", (mid,)).fetchall()
            
            # 1. If purely local media (no magnet link attached), return indexed local files
            if not m.get('magnet_uri') and existing_files and len(existing_files) > 0:
                db.close()
                episodes = []
                for idx, f in enumerate(existing_files, 1):
                    if f['file_size'] < 10 * 1024 * 1024:
                        continue
                    episodes.append({
                        "index": idx,
                        "name": f['file_name'],
                        "path": f['file_path'],
                        "size": f['file_size'],
                        "completed": f['file_size'],
                        "selected": True,
                        "downloaded": True
                    })
                episodes.sort(key=self._episode_sort_key)
                return episodes

            # 2. Get episodes list: from cached_json or via TorrServer
            episodes = []
            cached_json = m['episodes_json'] if 'episodes_json' in m.keys() else None
            if cached_json:
                try:
                    episodes = json.loads(cached_json) or []
                except Exception as e:
                    logger.error(f"Error reading cached episodes: {e}")

            if not episodes:
                # Resolve metadata via TorrServer (Fast RAM discovery)
                magnet = m.get('magnet_uri')
                thash = extract_hash_from_magnet(magnet)
                if not self.ts:
                    sett = load_settings()
                    self.ts = TorrServerManager(port=sett.get('torrserver_port', 8095))
                if self.ts and magnet:
                    self.ts.ensure_running()
                    add_res = self.ts.add_torrent(magnet, title=m['title'], poster=m.get('poster_path', ''))
                    if add_res and isinstance(add_res, dict) and add_res.get('hash'):
                        thash = add_res['hash'].lower()

                    t_info = None
                    files = extract_ts_files(add_res)
                    if files:
                        t_info = add_res
                    else:
                        for _ in range(30): # wait up to 15s
                            if thash:
                                t_info = self.ts.get_torrent(thash)
                                files = extract_ts_files(t_info)
                                if files:
                                    break
                            await asyncio.sleep(0.5)
                    
                    files = extract_ts_files(t_info)
                    if t_info and files:
                        extra_re = re.compile(r'(?i)\b(sample|trailer|bonus|featurette|preview)\b')
                        for f in files:
                            f_path = f.get('path', '')
                            ext = os.path.splitext(f_path)[1].lower()
                            length = int(f.get('length', 0))
                            if ext in video_exts and not extra_re.search(f_path):
                                if length < 25 * 1024 * 1024 and len(files) > 1:
                                    continue
                                episodes.append({
                                    "index": int(f.get('id', 0)),
                                    "name": os.path.basename(f_path),
                                    "path": f_path,
                                    "size": length,
                                    "completed": 0,
                                    "selected": True,
                                    "downloaded": False
                                })
                        if episodes:
                            try:
                                db.execute("UPDATE media SET episodes_json=? WHERE id=?", (json.dumps(episodes), mid))
                                db.commit()
                            except Exception as e:
                                logger.error(f"Error caching episodes in DB: {e}")

            # 3. Check aria2 active files first for exact download progress
            af_map = {}
            dl = db.execute("SELECT aria2_gid FROM downloads WHERE media_id=?", (mid,)).fetchone()
            if dl and dl.get('aria2_gid') and self.dm:
                try:
                    a_files = self.dm.get_files(dl['aria2_gid']) or []
                    for af in a_files:
                        af_name = os.path.basename(af.get('path', '')).lower()
                        if af_name:
                            af_map[af_name] = af
                except Exception as e:
                    logger.debug(f"Could not check aria2 files progress: {e}")

            # 4. Check download_dir for already downloaded video files
            ddir = m.get('download_dir') or os.path.join(VIDEO_DIR, "Сериалы")
            disk_files = []
            has_aria2_file = False
            if os.path.isdir(ddir):
                for root, _, files in os.walk(ddir):
                    for f in files:
                        if f.endswith('.aria2'):
                            has_aria2_file = True
                        if os.path.splitext(f)[1].lower() in video_exts:
                            fp = os.path.join(root, f)
                            try:
                                sz = os.path.getsize(fp)
                            except Exception:
                                sz = 0
                            disk_files.append((f, fp, sz))

            # 5. Build or enrich episodes list
            if not episodes and disk_files:
                for idx, (f, fp, sz) in enumerate(sorted(disk_files, key=lambda x: self._episode_sort_key(x[0])), 1):
                    is_complete = sz > 10 * 1024 * 1024 and not has_aria2_file and is_header_ready(fp)
                    episodes.append({
                        "index": idx,
                        "name": f,
                        "path": fp,
                        "size": sz,
                        "completed": sz if is_complete else 0,
                        "selected": True,
                        "downloaded": is_complete
                    })
            elif episodes:
                for ep in episodes:
                    ep_name = ep.get('name', '')
                    ep_name_lower = os.path.basename(ep_name).lower()
                    cur_season, cur_ep_num, _ = self._episode_sort_key(ep_name)
                    expected_sz = int(ep.get('size', 0))

                    # Prioritize aria2 progress if available (active download)
                    af = af_map.get(ep_name_lower)
                    if not af and cur_ep_num != 999999:
                        for a_name, a_data in af_map.items():
                            a_s, a_e, _ = self._episode_sort_key(a_name)
                            if a_e != 999999 and cur_ep_num == a_e and cur_season == a_s:
                                af = a_data
                                break

                    if af:
                        c_len = int(af.get('completedLength', 0))
                        t_len = int(af.get('length', 0)) or expected_sz
                        is_complete = (t_len > 0 and c_len >= t_len)
                        ep['downloaded'] = is_complete
                        ep['completed'] = c_len
                        if af.get('path') and os.path.isabs(af['path']):
                            ep['path'] = af['path']
                        continue

                    # Check disk file if aria2 is not tracking this file or inactive
                    matched_df = None
                    for df_name, df_path, df_sz in disk_files:
                        if df_name.lower() == ep_name_lower:
                            matched_df = (df_name, df_path, df_sz)
                            break
                    if not matched_df and cur_ep_num != 999999:
                        for df_name, df_path, df_sz in disk_files:
                            df_s, df_e, _ = self._episode_sort_key(df_name)
                            if df_e != 999999 and cur_ep_num == df_e and cur_season == df_s:
                                matched_df = (df_name, df_path, df_sz)
                                break

                    if matched_df:
                        df_name, df_path, df_sz = matched_df
                        ep['path'] = df_path
                        header_ok = is_header_ready(df_path)
                        if expected_sz > 0:
                            is_complete = (df_sz >= expected_sz - 65536) and not os.path.exists(df_path + ".aria2") and header_ok
                        else:
                            is_complete = (df_sz > 10 * 1024 * 1024) and not has_aria2_file and header_ok

                        ep['downloaded'] = is_complete
                        ep['completed'] = df_sz if is_complete else (df_sz if header_ok else 0)
                    else:
                        ep['downloaded'] = False
                        ep['completed'] = 0

            db.close()
            episodes.sort(key=self._episode_sort_key)
            return episodes
        except Exception as e:
            logger.error(f"Plugin get_episodes error: {e}")
            return []

    async def download_episode(self, mid: int, file_index: int):
        idx = int(file_index) if file_index is not None else 0
        try:
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            db.close()
            if not m:
                return {"success": False, "error": "Медиа не найдено"}

            episodes = await self.get_episodes(mid)
            target_ep = next((e for e in episodes if e.get('index') == idx), None)
            if not target_ep and 1 <= idx <= len(episodes):
                target_ep = episodes[idx - 1]

            target_name = target_ep.get('name', '') if target_ep else ''
            target_season, target_ep_num, _ = self._episode_sort_key(target_name) if target_name else (1, 999999, '')

            start_res = await self.start_download(mid)
            gid = start_res.get('gid')
            if not gid or not self.dm:
                return start_res

            af_list = []
            for _ in range(30):  # wait up to 15 seconds for metadata resolution
                st = self.dm.get_status(gid)
                if st and st.get('followedBy') and len(st['followedBy']) > 0:
                    gid = st['followedBy'][0]
                    try:
                        db = get_db()
                        db.execute("UPDATE downloads SET aria2_gid=? WHERE media_id=?", (gid, mid))
                        db.commit()
                        db.close()
                    except Exception:
                        pass
                af_list = self.dm.get_files(gid) or []
                # Only treat file list as ready when it contains real files and not aria2 [METADATA]
                if af_list and any(af.get('path') and not af.get('path').startswith('[METADATA]') for af in af_list):
                    break
                await asyncio.sleep(0.5)

            if not af_list or not any(af.get('path') and not af.get('path').startswith('[METADATA]') for af in af_list):
                logger.warning(f"download_episode: aria2 has no real file list yet for gid {gid}")
                return {"success": True, "gid": gid}

            matched_af = None
            # 1. Exact basename match
            if target_name:
                t_clean = target_name.lower().strip()
                for af in af_list:
                    p = af.get('path', '')
                    if os.path.basename(p).lower().strip() == t_clean:
                        matched_af = af
                        break

            # 2. Alphanumeric normalized match
            if not matched_af and target_name:
                norm_target = re.sub(r'[^a-z0-9а-яё]', '', target_name.lower())
                for af in af_list:
                    p = af.get('path', '')
                    norm_p = re.sub(r'[^a-z0-9а-яё]', '', os.path.basename(p).lower())
                    if norm_target and norm_target == norm_p:
                        matched_af = af
                        break

            # 3. Episode sort key match (season + episode number)
            if not matched_af and target_ep_num != 999999:
                for af in af_list:
                    p = af.get('path', '')
                    af_s, af_e, _ = self._episode_sort_key(p)
                    if af_e != 999999 and af_e == target_ep_num and af_s == target_season:
                        matched_af = af
                        break

            # 4. File size match with target_ep
            target_size = int(target_ep.get('size', 0)) if target_ep else 0
            if not matched_af and target_size > 0:
                for af in af_list:
                    try:
                        af_len = int(af.get('length', 0))
                        if abs(af_len - target_size) < 65536:
                            matched_af = af
                            break
                    except Exception:
                        pass

            # 5. Index fallback if video files count and order match
            if not matched_af and 1 <= idx <= len(af_list):
                video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
                video_afs = [af for af in af_list if os.path.splitext(af.get('path', ''))[1].lower() in video_exts]
                if 1 <= idx <= len(video_afs):
                    matched_af = video_afs[idx - 1]

            if matched_af:
                target_aria2_idx = str(matched_af['index'])
                current_selected = set(str(af['index']) for af in af_list if af.get('selected') == 'true')
                
                # If all files were selected by default on magnet add, isolate to only the target episode
                if len(current_selected) >= len(af_list) and len(af_list) > 1:
                    current_selected = {target_aria2_idx}
                    needs_restart = True
                elif target_aria2_idx not in current_selected:
                    current_selected.add(target_aria2_idx)
                    needs_restart = True
                else:
                    needs_restart = False

                if needs_restart:
                    selected_str = ",".join(sorted(current_selected, key=int))
                    # aria2 does not apply dynamic select-file on active tasks via changeOption.
                    # Cleanly restart task with updated select-file option, preserving all disk data.
                    self.dm._rpc_call("aria2.forceRemove", [gid])
                    self.dm._rpc_call("aria2.removeDownloadResult", [gid])
                    opt = {
                        "dir": m['download_dir'],
                        "file-allocation": "none",
                        "bt-prioritize-piece": "head=50M,tail=15M",
                        "select-file": selected_str
                    }
                    new_gid = self.dm.add_download(m['magnet_uri'], m['download_dir'], opt)
                    db = get_db()
                    db.execute("UPDATE downloads SET aria2_gid=?, status='downloading' WHERE media_id=?", (new_gid, mid))
                    db.commit()
                    db.close()
                    gid = new_gid
                    logger.info(f"download_episode: restarted aria2 task with files {selected_str} for mid {mid}, new gid {gid}")
                else:
                    self.dm.resume(gid)
                return {"success": True, "gid": gid, "aria2_index": target_aria2_idx}
            else:
                logger.warning(f"download_episode: could not match aria2 file for {target_name}")
                return {"success": True, "gid": gid}
        except Exception as e:
            logger.error(f"Plugin download_episode error: {e}")
            return {"success": False, "error": str(e)}

    async def prepare_stream(self, mid: int, file_index: int = 0, force_online: bool = False, magnet: str = ""):
        try:
            file_idx = int(file_index) if file_index is not None else 0
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return {"success": False, "error": "Медиа не найдено"}

            if magnet and not m.get('magnet_uri'):
                try:
                    db.execute("UPDATE media SET magnet_uri=? WHERE id=?", (magnet, mid))
                    db.commit()
                except Exception as e:
                    logger.warning(f"Failed to update magnet_uri in media: {e}")
            
            video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}

            expected_ep_name = ""
            expected_season = 1
            expected_ep_num = 999999
            expected_size = 0
            cached_json = m.get('episodes_json')
            if cached_json and file_idx > 0:
                try:
                    c_eps = json.loads(cached_json) or []
                    for cep in c_eps:
                        if cep.get('index') == file_idx:
                            expected_ep_name = cep.get('name', '')
                            expected_size = int(cep.get('size', 0))
                            expected_season, expected_ep_num, _ = self._episode_sort_key(expected_ep_name)
                            break
                except Exception:
                    pass

            # 1. Check if local files are already downloaded (ONLY if not force_online)
            if not force_online:
                m_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY id ASC", (mid,)).fetchall()
                if m_files and len(m_files) > 0:
                    target_file = None
                    if file_idx > 0:
                        if expected_ep_name:
                            for f in m_files:
                                if f['file_name'].lower() == expected_ep_name.lower():
                                    target_file = f['file_path']
                                    break
                        if not target_file and expected_ep_num != 999999:
                            for f in m_files:
                                f_s, f_e, _ = self._episode_sort_key(f['file_name'])
                                if f_e != 999999 and f_e == expected_ep_num and f_s == expected_season:
                                    target_file = f['file_path']
                                    break
                    elif m.get('media_type') == 'movie':
                        target_file = m_files[0]['file_path']

                    if target_file and os.path.isfile(target_file) and is_header_ready(target_file):
                        is_complete = not os.path.exists(target_file + ".aria2")
                        if expected_size > 0:
                            is_complete = is_complete and (os.path.getsize(target_file) >= expected_size - 65536)
                        if is_complete:
                            db.close()
                            stream_url = f"http://127.0.0.1:8400/api/stream?file={urllib.parse.quote(target_file)}"
                            return {
                                "success": True,
                                "stream_url": stream_url,
                                "file_path": target_file,
                                "title": f"{m['title']} - {os.path.basename(target_file)}" if file_idx > 0 else m['title'],
                                "transcode": True,
                                "online": False
                            }

                ddir = m.get('download_dir') or os.path.join(VIDEO_DIR, "Фильмы" if m.get('media_type') == 'movie' else "Сериалы")
                if os.path.isdir(ddir):
                    disk_files = []
                    has_aria2_file = False
                    for root, _, files in os.walk(ddir):
                        for f in sorted(files):
                            if f.endswith('.aria2'):
                                has_aria2_file = True
                            if os.path.splitext(f)[1].lower() in video_exts:
                                fp = os.path.join(root, f)
                                disk_files.append((f, fp))

                    if disk_files:
                        target_file = None
                        if file_idx > 0:
                            if expected_ep_name:
                                for f, fp in disk_files:
                                    if f.lower() == expected_ep_name.lower():
                                        target_file = fp
                                        break
                            if not target_file and expected_ep_num != 999999:
                                for f, fp in disk_files:
                                    f_s, f_e, _ = self._episode_sort_key(f)
                                    if f_e != 999999 and f_e == expected_ep_num and f_s == expected_season:
                                        target_file = fp
                                        break
                        elif m.get('media_type') == 'movie':
                            largest_fp = max(disk_files, key=lambda x: os.path.getsize(x[1]))[1]
                            target_file = largest_fp

                        if target_file and os.path.isfile(target_file) and is_header_ready(target_file):
                            dl_check = db.execute("SELECT aria2_gid FROM downloads WHERE media_id=?", (mid,)).fetchone()
                            is_file_complete = False
                            if dl_check and dl_check.get('aria2_gid') and self.dm:
                                af_list = self.dm.get_files(dl_check['aria2_gid']) or []
                                target_af = next((af for af in af_list if os.path.basename(af.get('path', '')).lower() == os.path.basename(target_file).lower()), None)
                                if target_af:
                                    c_len = int(target_af.get('completedLength', 0))
                                    t_len = int(target_af.get('length', 0))
                                    is_file_complete = (t_len > 0 and c_len >= t_len)
                            if not is_file_complete and not has_aria2_file:
                                cur_sz = os.path.getsize(target_file)
                                if expected_size > 0:
                                    is_file_complete = (cur_sz >= expected_size - 65536)
                                else:
                                    is_file_complete = (cur_sz > 20 * 1024 * 1024)

                            if is_file_complete:
                                db.close()
                                stream_url = f"http://127.0.0.1:8400/api/stream?file={urllib.parse.quote(target_file)}"
                                stream_title = f"{m['title']} - {os.path.basename(target_file)}" if (m.get('media_type') == 'tv' or file_idx > 0) else m['title']
                                return {
                                    "success": True,
                                    "stream_url": stream_url,
                                    "file_path": target_file,
                                    "title": stream_title,
                                    "transcode": True,
                                    "online": False
                                }

            db.close()

            # 2. Online streaming via TorrServer (Zero disk wear, RAM-only cache)
            target_magnet = magnet or m.get('magnet_uri')
            if not target_magnet:
                return {"success": False, "error": "Нет magnet-ссылки для раздачи"}

            if not self.ts:
                sett = load_settings()
                self.ts = TorrServerManager(port=sett.get('torrserver_port', 8095))

            if not self.ts.ensure_running():
                return {"success": False, "error": "Не удалось запустить TorrServer для онлайн-просмотра"}

            thash = extract_hash_from_magnet(target_magnet)
            poster_url = m.get('poster_path', '')
            if poster_url and poster_url.startswith('/'):
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"
            add_res = self.ts.add_torrent(target_magnet, title=m['title'], poster=poster_url)
            if add_res and isinstance(add_res, dict) and add_res.get('hash'):
                thash = add_res['hash'].lower()

            # Wait up to 15 seconds for TorrServer to fetch torrent metadata via DHT/Trackers
            t_info = None
            for _ in range(30):
                if thash:
                    t_info = self.ts.get_torrent(thash)
                    files = extract_ts_files(t_info)
                    if files:
                        break
                await asyncio.sleep(0.5)

            files = extract_ts_files(t_info)
            if not t_info or not files:
                return {
                    "success": False,
                    "error": "Подключение к раздаче TorrServer... Подождите несколько секунд и попробуйте снова."
                }

            all_files = files
            video_files = [f for f in all_files if os.path.splitext(f.get('path', ''))[1].lower() in video_exts]
            if not video_files:
                video_files = all_files

            target_f = None
            if file_idx > 0:
                for f in video_files:
                    if int(f.get('id', -1)) == file_idx:
                        target_f = f
                        break
                if not target_f and expected_ep_name:
                    for f in video_files:
                        if os.path.basename(f.get('path', '')).lower() == expected_ep_name.lower():
                            target_f = f
                            break
                if not target_f and expected_ep_num != 999999:
                    for f in video_files:
                        f_s, f_e, _ = self._episode_sort_key(f.get('path', ''))
                        if f_e != 999999 and f_e == expected_ep_num and f_s == expected_season:
                            target_f = f
                            break
            if not target_f and m.get('media_type') == 'movie':
                target_f = max(video_files, key=lambda x: x.get('length', 0))

            if not target_f:
                return {"success": False, "error": f"Серия #{file_idx} не найдена в раздаче"}

            chosen_id = target_f.get('id', 1)
            chosen_path = target_f.get('path', 'video.mp4')
            chosen_name = os.path.basename(chosen_path)
            stream_title = f"{m['title']} - {chosen_name}" if file_idx > 0 else m['title']

            direct_ts_url = f"{self.ts.base_url}/stream/{urllib.parse.quote(chosen_name)}?link={thash}&index={chosen_id}&play"
            proxied_url = f"http://127.0.0.1:8400/api/stream?url={urllib.parse.quote(direct_ts_url)}"

            return {
                "success": True,
                "stream_url": proxied_url,
                "direct_stream_url": direct_ts_url,
                "torrent_hash": thash,
                "file_path": chosen_path,
                "title": stream_title,
                "transcode": True,
                "online": True
            }
        except Exception as e:
            logger.error(f"Plugin prepare_stream error: {e}")
            return {"success": False, "error": str(e)}

    async def add_download(self, data: str):
        res = await self.add_to_library(data)
        if res.get("success") and res.get("id"):
            await self.start_download(res["id"])
        return res

    async def pause_download(self, did: int):
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid, id FROM downloads WHERE id=? OR media_id=?", (did, did)).fetchone()
            if row and row['aria2_gid'] and self.dm:
                try:
                    self.dm.pause(row['aria2_gid'])
                except Exception as e:
                    logger.warning(f"aria2 pause warning: {e}")
            if row:
                db.execute("UPDATE downloads SET status='paused', download_speed=0, upload_speed=0 WHERE id=?", (row['id'],))
            else:
                db.execute("UPDATE downloads SET status='paused', download_speed=0, upload_speed=0 WHERE media_id=?", (did,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"Plugin pause_download error: {e}")
            return False
        finally:
            db.close()

    async def resume_download(self, did: int):
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid, magnet_uri, download_dir, id, media_id FROM downloads WHERE id=? OR media_id=?", (did, did)).fetchone()
            if not row:
                # Если задачи еще нет в downloads, но проект есть в media - запускаем загрузку
                m = db.execute("SELECT id FROM media WHERE id=?", (did,)).fetchone()
                if m:
                    db.close()
                    res = await self.start_download(m['id'])
                    return bool(res and res.get('success'))
                return False

            if row and self.dm:
                res = None
                if row['aria2_gid']:
                    try:
                        res = self.dm.resume(row['aria2_gid'])
                    except:
                        res = None
                # Если задача выпала из памяти aria2, повторно подключаем magnet к той же папке
                if not res and row.get('magnet_uri') and row.get('download_dir'):
                    try:
                        new_gid = self.dm.add_download(row['magnet_uri'], row['download_dir'])
                        if new_gid:
                            db.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row['id']))
                    except Exception as e:
                        logger.error(f"Failed to re-add torrent on resume: {e}")
            db.execute("UPDATE downloads SET status='downloading' WHERE id=?", (row['id'],))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"Plugin resume_download error: {e}")
            return False
        finally:
            db.close()

    async def resume_all_downloads(self):
        try:
            if self.dm:
                self.dm.unpause_all()
            db = get_db()
            try:
                cursor = db.cursor()
                rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
                if self.dm:
                    for r in rows:
                        if r['aria2_gid']:
                            try:
                                self.dm.resume(r['aria2_gid'])
                            except:
                                pass
                cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
                db.commit()
            finally:
                db.close()
            if self.dm:
                self.dm._update_db()
            return True
        except Exception as e:
            logger.error(f"Plugin resume_all_downloads error: {e}")
            return False

    async def delete_download(self, did: int):
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            if row and row['aria2_gid'] and self.dm:
                try:
                    self.dm.remove(row['aria2_gid'])
                except: pass
            db.execute("DELETE FROM downloads WHERE id=?", (did,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"Plugin delete_download error: {e}")
            return False
        finally:
            db.close()

    async def get_library(self):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT m.*, 
                       COUNT(f.id) AS file_count, 
                       COALESCE(SUM(f.file_size), 0) AS total_file_size,
                       d.id AS download_id,
                       d.status AS download_status,
                       d.progress AS download_progress,
                       d.download_speed,
                       d.total_size AS download_total_size,
                       d.downloaded_size AS download_downloaded_size,
                       d.aria2_gid,
                       COALESCE(m.magnet_uri, d.magnet_uri) AS effective_magnet,
                       COALESCE(m.quality, d.quality) AS effective_quality,
                       COALESCE(m.torrent_title, d.torrent_title) AS effective_torrent_title,
                       COALESCE(m.download_dir, d.download_dir) AS effective_download_dir
                FROM media m
                LEFT JOIN media_files f ON m.id = f.media_id
                LEFT JOIN downloads d ON d.id = (
                    SELECT id FROM downloads 
                    WHERE media_id = m.id 
                    ORDER BY CASE 
                        WHEN status = 'downloading' THEN 1 
                        WHEN status = 'paused' THEN 2 
                        WHEN status = 'completed' THEN 3 
                        ELSE 4 
                    END, id DESC LIMIT 1
                )
                WHERE m.in_library = 1 OR (d.id IS NOT NULL AND d.status NOT IN ('queued', 'cancelled')) OR f.id IS NOT NULL
                GROUP BY m.id
                ORDER BY m.id DESC
            """).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                m_files = db.execute("SELECT * FROM media_files WHERE media_id=? AND file_size > 10485760 ORDER BY id ASC", (d['id'],)).fetchall()
                valid_files = []
                for f in m_files:
                    f_dict = dict(f)
                    fp = f_dict.get('file_path')
                    if fp and os.path.isfile(fp) and is_header_ready(fp):
                        valid_files.append(f_dict)
                    elif fp and os.path.isfile(fp) and not is_header_ready(fp):
                        try:
                            db.execute("DELETE FROM media_files WHERE id=?", (f_dict['id'],))
                            db.commit()
                        except Exception:
                            pass
                d['files'] = valid_files
                d['downloaded_episodes_count'] = len(valid_files)
                total_eps = 0
                if d.get('episodes_json'):
                    try:
                        eps_data = json.loads(d['episodes_json'])
                        if isinstance(eps_data, list):
                            total_eps = len(eps_data)
                    except: pass
                if total_eps == 0 and d.get('episodes_count'):
                    try:
                        total_eps = int(d['episodes_count'])
                    except: pass
                d['total_episodes_count'] = total_eps

                # Если это сериал, и скачаны не все серии — не ставим completed на уровне всего сериала
                if d.get('media_type') == 'tv':
                    if total_eps > 0 and len(d['files']) < total_eps:
                        if d.get('download_status') == 'completed':
                            d['download_status'] = 'in_library'
                    elif total_eps > 0 and len(d['files']) >= total_eps:
                        d['download_status'] = 'completed'

                result.append(d)
            return result
        finally:
            db.close()

    async def delete_library_item(self, mid: int):
        db = get_db()
        try:
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            dl = db.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()

            # 1. Stop and remove ALL related aria2 tasks (parent GID, followed-by child GIDs, and by infoHash / dir)
            if self.dm:
                target_hash = ""
                if dl and dl.get('magnet_uri') and "xt=urn:btih:" in str(dl['magnet_uri']).lower():
                    try:
                        target_hash = str(dl['magnet_uri']).lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                    except: pass
                elif m and m.get('magnet_uri') and "xt=urn:btih:" in str(m['magnet_uri']).lower():
                    try:
                        target_hash = str(m['magnet_uri']).lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                    except: pass

                gids_to_remove = set()
                if dl and dl.get('aria2_gid'):
                    gids_to_remove.add(dl['aria2_gid'])

                try:
                    all_tasks = (self.dm.tell_active() or []) + (self.dm.tell_waiting() or []) + (self.dm.tell_stopped() or [])
                    for t in all_tasks:
                        t_gid = t.get('gid')
                        t_hash = (t.get('infoHash') or '').lower()
                        t_dir = t.get('dir') or ''
                        if t_gid in gids_to_remove:
                            for fb in (t.get('followedBy') or []):
                                gids_to_remove.add(fb)
                        if target_hash and t_hash and t_hash == target_hash:
                            gids_to_remove.add(t_gid)
                        if m and m.get('download_dir') and t_dir and os.path.abspath(t_dir) == os.path.abspath(m['download_dir']):
                            gids_to_remove.add(t_gid)
                except Exception as e:
                    logger.warning(f"Error finding tasks to remove: {e}")

                for g in gids_to_remove:
                    try:
                        self.dm.remove(g)
                    except: pass
                    try:
                        self.dm._rpc_call("aria2.forceRemove", [g])
                    except: pass
                    try:
                        self.dm._rpc_call("aria2.removeDownloadResult", [g])
                    except: pass
                try:
                    self.dm.purge_download_result()
                except: pass

            # 2. Delete files from media_files and download_dir
            files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in files:
                try:
                    if os.path.isfile(f['file_path']):
                        os.remove(f['file_path'])
                except: pass

            if m and m.get('download_dir') and os.path.isdir(m['download_dir']):
                try:
                    shutil.rmtree(m['download_dir'], ignore_errors=True)
                except Exception as e:
                    logger.warning(f"Error removing download_dir {m['download_dir']}: {e}")

            db.execute("DELETE FROM media_files WHERE media_id=?", (mid,))
            db.execute("DELETE FROM downloads WHERE media_id=?", (mid,))
            db.execute("DELETE FROM media WHERE id=?", (mid,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"Plugin delete_library_item error: {e}")
            return False
        finally:
            db.close()

    async def play_media(self, file_path: str):
        if not os.path.exists(file_path):
            return False
        env = _build_gui_env()
        for player in ["mpv", "vlc", "/usr/bin/xdg-open"]:
            if shutil.which(player):
                subprocess.Popen([player, file_path], env=env)
                return True
        return False

    async def clear_cache(self):
        try:
            # 1. Clear memory caches in HTTP server
            ProjacktorRequestHandler.tmdb_cache.clear()
            
            # 2. Clear disk caches (TMDB metadata, images, etc.)
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

            # 3. Clean temporary online downloads cache & unfinished files (.aria2 and stream cache)
            if self.dm:
                try:
                    self.dm.purge_download_result()
                except Exception as e:
                    logger.warning(f"Failed to purge aria2 download results: {e}")

            # Check download directories for items not marked completed or temporary online files
            try:
                db = get_db()
                # Find all files with .aria2 or temporary streaming files in download dirs
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
