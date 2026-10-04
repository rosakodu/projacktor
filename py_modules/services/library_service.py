"""Library & Media domain service for Projacktor."""

import os
import re
import json
import shutil
import sqlite3
import asyncio

from ..db import (
    get_db,
    logger,
    VIDEO_DIR,
    DB_PATH,
    get_user_home,
    db_get_setting,
    SafeRow
)
from ..common import (
    load_settings,
    is_executable_release,
    is_unsupported_media_release,
    clean_media_title,
    auto_enrich_library_metadata
)
from ..stream import is_header_ready
from ..torrserver import extract_hash_from_magnet, extract_ts_files, TorrServerManager


def _natural_keys(text):
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(text))]


def _episode_sort_key(ep):
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
        return (int(m.group(1)), int(m.group(2)), _natural_keys(name))
    # 2. Match 1x02, 01x02
    m = re.search(r'(\d+)[xX](\d+)', base)
    if m:
        return (int(m.group(1)), int(m.group(2)), _natural_keys(name))
    # 3. Match Season/Сезон
    s_m = re.search(r'(?:[sS]eason|[сС]езон)\s*(\d+)', base, re.I)
    season = int(s_m.group(1)) if s_m else 1
    # 4. Match Episode/Серия/Сер/Эпизод/Ep/E
    e_m = re.search(r'(?:[eE]pisode|[eE]p\.?|[сС]ерия|[сС]ер\.?|[эЭ]пизод)\s*(\d+)', base, re.I)
    if e_m:
        return (season, int(e_m.group(1)), _natural_keys(name))
    # 5. Match number before серия (e.g. "5 серия")
    e_m2 = re.search(r'(\d+)\s*(?:серия|сер|выпуск|эпизод)', base, re.I)
    if e_m2:
        return (season, int(e_m2.group(1)), _natural_keys(name))
    # 6. Anime / clean standalone episode number
    cleaned = re.sub(r'(?i)\b(1080p|720p|480p|2160p|4k|x264|x265|h264|h265|hevc|bdrip|web-dl|webrip|dvdrip|aac|dts|flac|mp3|rus|eng|jap|sub|dub)\b', ' ', base)
    cleaned = re.sub(r'\b(19\d\d|20\d\d)\b', ' ', cleaned)
    e_m3 = re.search(r'(?:^|[\s\-_\.#])(\d{1,4})(?:v\d)?(?:[\s\-_\.#]|$)', cleaned)
    if e_m3:
        return (season, int(e_m3.group(1)), _natural_keys(name))
    # 7. Fallback: natural sort
    return (season, 999999, _natural_keys(name))


