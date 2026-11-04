"""Library API handlers for /api/library*."""

import os

from ..core.env import logger
from ..db import get_db


def handle_library_list(handler, path="", query=None):
    db = get_db()
    try:
        rows = db.execute("""
            SELECT m.*, 
                   COUNT(f.id) AS file_count, 
                   COALESCE(SUM(f.file_size), 0) AS total_file_size,
                   d.id AS download_id, d.status AS download_status, d.progress AS download_progress,
                   d.download_speed, d.total_size AS download_total_size, d.downloaded_size AS download_downloaded_size,
                   d.aria2_gid, COALESCE(m.magnet_uri, d.magnet_uri) AS effective_magnet,
                   COALESCE(m.quality, d.quality) AS effective_quality,
                   COALESCE(m.torrent_title, d.torrent_title) AS effective_torrent_title,
                   COALESCE(m.download_dir, d.download_dir) AS effective_download_dir
            FROM media m
            LEFT JOIN media_files f ON m.id = f.media_id
            LEFT JOIN downloads d ON m.id = d.media_id
            WHERE m.in_library = 1 OR d.id IS NOT NULL OR f.id IS NOT NULL
            GROUP BY m.id
            ORDER BY m.id DESC
        """).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            m_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY id ASC", (d['id'],)).fetchall()
            files_list = [dict(f) for f in m_files]
            if not files_list and d.get('effective_download_dir') and os.path.isdir(d['effective_download_dir']):
                for root, _, fnames in os.walk(d['effective_download_dir']):
                    for fn in sorted(fnames):
                        if os.path.splitext(fn)[1].lower() in {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}:
                            fp = os.path.join(root, fn)
                            if not os.path.exists(fp + ".aria2"):
                                try:
                                    sz = os.path.getsize(fp)
                                except Exception:
                                    sz = 0
                                files_list.append({"file_path": fp, "file_name": fn, "file_size": sz})
            d['files'] = files_list
            result.append(d)
        handler.send_json(result)
    finally:
        db.close()


def handle_library_details(handler, path="", query=None):
    lid = path.split('/')[-1]
    if not lid.isdigit():
        handler.send_response(404)
        handler.end_headers()
        return
    db = get_db()
    try:
        media = db.execute("SELECT * FROM media WHERE id=?", (lid,)).fetchone()
        files = db.execute("SELECT * FROM media_files WHERE media_id=?", (lid,)).fetchall()
        if media:
            res = dict(media)
            res['files'] = [dict(f) for f in files]
            handler.send_json(res)
        else:
            handler.send_json({"error": "not found"}, 404)
    finally:
        db.close()


def handle_library_patch(handler, path="", query=None):
    lid = path.split('/')[-1]
    body = handler.get_body()
    db = get_db()
    try:
        db.execute("UPDATE media_files SET watch_progress=?, watched=? WHERE id=?", (body.get('progress', 0), body.get('watched', 0), lid))
        db.commit()
    finally:
        db.close()
    handler.send_json({"success": True})


def handle_library_delete(handler, path="", query=None):
    mid = path.split('/')[-1]
    db = get_db()
    try:
        files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
        for f in files:
            try:
                os.remove(f['file_path'])
            except Exception as e:
                logger.warning(f"Error removing file {f.get('file_path')}: {e}")
        db.execute("DELETE FROM media WHERE id=?", (mid,))
        db.commit()
    finally:
        db.close()
    handler.send_json({"success": True})
