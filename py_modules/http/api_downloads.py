"""Downloads API handlers for /api/downloads*."""

import os
import re

from ..core.env import logger
from ..db import get_db
from ..db.settings_repo import load_settings


def handle_downloads_list(handler, path="", query=None):
    db = get_db()
    try:
        dls = db.execute("""
            SELECT d.*, 
                   COALESCE(m.title, d.torrent_title, 'Медиа') AS title,
                   m.year, m.poster_path, m.backdrop_path, m.media_type, m.overview
            FROM downloads d
            LEFT JOIN media m ON d.media_id = m.id
            ORDER BY d.id DESC
        """).fetchall()
        handler.send_json([dict(row) for row in dls])
    finally:
        db.close()


def handle_downloads_stats(handler, path="", query=None):
    stats = handler.app_context.dm.get_global_stats() if (handler.app_context and handler.app_context.dm) else {}
    handler.send_json(stats or {})


def handle_downloads_add(handler, path="", query=None):
    body = handler.get_body()
    sett = load_settings()
    magnet, tmdb_id = body.get('magnet'), body.get('tmdb_id')
    title, year, mtype = body.get('title', 'Медиа'), body.get('year', ''), body.get('media_type', 'movie')
    quality = body.get('quality', '')
    poster_path, backdrop_path, overview = body.get('poster_path', ''), body.get('backdrop_path', ''), body.get('overview', '')

    base_dir = os.path.expanduser(sett['download_path'])
    folder = "Фильмы" if mtype == 'movie' else "Сериалы"
    safe_title = re.sub(r'[/\\?%*:|"<>!]', '', title).strip() or "Media"
    ddir = os.path.join(base_dir, folder, f"{safe_title} ({year})".strip())
    os.makedirs(ddir, exist_ok=True)

    gid = handler.app_context.dm.add_download(magnet, ddir) if (handler.app_context and handler.app_context.dm) else None
    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute("SELECT id FROM media WHERE tmdb_id=?", (tmdb_id,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("""
                INSERT INTO media (tmdb_id, title, year, media_type, poster_path, backdrop_path, overview)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tmdb_id, title, year, mtype, poster_path, backdrop_path, overview))
            mid = cursor.lastrowid
        else:
            mid = row['id']
            cursor.execute("""
                UPDATE media 
                SET poster_path=COALESCE(NULLIF(poster_path, ''), ?),
                    backdrop_path=COALESCE(NULLIF(backdrop_path, ''), ?),
                    overview=COALESCE(NULLIF(overview, ''), ?)
                WHERE id=?
            """, (poster_path, backdrop_path, overview, mid))

        cursor.execute("""
            INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
            VALUES (?, ?, ?, ?, ?, 'queued', ?)
        """, (mid, magnet, f"{title} ({quality})".strip(), ddir, gid, quality))
        new_dl_id = cursor.lastrowid
        db.commit()
    finally:
        db.close()
    handler.send_json({"success": True, "id": new_dl_id, "gid": gid})


def handle_downloads_resume_all(handler, path="", query=None):
    if handler.app_context and handler.app_context.dm:
        handler.app_context.dm.unpause_all()
    db = get_db()
    try:
        cursor = db.cursor()
        rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
        if handler.app_context and handler.app_context.dm:
            for r in rows:
                if r['aria2_gid']:
                    try:
                        handler.app_context.dm.resume(r['aria2_gid'])
                    except Exception as e:
                        logger.warning(f"Failed to resume GID {r['aria2_gid']}: {e}")
        cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
        db.commit()
    finally:
        db.close()
    if handler.app_context and handler.app_context.dm:
        handler.app_context.dm._update_db()
    handler.send_json({"success": True})


def handle_downloads_patch(handler, path="", query=None):
    did = path.split('/')[-1]
    body = handler.get_body()
    act = body.get('action')
    db = get_db()
    try:
        row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
    finally:
        db.close()
    if row and row['aria2_gid'] and handler.app_context and handler.app_context.dm:
        gid = row['aria2_gid']
        if act == 'pause':
            handler.app_context.dm.pause(gid)
        elif act == 'resume':
            handler.app_context.dm.resume(gid)
    handler.send_json({"success": True})


def handle_downloads_delete(handler, path="", query=None):
    did = path.split('/')[-1]
    db = get_db()
    try:
        row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
        if row and row['aria2_gid'] and handler.app_context and handler.app_context.dm:
            handler.app_context.dm.remove(row['aria2_gid'])
        db.execute("DELETE FROM downloads WHERE id=?", (did,))
        db.commit()
    finally:
        db.close()
    handler.send_json({"success": True})
