"""Watch history domain service for Projacktor."""

import os
import re
import json
import urllib.parse
from datetime import datetime

from ..db import get_db, logger, VIDEO_DIR
from ..common import POPULAR_TRACKERS


class HistoryService:
    def __init__(self, context=None):
        self.context = context

    @staticmethod
    def _build_in_where(conditions: list[tuple[str, set]]) -> tuple[str, list]:
        clauses = []
        params = []
        for column, values in conditions:
            if values:
                vals = list(values)
                placeholders = ",".join("?" for _ in vals)
                clauses.append(f"{column} IN ({placeholders})")
                params.extend(vals)
        return " OR ".join(clauses), params

    def _prefetch_watch_history_maps(self, db, rows: list) -> tuple[dict, dict, dict, dict, dict, dict, dict]:
        """Batch-prefetch media_files, media metadata, and latest download status for watch_history rows."""
        media_ids = {r['media_id'] for r in rows if r.get('media_id')}
        tmdb_ids = {r['tmdb_id'] for r in rows if r.get('tmdb_id')}
        titles = {r['title'] for r in rows if r.get('title')}

        mf_by_tmdb: dict = {}
        mf_by_title: dict = {}
        mf_where, mf_params = self._build_in_where([("m.tmdb_id", tmdb_ids), ("m.title", titles)])
        if mf_where:
            for mf in db.execute(f"""
                SELECT f.file_path, m.tmdb_id, m.title FROM media_files f
                JOIN media m ON f.media_id = m.id
                WHERE {mf_where}
                ORDER BY f.id ASC
            """, mf_params).fetchall():
                if mf.get('tmdb_id'):
                    mf_by_tmdb.setdefault(mf['tmdb_id'], mf['file_path'])
                if mf.get('title'):
                    mf_by_title.setdefault(mf['title'], mf['file_path'])

        media_by_id: dict = {}
        media_by_tmdb: dict = {}
        media_by_title: dict = {}
        dl_tmdb_ids = set(tmdb_ids)
        m_where, m_params = self._build_in_where([("id", media_ids), ("tmdb_id", tmdb_ids), ("title", titles)])
        if m_where:
            for m_row in db.execute(f"""
                SELECT id, tmdb_id, title, poster_path, backdrop_path FROM media
                WHERE {m_where}
                ORDER BY id ASC
            """, m_params).fetchall():
                media_by_id[m_row['id']] = m_row
                if m_row.get('tmdb_id'):
                    media_by_tmdb.setdefault(m_row['tmdb_id'], m_row)
                    dl_tmdb_ids.add(m_row['tmdb_id'])
                if m_row.get('title'):
                    media_by_title.setdefault(m_row['title'], m_row)

        dl_by_media_id: dict = {}
        dl_by_tmdb_id: dict = {}
        dl_where, dl_params = self._build_in_where([("d.media_id", media_ids), ("m.tmdb_id", dl_tmdb_ids)])
        if dl_where:
            for dl_row in db.execute(f"""
                SELECT d.media_id, d.status, m.tmdb_id FROM downloads d
                LEFT JOIN media m ON d.media_id = m.id
                WHERE {dl_where}
                ORDER BY d.id DESC
            """, dl_params).fetchall():
                if dl_row.get('media_id'):
                    dl_by_media_id.setdefault(dl_row['media_id'], dl_row['status'])
                if dl_row.get('tmdb_id'):
                    dl_by_tmdb_id.setdefault(dl_row['tmdb_id'], dl_row['status'])

        return mf_by_tmdb, mf_by_title, media_by_id, media_by_tmdb, media_by_title, dl_by_media_id, dl_by_tmdb_id

    def get_watch_history(self) -> list[dict]:
        db = get_db()
        try:
            rows = db.execute("SELECT * FROM watch_history ORDER BY watched_at DESC LIMIT 100").fetchall()
            if not rows:
                return []

            (
                mf_by_tmdb,
                mf_by_title,
                media_by_id,
                media_by_tmdb,
                media_by_title,
                dl_by_media_id,
                dl_by_tmdb_id,
            ) = self._prefetch_watch_history_maps(db, rows)

            items = []
            for r in rows:
                d = dict(r)
                local_file = None
                if d.get('file_path') and os.path.isfile(d.get('file_path')):
                    local_file = d['file_path']
                else:
                    if d.get('tmdb_id'):
                        mf_path = mf_by_tmdb.get(d['tmdb_id'])
                        if mf_path and os.path.isfile(mf_path):
                            local_file = mf_path
                    if not local_file and d.get('title'):
                        mf_path = mf_by_title.get(d['title'])
                        if mf_path and os.path.isfile(mf_path):
                            local_file = mf_path

                m_row = None
                if d.get('media_id'):
                    m_row = media_by_id.get(d['media_id'])
                if not m_row and d.get('tmdb_id'):
                    m_row = media_by_tmdb.get(d['tmdb_id'])
                if not m_row and d.get('title'):
                    m_row = media_by_title.get(d['title'])

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
                    d['file_path'] = None
                    d['is_online'] = 1
                    # Self-heal SQLite database if it was marked as downloaded but file is gone
                    if r.get('is_downloaded') or (r.get('file_path') and not os.path.isfile(r['file_path'])):
                        try:
                            db.execute(
                                "UPDATE watch_history SET is_downloaded=0, file_path=NULL, is_online=1 WHERE id=?",
                                (d['id'],)
                            )
                            db.commit()
                        except Exception as e:
                            logger.warning(f"Failed to sync watch_history item {d.get('id')}: {e}")

                    # If stream_url pointed to a local file that is now gone, clear it
                    if d.get('stream_url') and 'file=' in d['stream_url']:
                        m = re.search(r'[?&]file=([^&]+)', d['stream_url'])
                        if m:
                            unquoted = urllib.parse.unquote(m.group(1))
                            if not os.path.isfile(unquoted):
                                d['stream_url'] = None
                                try:
                                    db.execute("UPDATE watch_history SET stream_url=NULL WHERE id=?", (d['id'],))
                                    db.commit()
                                except Exception:
                                    pass

                    if d.get('media_id') and d['media_id'] in dl_by_media_id:
                        dl_status = dl_by_media_id[d['media_id']]
                    elif d.get('tmdb_id') and d['tmdb_id'] in dl_by_tmdb_id:
                        dl_status = dl_by_tmdb_id[d['tmdb_id']]
                d['download_status'] = dl_status
                items.append(d)
            return items
        finally:
            db.close()

    def save_watch_progress(self, data) -> bool:
        try:
            body = json.loads(data) if isinstance(data, str) else (data or {})
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
            logger.error(f"HistoryService save_watch_progress error: {e}")
            return False

    async def start_history_download(self, history_id: int, library_service=None, download_service=None, dm=None) -> dict:
        library_service = library_service or (self.context.library if self.context else None)
        download_service = download_service or (self.context.downloads if self.context else None)
        dm = dm or (self.context.dm if self.context else None)
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

            if not m.get('magnet_uri') and h.get('torrent_hash'):
                hash_val = h['torrent_hash']
                trackers = "&".join(f"tr={urllib.parse.quote(t)}" for t in POPULAR_TRACKERS[:5])
                m_magnet = f"magnet:?xt=urn:btih:{hash_val}&{trackers}"
                db.execute("UPDATE media SET magnet_uri=? WHERE id=?", (m_magnet, mid))

            if not m.get('download_dir'):
                m_type = m.get('media_type') or 'movie'
                m_dir = os.path.join(VIDEO_DIR, "Фильмы" if m_type == 'movie' else "Сериалы", m['title'])
                db.execute("UPDATE media SET download_dir=? WHERE id=?", (m_dir, mid))

            db.execute("UPDATE media SET in_library=1 WHERE id=?", (mid,))
            db.commit()

            file_idx_str = ""
            media_type = m.get('media_type') or h.get('media_type') or 'movie'
            ep_num = h.get('episode_number')
            ep_name = h.get('episode_name') or ''
            file_path = h.get('file_path') or ''

            if media_type == 'tv' or ep_num is not None or ep_name:
                try:
                    episodes = await library_service.get_episodes(mid)
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
                            _, parsed_ep, _ = library_service._episode_sort_key(ep.get('name', ''))
                            if parsed_ep == ep_num:
                                matched_ep = ep
                                break
                    if matched_ep and matched_ep.get('index') is not None:
                        file_idx_str = str(matched_ep['index'])
                except Exception as e:
                    logger.warning(f"Failed to resolve episode file index for history item {history_id}: {e}")

            if file_idx_str:
                res = await download_service.download_episode(mid, int(file_idx_str), dm, library_service)
            else:
                res = await download_service.start_download(mid, "", dm)
            if dm:
                dm.sync_once()
            return {"success": True, "media_id": mid, "result": res}
        except Exception as e:
            logger.error(f"HistoryService start_history_download error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            try:
                db.close()
            except Exception:
                pass

    def delete_watch_history_item(self, item_id: int) -> bool:
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watch_history WHERE id=?", (item_id,))
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"HistoryService delete_watch_history_item error: {e}")
            return False

    def clear_watch_history(self) -> bool:
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watch_history")
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"HistoryService clear_watch_history error: {e}")
            return False