class LibraryService:
    def __init__(self):
        self._torrent_episodes_cache: dict[str, list[dict]] = {}

    @staticmethod
    def _natural_keys(text):
        return _natural_keys(text)

    @staticmethod
    def _episode_sort_key(ep):
        return _episode_sort_key(ep)

    async def get_torrent_episodes(self, magnet: str, title: str = "", poster_path: str = "", ts=None) -> list[dict]:
        if not magnet:
            return []

        thash = extract_hash_from_magnet(magnet)
        if thash:
            thash = thash.lower()
            if thash in self._torrent_episodes_cache:
                return [dict(ep) for ep in self._torrent_episodes_cache[thash]]

        if not ts:
            sett = load_settings()
            ts = TorrServerManager(port=sett.get('torrserver_port', 8095))

        if not ts or not ts.ensure_running():
            logger.error("TorrServer is not running for get_torrent_episodes")
            return []

        video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
        extra_re = re.compile(r'(?i)\b(sample|trailer|bonus|featurette|preview)\b')

        add_res = ts.add_torrent(magnet, title=title, poster=poster_path)
        if add_res and isinstance(add_res, dict) and add_res.get('hash'):
            thash = add_res['hash'].lower()

        t_info = None
        files = extract_ts_files(add_res)
        if files:
            t_info = add_res
        else:
            for _ in range(30):
                if thash:
                    t_info = ts.get_torrent(thash)
                    files = extract_ts_files(t_info)
                    if files:
                        break
                await asyncio.sleep(0.5)

        files = extract_ts_files(t_info)
        episodes = []
        if t_info and files:
            for f in files:
                f_path = f.get('path', '')
                ext = os.path.splitext(f_path)[1].lower()
                length = int(f.get('length', 0))
                if (ext in video_exts and 
                        not extra_re.search(f_path) and 
                        not is_executable_release(f_path) and 
                        not is_unsupported_media_release(f_path)):
                    if length < 25 * 1024 * 1024 and len(files) > 1:
                        continue
                    episodes.append({
                        "index": int(f.get('id', 0)),
                        "name": os.path.basename(f_path),
                        "path": f_path,
                        "size": length,
                        "completed": 0,
                        "selected": False,
                        "downloaded": False
                    })
            episodes.sort(key=_episode_sort_key)
            if thash and episodes:
                self._torrent_episodes_cache[thash] = episodes

        return episodes

    async def get_episodes(self, mid: int, ts=None, dm=None) -> list[dict]:
        try:
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return []
            
            video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
            existing_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY file_name ASC", (mid,)).fetchall()
            
            magnet = m.get('magnet_uri')
            if not magnet and m.get('download_dir') and os.path.isdir(m.get('download_dir')):
                try:
                    for f in os.listdir(m['download_dir']):
                        if f.endswith('.torrent') and len(f) == 48:
                            th = f[:-8].lower()
                            magnet = f"magnet:?xt=urn:btih:{th}"
                            db.execute("UPDATE media SET magnet_uri=? WHERE id=?", (magnet, mid))
                            db.execute("UPDATE downloads SET magnet_uri=? WHERE media_id=?", (magnet, mid))
                            db.commit()
                            m = dict(m)
                            m['magnet_uri'] = magnet
                            break
                except Exception as ex:
                    logger.debug(f"Error checking local torrent file: {ex}")

            # 1. If purely local media (no magnet link attached), return indexed local files
            if not magnet and existing_files and len(existing_files) > 0:
                db.close()
                episodes = []
                for idx, f in enumerate(existing_files, 1):
                    if f['file_size'] < 100 * 1024:
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
                episodes.sort(key=_episode_sort_key)
                return episodes

            # 2. Get episodes list: from in-memory cache, DB cache, or TorrServer
            episodes = []
            thash = extract_hash_from_magnet(magnet) if magnet else None
            if thash:
                thash = thash.lower()

            if thash and thash in self._torrent_episodes_cache:
                episodes = [dict(ep) for ep in self._torrent_episodes_cache[thash]]
            else:
                cached_json = m['episodes_json'] if 'episodes_json' in m.keys() else None
                if cached_json:
                    try:
                        episodes = json.loads(cached_json) or []
                    except Exception as e:
                        logger.error(f"Error reading cached episodes: {e}")

            if not episodes and magnet:
                episodes = await self.get_torrent_episodes(magnet, title=m.get('title', ''), poster_path=m.get('poster_path', ''), ts=ts)
                if episodes:
                    try:
                        db.execute("UPDATE media SET episodes_json=? WHERE id=?", (json.dumps(episodes), mid))
                        db.commit()
                    except Exception as e:
                        logger.error(f"Error caching episodes in DB: {e}")

            # 3. Check aria2 active files first for exact download progress
            af_map = {}
            dl = db.execute("SELECT aria2_gid FROM downloads WHERE media_id=?", (mid,)).fetchone()
            if dl and dl.get('aria2_gid') and dm:
                try:
                    a_files = dm.get_files(dl['aria2_gid']) or []
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
                for idx, (f, fp, sz) in enumerate(sorted(disk_files, key=lambda x: _episode_sort_key(x[0])), 1):
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
                    cur_season, cur_ep_num, _ = _episode_sort_key(ep_name)
                    expected_sz = int(ep.get('size', 0))

                    af = af_map.get(ep_name_lower)
                    if not af and cur_ep_num != 999999:
                        for a_name, a_data in af_map.items():
                            a_s, a_e, _ = _episode_sort_key(a_name)
                            if a_e != 999999 and cur_ep_num == a_e and cur_season == a_s:
                                af = a_data
                                break

                    if af:
                        is_selected = (af.get('selected') == 'true')
                        c_len = int(af.get('completedLength', 0))
                        t_len = int(af.get('length', 0)) or expected_sz
                        is_complete = (t_len > 0 and c_len >= t_len)
                        ep['downloaded'] = is_complete
                        ep['selected'] = is_selected
                        # If not selected and not completed, bytes are boundary/unrelated pieces
                        ep['completed'] = t_len if is_complete else (c_len if (is_selected or is_complete) else 0)
                        if af.get('path') and os.path.isabs(af['path']):
                            ep['path'] = af['path']
                        continue

                    matched_df = None
                    for df_name, df_path, df_sz in disk_files:
                        if df_name.lower() == ep_name_lower:
                            matched_df = (df_name, df_path, df_sz)
                            break
                    if not matched_df and cur_ep_num != 999999:
                        for df_name, df_path, df_sz in disk_files:
                            df_s, df_e, _ = _episode_sort_key(df_name)
                            if df_e != 999999 and cur_ep_num == df_e and cur_season == df_s:
                                matched_df = (df_name, df_path, df_sz)
                                break

                    if matched_df:
                        df_name, df_path, df_sz = matched_df
                        ep['path'] = df_path
                        header_ok = is_header_ready(df_path)
                        is_sparse = False
                        try:
                            if df_sz > 0:
                                allocated = os.stat(df_path).st_blocks * 512
                                req_sz = expected_sz if expected_sz > 0 else df_sz
                                if allocated < req_sz * 0.95:
                                    is_sparse = True
                        except Exception:
                            pass

                        if expected_sz > 0:
                            is_complete = (df_sz >= expected_sz - 65536) and not os.path.exists(df_path + ".aria2") and not is_sparse and header_ok
                        else:
                            is_complete = (df_sz > 10 * 1024 * 1024) and not os.path.exists(df_path + ".aria2") and not is_sparse and header_ok

                        ep['downloaded'] = is_complete
                        ep['completed'] = df_sz if is_complete else 0
                        ep['selected'] = is_complete
                    else:
                        ep['downloaded'] = False
                        ep['completed'] = 0
                        ep['selected'] = False

            # Check media_files for any completed episodes recorded in DB
            m_files = db.execute("SELECT * FROM media_files WHERE media_id=? AND file_size > 102400", (mid,)).fetchall()
            if m_files:
                for ep in episodes:
                    if ep.get('downloaded'):
                        continue
                    ep_name = ep.get('name', '')
                    c_s, c_e, _ = _episode_sort_key(ep_name)
                    for mf in m_files:
                        mf_path = mf['file_path']
                        if not os.path.isfile(mf_path) or os.path.exists(mf_path + ".aria2"):
                            continue
                        # Sparse check: if blocks are not fully allocated, file is incomplete
                        try:
                            st = os.stat(mf_path)
                            if st.st_blocks * 512 < mf['file_size'] * 0.95:
                                continue
                        except Exception:
                            continue
                        if mf['file_name'].lower() == ep_name.lower():
                            ep['downloaded'] = True
                            ep['completed'] = mf['file_size']
                            ep['path'] = mf_path
                            ep['selected'] = True
                            break
                        if c_e != 999999:
                            m_s, m_e, _ = _episode_sort_key(mf['file_name'])
                            if m_e == c_e and m_s == c_s:
                                ep['downloaded'] = True
                                ep['completed'] = mf['file_size']
                                ep['path'] = mf_path
                                ep['selected'] = True
                                break

            # If there is no active or waiting aria2 task for this media, uncompleted episodes are NOT selected
            is_dl_active = False
            if dl and dl.get('aria2_gid') and dm:
                try:
                    cst = dm.get_status(dl['aria2_gid'])
                    if cst and cst.get('status') in ('active', 'waiting', 'paused'):
                        is_dl_active = True
                except Exception:
                    pass

            if not is_dl_active:
                for ep in episodes:
                    if not ep.get('downloaded'):
                        ep['selected'] = False

            db.close()
            episodes.sort(key=_episode_sort_key)
            return episodes
        except Exception as e:
            logger.error(f"LibraryService get_episodes error: {e}")
            return []

    async def get_library(self) -> list[dict]:
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
                m_files = db.execute("SELECT * FROM media_files WHERE media_id=? AND file_size > 102400 ORDER BY id ASC", (d['id'],)).fetchall()
                valid_files = []
                for f in m_files:
                    f_dict = dict(f)
                    has_aria2_companion = os.path.exists(fp + ".aria2")
                    if fp and os.path.isfile(fp) and is_header_ready(fp) and not has_aria2_companion:
                        valid_files.append(f_dict)
                    elif fp and os.path.isfile(fp) and not is_header_ready(fp):
                        try:
                            db.execute("DELETE FROM media_files WHERE id=?", (f_dict['id'],))
                            db.commit()
                        except Exception:
                            pass
                d['files'] = valid_files
                d['downloaded_episodes_count'] = len(valid_files)

                if valid_files and (not d.get('download_status') or d.get('download_status') in ('queued', 'cancelled')):
                    d['download_status'] = 'completed'
                    d['download_progress'] = 100.0
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

                # Проверка статусов для фильмов: ошибка или отсутствие файлов не могут быть 'completed'
                if d.get('media_type') != 'tv':
                    ddir = d.get('effective_download_dir') or d.get('download_dir') or ''
                    has_active_aria2 = False
                    if ddir and os.path.isdir(ddir):
                        try:
                            has_active_aria2 = any(f.endswith('.aria2') for _, _, fs in os.walk(ddir) for f in fs)
                        except Exception:
                            has_active_aria2 = False

                    if d.get('download_status') == 'error':
                        if not valid_files:
                            d['download_progress'] = 0.0
                    elif has_active_aria2 or d.get('download_status') in ('downloading', 'queued', 'paused'):
                        if has_active_aria2 and d.get('download_status') not in ('downloading', 'paused'):
                            d['download_status'] = 'downloading'
                    elif valid_files and not has_active_aria2:
                        d['download_status'] = 'completed'
                        d['download_progress'] = 100.0
                    elif d.get('download_status') == 'completed' and not valid_files:
                        d['download_status'] = 'error' if d.get('error_message') else 'catalog'
                        d['download_progress'] = 0.0

                # Проверка статусов для сериалов: если скорость 0 и нет активных .aria2 файлов, не показываем 'downloading'
                if d.get('media_type') == 'tv':
                    ddir = d.get('effective_download_dir') or d.get('download_dir') or ''
                    has_active_aria2 = False
                    if ddir and os.path.isdir(ddir):
                        try:
                            has_active_aria2 = any(f.endswith('.aria2') for _, _, fs in os.walk(ddir) for f in fs)
                        except Exception:
                            has_active_aria2 = False

                    if d.get('download_status') == 'downloading' and (d.get('download_speed') or 0) == 0 and not has_active_aria2:
                        if total_eps > 0 and len(valid_files) >= total_eps:
                            d['download_status'] = 'completed'
                            d['download_progress'] = 100.0
                        elif len(valid_files) > 0:
                            d['download_status'] = 'in_library'
                            d['download_progress'] = round((len(valid_files) / total_eps) * 100, 1) if total_eps > 0 else 0
                        else:
                            d['download_status'] = 'paused'
                        if d.get('download_id'):
                            try:
                                db.execute("UPDATE downloads SET status='paused', download_speed=0 WHERE id=?", (d['download_id'],))
                                db.commit()
                            except Exception:
                                pass
                    elif total_eps > 0 and len(valid_files) >= total_eps:
                        d['download_status'] = 'completed'
                    elif total_eps > 0 and len(valid_files) < total_eps and d.get('download_status') == 'completed':
                        d['download_status'] = 'in_library'

                result.append(d)
            return result
        finally:
            db.close()

    async def add_to_library(self, payload_json: str, dm=None, cleanup_cb=None) -> dict:
        try:
            data = json.loads(payload_json) if isinstance(payload_json, str) else (payload_json or {})
            magnet = data.get('magnet', '')
            tmdb_id = data.get('tmdb_id')
            title = data.get('title', '')
            year = data.get('year', '')
            mtype = data.get('media_type', 'movie')
            quality = data.get('quality', '')
            torrent_title = data.get('torrent_title', '')
            poster_path = data.get('poster_path', '')

            if is_executable_release(torrent_title, magnet):
                logger.warning(f"add_to_library blocked executable release: {torrent_title}")
                return {"success": False, "error": "Раздачи с исполняемыми файлами (.exe) запрещены"}
            backdrop_path = data.get('backdrop_path', '')
            overview = data.get('overview', '')
            in_lib = 1 if data.get('in_library', True) else 0

            sett = load_settings()
            base_dir = os.path.realpath(os.path.expanduser(sett.get('download_path') or VIDEO_DIR))
            folder = "Фильмы" if mtype == 'movie' else "Сериалы"
            safe_title = re.sub(r'[/\?%*:|"<>!]', '', title).strip() or "Media"
            ddir = os.path.join(base_dir, folder, f"{safe_title} ({year})".strip())
            os.makedirs(ddir, exist_ok=True)
            
            db = get_db()
            try:
                cursor = db.cursor()
                cursor.execute("SELECT id, in_library, magnet_uri FROM media WHERE tmdb_id=?", (tmdb_id,))
                row = cursor.fetchone()
                if not row:
                    init_hash = extract_hash_from_magnet(magnet).lower() if magnet else ''
                    init_eps = self._torrent_episodes_cache.get(init_hash) if init_hash else None
                    init_eps_json = json.dumps(init_eps) if init_eps else None
                    cursor.execute("""
                        INSERT INTO media (tmdb_id, title, year, media_type, poster_path, backdrop_path, overview,
                                           magnet_uri, torrent_title, quality, download_dir, in_library, status, episodes_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'catalog', ?)
                    """, (tmdb_id, title, year, mtype, poster_path, backdrop_path, overview,
                          magnet, torrent_title, quality, ddir, in_lib, init_eps_json))
                    mid = cursor.lastrowid
                else:
                    mid = row['id']
                    final_in_lib = 1 if (row['in_library'] == 1 or in_lib == 1) else 0
                    old_mag = row.get('magnet_uri') or ''
                    old_hash = extract_hash_from_magnet(old_mag) if old_mag else ''
                    new_hash = extract_hash_from_magnet(magnet) if magnet else ''
                    if old_hash: old_hash = old_hash.lower()
                    if new_hash: new_hash = new_hash.lower()

                    torrent_changed = bool(old_hash and new_hash and old_hash != new_hash)

                    if torrent_changed:
                        new_eps = self._torrent_episodes_cache.get(new_hash)
                        eps_json_val = json.dumps(new_eps) if new_eps else None
                        cursor.execute("""
                            UPDATE media 
                            SET title=?, year=?, media_type=?,
                                poster_path=COALESCE(NULLIF(poster_path, ''), ?),
                                backdrop_path=COALESCE(NULLIF(backdrop_path, ''), ?),
                                overview=COALESCE(NULLIF(overview, ''), ?),
                                magnet_uri=?, torrent_title=?, quality=?, download_dir=?, in_library=?,
                                episodes_json=?
                            WHERE id=?
                        """, (title, year, mtype, poster_path, backdrop_path, overview,
                              magnet, torrent_title, quality, ddir, final_in_lib, eps_json_val, mid))
                    else:
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
                            if cleanup_cb:
                                cleanup_cb(mid, ddir, dl_row.get('aria2_gid') or '', old_hash)
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
            logger.error(f"LibraryService add_to_library error: {e}")
            return {"success": False, "error": str(e)}

    async def delete_library_item(self, mid: int, dm=None) -> bool:
        db = get_db()
        try:
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            dl = db.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()

            if dm:
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
                    all_tasks = (dm.tell_active() or []) + (dm.tell_waiting() or []) + (dm.tell_stopped() or [])
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
                        if dl and dl.get('download_dir') and t_dir and os.path.abspath(t_dir) == os.path.abspath(dl['download_dir']):
                            gids_to_remove.add(t_gid)
                except Exception as e:
                    logger.warning(f"Error finding tasks to remove: {e}")

                for g in gids_to_remove:
                    try:
                        dm.remove(g)
                    except: pass
                    try:
                        dm._rpc_call("aria2.forceRemove", [g])
                    except: pass
                    try:
                        dm._rpc_call("aria2.removeDownloadResult", [g])
                    except: pass
                try:
                    dm.purge_download_result()
                except: pass

            files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in files:
                try:
                    fp = f.get('file_path')
                    if fp and os.path.isfile(fp):
                        os.remove(fp)
                    if fp and os.path.isfile(f"{fp}.aria2"):
                        os.remove(f"{fp}.aria2")
                except: pass

            dirs_to_clean = set()
            if m and m.get('download_dir'):
                dirs_to_clean.add(m['download_dir'])
            if dl and dl.get('download_dir'):
                dirs_to_clean.add(dl['download_dir'])

            for d in dirs_to_clean:
                if d and os.path.isdir(d):
                    try:
                        shutil.rmtree(d, ignore_errors=True)
                        logger.info(f"delete_library_item: removed download_dir {d}")
                    except Exception as e:
                        logger.warning(f"Error removing download_dir {d}: {e}")

            # Also update watch_history for this media item so is_downloaded = 0 and file_path = NULL
            try:
                db.execute(
                    "UPDATE watch_history SET is_downloaded = 0, file_path = NULL, is_online = 1 WHERE media_id = ?",
                    (mid,)
                )
                if m and m.get('tmdb_id'):
                    db.execute(
                        "UPDATE watch_history SET is_downloaded = 0, file_path = NULL, is_online = 1 WHERE tmdb_id = ?",
                        (m['tmdb_id'],)
                    )
                if m and m.get('title'):
                    db.execute(
                        "UPDATE watch_history SET is_downloaded = 0, file_path = NULL, is_online = 1 WHERE title = ?",
                        (m['title'],)
                    )
            except Exception as e:
                logger.warning(f"Error resetting watch_history on delete_library_item: {e}")

            db.execute("DELETE FROM media_files WHERE media_id=?", (mid,))
            db.execute("DELETE FROM downloads WHERE media_id=?", (mid,))
            db.execute("DELETE FROM media WHERE id=?", (mid,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"LibraryService delete_library_item error: {e}")
            return False
        finally:
            db.close()

    async def rescan_library(self) -> dict:
        try:
            sett = load_settings()
            dp = sett.get('download_path', '')
            count = await asyncio.to_thread(rescan_library_from_disk, dp)
            asyncio.create_task(asyncio.to_thread(auto_enrich_library_metadata))
            return {"success": True, "restored_count": count}
        except Exception as e:
            logger.error(f"LibraryService rescan_library RPC error: {e}")
            return {"success": False, "error": str(e), "restored_count": 0}


def rescan_library_from_disk(download_path: str = None, conn=None) -> int:
    """
    Scans download directories for existing downloaded movies/series and arbitrary video files
    (including loose videos, phone videos, legacy directories), indexes them into media,
    media_files and downloads, and enriches missing metadata from TMDB.
    """
    try:
        from .stream import is_header_ready
    except Exception:
        is_header_ready = lambda fp: True

    try:
        from .common import clean_media_title, auto_enrich_library_metadata
    except Exception:
        clean_media_title = lambda t: (t, None, False)
        auto_enrich_library_metadata = lambda c: 0

    should_close = False
    if conn is None:
        try:
            conn = sqlite3.connect(DB_PATH, timeout=10.0)
            conn.row_factory = sqlite3.Row
            should_close = True
        except Exception as e:
            logger.error(f"rescan_library_from_disk failed to connect to db: {e}")
            return 0

    video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v', '.wmv', '.flv', '.3gp', '.m2ts', '.mpg', '.mpeg'}
    restored_count = 0
    indexed_files = set()

    try:
        search_roots = []

        # 1. Актуальный путь загрузки из параметров или БД
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

        # 2. Стандартные домашние директории (Videos, Movies, Projacktor и legacy)
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

        # 3. MicroSD карты и внешние диски (/run/media/*/*)
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

        cursor = conn.cursor()

        categories = [
            ("Фильмы", "movie"),
            ("Movies", "movie"),
            ("Films", "movie"),
            ("Сериалы", "tv"),
            ("Series", "tv"),
            ("TV", "tv"),
            ("TV Shows", "tv"),
        ]

        def process_media_folder(item_dir: str, folder_name: str, media_type: str):
            nonlocal restored_count
            vfiles = []
            has_aria2 = False
            for dirpath, _, filenames in os.walk(item_dir):
                for fn in filenames:
                    if fn.endswith('.aria2'):
                        has_aria2 = True

            for dirpath, _, filenames in os.walk(item_dir):
                for fn in filenames:
                    ext = os.path.splitext(fn)[1].lower()
                    if ext in video_exts:
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

            if not vfiles:
                return

            clean_parsed, p_year, _ = clean_media_title(folder_name)
            parsed_title = clean_parsed or folder_name
            parsed_year = p_year

            # Точный поиск: сначала по download_dir, затем по названию и году
            row = None
            if item_dir:
                row = cursor.execute("""
                    SELECT id, in_library, download_dir, status FROM media 
                    WHERE download_dir = ?
                    ORDER BY id ASC LIMIT 1
                """, (item_dir,)).fetchone()

            if not row:
                if parsed_year is not None:
                    row = cursor.execute("""
                        SELECT id, in_library, download_dir, status FROM media 
                        WHERE (title = ? OR title = ?) AND year = ?
                        ORDER BY id ASC LIMIT 1
                    """, (parsed_title, folder_name, parsed_year)).fetchone()
                else:
                    row = cursor.execute("""
                        SELECT id, in_library, download_dir, status FROM media 
                        WHERE (title = ? OR title = ?)
                        ORDER BY id ASC LIMIT 1
                    """, (parsed_title, folder_name)).fetchone()

            detected_magnet = ''
            if item_dir and os.path.isdir(item_dir):
                try:
                    for f in os.listdir(item_dir):
                        if f.endswith('.torrent') and len(f) == 48:
                            detected_magnet = f"magnet:?xt=urn:btih:{f[:-8].lower()}"
                            break
                except Exception:
                    pass

            media_status = 'downloading' if has_aria2 else 'downloaded'
            if row:
                mid = row['id'] if isinstance(row, dict) else row[0]
                cursor.execute("""
                    UPDATE media 
                    SET in_library = 1, status = ?, download_dir = ?,
                        magnet_uri = COALESCE(NULLIF(magnet_uri, ''), ?)
                    WHERE id = ?
                """, (media_status, item_dir, detected_magnet, mid))
            else:
                cursor.execute("""
                    INSERT INTO media (title, year, media_type, in_library, status, download_dir, magnet_uri)
                    VALUES (?, ?, ?, 1, ?, ?, ?)
                """, (parsed_title, parsed_year, media_type, media_status, item_dir, detected_magnet))
                mid = cursor.lastrowid

            for fp, fn, sz in vfiles:
                mf_row = cursor.execute("""
                    SELECT id FROM media_files 
                    WHERE media_id = ? AND (file_path = ? OR file_name = ?)
                """, (mid, fp, fn)).fetchone()
                if not mf_row:
                    ep_num = None
                    season_num = 1
                    m_ep = re.search(r'(?i)(?:s\d{1,2}e|\bep?[-_\s]*)(\d{1,4})', fn)
                    if m_ep:
                        try:
                            ep_num = int(m_ep.group(1))
                        except Exception:
                            pass
                    cursor.execute("""
                        INSERT INTO media_files (media_id, file_path, file_name, file_size, season_number, episode_number)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (mid, fp, fn, sz, season_num, ep_num))

            dl_row = cursor.execute("SELECT id, status FROM downloads WHERE media_id = ?", (mid,)).fetchone()
            tot_sz = sum(vf[2] for vf in vfiles)
            dl_status = 'downloading' if has_aria2 else 'completed'
            dl_progress = 50.0 if has_aria2 else 100.0

            if not dl_row:
                cursor.execute("""
                    INSERT INTO downloads (
                        media_id, magnet_uri, torrent_title, status, progress, 
                        total_size, downloaded_size, download_dir, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (mid, detected_magnet, folder_name, dl_status, dl_progress, tot_sz, tot_sz, item_dir))
            else:
                dl_id = dl_row['id'] if isinstance(dl_row, dict) else dl_row[0]
                dl_st = dl_row['status'] if isinstance(dl_row, dict) else dl_row[1]
                if dl_st != 'completed' and not has_aria2:
                    cursor.execute("""
                        UPDATE downloads 
                        SET status = 'completed', progress = 100.0, total_size = ?, downloaded_size = ?
                        WHERE id = ?
                    """, (tot_sz, tot_sz, dl_id))

            restored_count += 1

        def process_single_video_file(fp: str, fn: str, sz: int, parent_dir: str):
            nonlocal restored_count
            indexed_files.add(fp)
            has_aria2 = os.path.exists(fp + ".aria2")

            clean_parsed, p_year, _ = clean_media_title(fn)
            file_title = clean_parsed or os.path.splitext(fn)[0]

            is_tv = bool(re.search(r'(?i)\b(s\d{1,2}e\d{1,2}|s\d{1,2}|season\s*\d+|сезон\s*\d+|серия\s*\d+)\b', fn))
            media_type = "tv" if is_tv else "movie"

            # Check if this exact file path is already in media_files
            mf_row = cursor.execute("""
                SELECT mf.media_id, m.id FROM media_files mf
                JOIN media m ON mf.media_id = m.id
                WHERE mf.file_path = ? LIMIT 1
            """, (fp,)).fetchone()

            media_status = 'downloading' if has_aria2 else 'downloaded'
            if mf_row:
                mid = mf_row['media_id'] if isinstance(mf_row, dict) else mf_row[0]
                cursor.execute("""
                    UPDATE media 
                    SET in_library = 1, status = ?, download_dir = ?
                    WHERE id = ?
                """, (media_status, parent_dir, mid))
            else:
                cursor.execute("""
                    INSERT INTO media (title, year, media_type, in_library, status, download_dir)
                    VALUES (?, ?, ?, 1, ?, ?)
                """, (file_title, p_year, media_type, media_status, parent_dir))
                mid = cursor.lastrowid

                ep_num = None
                m_ep = re.search(r'(?i)(?:s\d{1,2}e|\bep?[-_\s]*)(\d{1,4})', fn)
                if m_ep:
                    try:
                        ep_num = int(m_ep.group(1))
                    except Exception:
                        pass

                cursor.execute("""
                    INSERT INTO media_files (media_id, file_path, file_name, file_size, season_number, episode_number)
                    VALUES (?, ?, ?, ?, 1, ?)
                """, (mid, fp, fn, sz, ep_num))

            dl_row = cursor.execute("SELECT id, status FROM downloads WHERE media_id = ?", (mid,)).fetchone()
            dl_status = 'downloading' if has_aria2 else 'completed'
            dl_progress = 50.0 if has_aria2 else 100.0

            if not dl_row:
                cursor.execute("""
                    INSERT INTO downloads (
                        media_id, magnet_uri, torrent_title, status, progress, 
                        total_size, downloaded_size, download_dir, completed_at
                    ) VALUES (?, '', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (mid, fn, dl_status, dl_progress, sz, sz, parent_dir))
            else:
                dl_id = dl_row['id'] if isinstance(dl_row, dict) else dl_row[0]
                cursor.execute("""
                    UPDATE downloads 
                    SET status = ?, progress = ?, total_size = ?, downloaded_size = ?
                    WHERE id = ?
                """, (dl_status, dl_progress, sz, sz, dl_id))

            restored_count += 1

        for root in search_roots:
            if not os.path.isdir(root):
                continue

            # 1. Сканируем стандартные категории внутри папки
            for cat_name, media_type in categories:
                cat_dir = os.path.join(root, cat_name)
                if not os.path.isdir(cat_dir):
                    continue

                for folder_name in sorted(os.listdir(cat_dir)):
                    item_dir = os.path.join(cat_dir, folder_name)
                    if os.path.isdir(item_dir):
                        process_media_folder(item_dir, folder_name, media_type)

            # 2. Рекурсивное сканирование всех остальных папок и видеофайлов
            skip_dir_names = {
                'steam', 'steamapps', 'node_modules', '__pycache__', 
                '.thumbnails', '.cache', '.config', '.git'
            }
            known_cat_names = {c[0].lower() for c in categories}

            for dirpath, dirs, filenames in os.walk(root):
                # Исключаем скрытые и системные директории
                dirs[:] = [
                    d for d in dirs 
                    if not d.startswith('.') and d.lower() not in skip_dir_names and d.lower() not in known_cat_names
                ]

                # Проверяем, не является ли dirpath стандартной категорией
                if os.path.basename(dirpath).lower() in known_cat_names:
                    continue

                # Ищем неиндексированные видеофайлы в текущей директории
                if any(f.endswith('.aria2') for f in filenames):
                    continue

                local_vfiles = []

                for fn in filenames:
                    ext = os.path.splitext(fn)[1].lower()
                    if ext in video_exts and not fn.endswith('.aria2'):
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
                
                # Если это не корень и в папке собраны серии сериала или части релиза
                is_season_folder = any(kw in folder_name.lower() for kw in ["season", "сезон", "s0", "s1", "серии"])
                has_episode_files = sum(1 for _, fn, _ in local_vfiles if re.search(r'(?i)\b(s\d{1,2}e\d{1,4}|s\d{1,2}|\bep?[-_\s]*\d{1,4}|серия\s*\d+)\b', fn)) >= 2
                is_structured_release = (not is_root_dir) and (len(local_vfiles) > 1 and (is_season_folder or has_episode_files))

                if is_structured_release:
                    mtype = "tv"
                    process_media_folder(dirpath, folder_name, mtype)

                else:
                    # Одиночные файлы или файлы в общих папках (например, телефонные видео или отдельные фильмы)
                    for fp, fn, sz in local_vfiles:
                        process_single_video_file(fp, fn, sz, dirpath)

        conn.commit()

        # Автоматическое обогащение метаданных через TMDB (постеры, бэкдропы, описания)
        try:
            auto_enrich_library_metadata(conn)
        except Exception as e_meta:
            logger.debug(f"auto_enrich_library_metadata background check: {e_meta}")

        if restored_count > 0:
            logger.info(f"[rescan_library_from_disk] Successfully indexed {restored_count} media items into library")
    except Exception as e:
        logger.error(f"[rescan_library_from_disk] Error scanning disk media: {e}")
    finally:
        if should_close:
            conn.close()

    return restored_count
