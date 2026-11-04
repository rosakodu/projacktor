"""Local file streaming and path traversal security validation."""

import os
import re
import shutil
import time
import threading
import urllib.parse

from ..core.env import CONFIG_DIR, get_user_home, logger
from ..db import get_db
from ..db.settings_repo import load_settings

_HEAL_LOCK = threading.Lock()
_HEAL_IN_FLIGHT = {}
_HEAL_LAST_ATTEMPT = {}
_HEAL_COOLDOWN = 30.0


def clear_auto_heal_cache():
    """Clears in-memory auto-heal state (for testing)."""
    with _HEAL_LOCK:
        _HEAL_IN_FLIGHT.clear()
        _HEAL_LAST_ATTEMPT.clear()



def check_stream_security(handler, source: str, is_http: bool, filepath: str):
    """Validates path traversal for local paths and loopback origin for HTTP streams."""
    if not is_http:
        real_path = os.path.realpath(source)
        sett = load_settings()
        allowed_dirs = [
            os.path.realpath(os.path.expanduser(sett.get('download_path', '~/Videos/Projacktor'))),
            os.path.realpath(CONFIG_DIR),
            "/run/media",
            get_user_home()
        ]
        if not any(real_path.startswith(ad) for ad in allowed_dirs):
            logger.warning(f"Path traversal attempt blocked: {filepath}")
            handler.send_response(403)
            handler.send_cors_headers()
            handler.end_headers()
            return None
        if not os.path.exists(real_path):
            handler.send_response(404)
            handler.send_cors_headers()
            handler.end_headers()
            return None
        return real_path

    parsed = urllib.parse.urlparse(source)
    if parsed.hostname not in ['127.0.0.1', 'localhost', '::1']:
        logger.warning(f"External stream URL rejected: {source}")
        handler.send_response(403)
        handler.send_cors_headers()
        handler.end_headers()
        return None
    _auto_heal_torrserver(handler, parsed)
    return source


def _auto_heal_torrserver(handler, parsed):
    ts = getattr(handler.app_context, 'ts', None) if handler.app_context else None
    if not ts or 'link=' not in parsed.query:
        return

    qs = urllib.parse.parse_qs(parsed.query)
    thash = (qs.get('link', [''])[0] or '').lower()
    if not thash:
        return

    now = time.time()
    my_event = None
    with _HEAL_LOCK:
        if thash in _HEAL_IN_FLIGHT:
            event = _HEAL_IN_FLIGHT[thash]
        else:
            event = None
            if now - _HEAL_LAST_ATTEMPT.get(thash, 0) < _HEAL_COOLDOWN:
                return
            my_event = threading.Event()
            _HEAL_IN_FLIGHT[thash] = my_event

    if event:
        event.wait(timeout=10.0)
        return

    try:
        ts.ensure_running()
        t_info = ts.get_torrent(thash)
        is_present = (
            isinstance(t_info, dict)
            and not t_info.get('error')
            and (t_info.get('hash') or 'stat' in t_info or t_info.get('title') or t_info.get('data'))
        )
        if is_present:
            return

        db = get_db()
        try:
            row = db.execute("SELECT magnet_uri, title, poster_path FROM media WHERE magnet_uri LIKE ? LIMIT 1", (f"%{thash}%",)).fetchone()
            if not row:
                row = db.execute("SELECT magnet_uri, torrent_title as title, '' as poster_path FROM downloads WHERE magnet_uri LIKE ? LIMIT 1", (f"%{thash}%",)).fetchone()
            mag = row['magnet_uri'] if (row and row['magnet_uri']) else f"magnet:?xt=urn:btih:{thash}"
            ts.add_torrent(mag, title=row['title'] if row else "", poster=row['poster_path'] if row else "")
            logger.info(f"[Stream] Auto-healed missing torrent in TorrServer: {thash}")
        finally:
            db.close()
    except Exception as e:
        logger.debug(f"[Stream] Auto-heal TorrServer error: {e}")
    finally:
        with _HEAL_LOCK:
            _HEAL_LAST_ATTEMPT[thash] = time.time()
            _HEAL_IN_FLIGHT.pop(thash, None)
            if len(_HEAL_LAST_ATTEMPT) > 100:
                cutoff = time.time() - 300
                for k in list(_HEAL_LAST_ATTEMPT.keys()):
                    if _HEAL_LAST_ATTEMPT[k] < cutoff:
                        del _HEAL_LAST_ATTEMPT[k]
        if my_event:
            my_event.set()


def stream_local_file(handler, source: str):
    """Streams native local video file using HTTP 206 Partial Content or 200 OK."""
    if not os.path.exists(source):
        handler.send_response(404)
        handler.end_headers()
        return
    file_size = os.path.getsize(source)
    range_header = handler.headers.get('Range', None)
    local_mime = "video/webm" if os.path.splitext(source)[1].lower() == ".webm" else "video/mp4"

    if range_header:
        m = re.search(r'bytes=(\d+)-(\d*)', range_header)
        if m:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else file_size - 1
            if start > end or start >= file_size:
                handler.send_response(416)
                handler.send_cors_headers()
                handler.send_header('Content-Range', f'bytes */{file_size}')
                handler.end_headers()
                return
            end = min(end, file_size - 1)
            handler.send_response(206)
            handler.send_cors_headers()
            handler.send_header('Content-Type', local_mime)
            handler.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            handler.send_header('Accept-Ranges', 'bytes')
            handler.send_header('Content-Length', str(end - start + 1))
            handler.end_headers()
            with open(source, 'rb') as f:
                f.seek(start)
                to_read = end - start + 1
                while to_read > 0:
                    data = f.read(min(1024 * 1024, to_read))
                    if not data:
                        break
                    try:
                        handler.wfile.write(data)
                    except Exception:
                        break
                    to_read -= len(data)
            return

    handler.send_response(200)
    handler.send_cors_headers()
    handler.send_header('Content-Type', local_mime)
    handler.send_header('Content-Length', str(file_size))
    handler.send_header('Accept-Ranges', 'bytes')
    handler.end_headers()
    with open(source, 'rb') as f:
        try:
            shutil.copyfileobj(f, handler.wfile)
        except Exception:
            pass
