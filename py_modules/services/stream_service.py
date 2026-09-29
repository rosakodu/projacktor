"""Stream and playback domain service for Projacktor."""

import os
import json
import shutil
import urllib.parse
import subprocess
import asyncio

from ..db import get_db, logger, VIDEO_DIR
from ..common import (
    load_settings,
    _build_gui_env,
    is_executable_release
)
from ..stream import is_header_ready
from ..torrserver import extract_hash_from_magnet, extract_ts_files, TorrServerManager
from ..constants import DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT


class StreamService:
    @staticmethod
    def _default_base_url() -> str:
        sett = load_settings()
        port = sett.get('http_server_port', DEFAULT_HTTP_PORT)
        return f"http://{DEFAULT_HTTP_HOST}:{port}"

    async def prepare_stream(
        self,
        mid: int,
        file_index: int = 0,
        force_online: bool = False,
        magnet: str = "",
        ts=None,
        dm=None,
        library_service=None,
        base_url_cb=None
    ) -> dict:
        try:
            get_base_url = base_url_cb or self._default_base_url
            sort_key_fn = library_service._episode_sort_key if library_service else None

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

            target_magnet = magnet or m.get('magnet_uri')
            thash = extract_hash_from_magnet(target_magnet) if target_magnet else None
            if thash:
                thash = thash.lower()

            expected_ep_name = ""
            expected_season = 1
            expected_ep_num = 999999
            expected_size = 0

            c_eps = []
            if thash and library_service and getattr(library_service, '_torrent_episodes_cache', None) and thash in library_service._torrent_episodes_cache:
                c_eps = library_service._torrent_episodes_cache[thash]
            else:
                cached_json = m.get('episodes_json')
                if cached_json:
                    try:
                        c_eps = json.loads(cached_json) or []
                    except Exception:
                        pass

            if c_eps and file_idx > 0:
                for cep in c_eps:
                    if cep.get('index') == file_idx:
                        expected_ep_name = cep.get('name', '')
                        expected_size = int(cep.get('size', 0))
                        if sort_key_fn:
                            expected_season, expected_ep_num, _ = sort_key_fn(expected_ep_name)
                        break

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
                        if not target_file and expected_ep_num != 999999 and sort_key_fn:
                            for f in m_files:
                                f_s, f_e, _ = sort_key_fn(f['file_name'])
                                if f_e != 999999 and f_e == expected_ep_num and f_s == expected_season:
                                    target_file = f['file_path']
                                    break
                        if not target_file and file_idx <= len(m_files):
                            target_file = m_files[file_idx - 1]['file_path']
                    else:
                        target_file = m_files[0]['file_path']

                    if not target_file and m_files:
                        target_file = m_files[0]['file_path']

                    if target_file and os.path.isfile(target_file) and is_header_ready(target_file):
                        is_complete = not os.path.exists(target_file + ".aria2")
                        if expected_size > 0:
                            is_complete = is_complete and (os.path.getsize(target_file) >= expected_size - 65536)
                        if is_complete:
                            db.close()
                            stream_url = f"{get_base_url()}/api/stream?file={urllib.parse.quote(target_file)}"
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
                            if not target_file and expected_ep_num != 999999 and sort_key_fn:
                                for f, fp in disk_files:
                                    f_s, f_e, _ = sort_key_fn(f)
                                    if f_e != 999999 and f_e == expected_ep_num and f_s == expected_season:
                                        target_file = fp
                                        break
                        elif m.get('media_type') == 'movie':
                            largest_fp = max(disk_files, key=lambda x: os.path.getsize(x[1]))[1]
                            target_file = largest_fp

                        if target_file and os.path.isfile(target_file) and is_header_ready(target_file):
                            dl_check = db.execute("SELECT aria2_gid FROM downloads WHERE media_id=?", (mid,)).fetchone()
                            is_file_complete = False
                            if dl_check and dl_check.get('aria2_gid') and dm:
                                af_list = dm.get_files(dl_check['aria2_gid']) or []
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
                                stream_url = f"{get_base_url()}/api/stream?file={urllib.parse.quote(target_file)}"
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

            # 2. Online streaming via TorrServer
            target_magnet = magnet or m.get('magnet_uri')
            if not target_magnet:
                try:
                    db_local = get_db()
                    cur_files = db_local.execute("SELECT file_path, file_name FROM media_files WHERE media_id=? ORDER BY id ASC", (mid,)).fetchall()
                    db_local.close()
                    for cf in cur_files:
                        cfp = cf['file_path']
                        if cfp and os.path.isfile(cfp):
                            return {
                                "success": True,
                                "stream_url": f"{get_base_url()}/api/stream?file={urllib.parse.quote(cfp)}",
                                "file_path": cfp,
                                "title": m['title'],
                                "transcode": True,
                                "online": False
                            }
                except Exception:
                    pass
                return {"success": False, "error": "Локальный видеофайл не найден на диске"}

            if not ts:
                sett = load_settings()
                ts = TorrServerManager(port=sett.get('torrserver_port', 8095))

            if not ts.ensure_running():
                return {"success": False, "error": "Не удалось запустить TorrServer для онлайн-просмотра"}

            thash = extract_hash_from_magnet(target_magnet)
            poster_url = m.get('poster_path', '')
            if poster_url and poster_url.startswith('/'):
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"
            add_res = ts.add_torrent(target_magnet, title=m['title'], poster=poster_url)
            if add_res and isinstance(add_res, dict) and add_res.get('hash'):
                thash = add_res['hash'].lower()

            t_info = None
            for _ in range(30):
                if thash:
                    t_info = ts.get_torrent(thash)
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
            video_files = [f for f in all_files if os.path.splitext(f.get('path', ''))[1].lower() in video_exts and not is_executable_release(f.get('path', ''))]
            if not video_files:
                has_exe = any(is_executable_release(f.get('path', '')) for f in all_files)
                err_msg = "В раздаче не найдено видеофайлов (обнаружены нежелательные/исполняемые файлы .exe)" if has_exe else "В раздаче не найдено поддерживаемых видеофайлов"
                logger.warning(f"prepare_stream rejected release with no video files: {err_msg}")
                return {"success": False, "error": err_msg}

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
                if not target_f and expected_ep_num != 999999 and sort_key_fn:
                    for f in video_files:
                        f_s, f_e, _ = sort_key_fn(f.get('path', ''))
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

            direct_ts_url = f"{ts.base_url}/stream/{urllib.parse.quote(chosen_name)}?link={thash}&index={chosen_id}&play"
            proxied_url = f"{get_base_url()}/api/stream?url={urllib.parse.quote(direct_ts_url)}"

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
            logger.error(f"StreamService prepare_stream error: {e}")
            return {"success": False, "error": str(e)}

    def play_media(self, file_path: str) -> bool:
        if not os.path.exists(file_path):
            return False
        env = _build_gui_env()
        for player in ["mpv", "vlc", "/usr/bin/xdg-open"]:
            if shutil.which(player):
                subprocess.Popen([player, file_path], env=env)
                return True
        return False
