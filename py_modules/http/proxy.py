"""Proxy handlers for external APIs (/api/tmdb/*, /api/jacred/*, /api/torrserver/prewarm)."""

import threading

from ..core.env import logger
from ..db.settings_repo import load_settings
from ..clients.tmdb import TMDBClient
from ..clients.jacred import JacRedClient, normalize_jacred_url


def handle_tmdb(handler, path="", query=None):
    query = query or {}
    sett = load_settings()
    api_key = sett.get('tmdb_api_key')
    lang = sett.get('language', 'ru')
    endpoint = path.replace('/api/tmdb', '')
    q_params = {k: v[0] for k, v in query.items()}

    client = TMDBClient(api_key=api_key, language=lang)
    data, err = client.fetch_endpoint(endpoint, params=q_params)
    if data is not None:
        handler.send_json(data)
    else:
        handler.send_json({"error": str(err)}, 500)


def handle_jacred_search(handler, path="", query=None):
    query = query or {}
    sett = load_settings()
    url = normalize_jacred_url(sett.get('jacred_url') or '')
    if not url:
        handler.send_json([])
        return

    q = query.get('query', [''])[0]
    category = query.get('category', [''])[0]
    target_title = query.get('title', [None])[0] or query.get('target_title', [None])[0]
    original_title = query.get('original_title', [None])[0] or query.get('orig_title', [None])[0]
    year_raw = query.get('year', [None])[0]
    media_type = query.get('media_type', [None])[0]
    year = int(year_raw) if year_raw and year_raw.isdigit() else None

    client = JacRedClient(base_url=url)
    results = client.search(
        query=q,
        category=category,
        target_title=target_title,
        original_title=original_title,
        year=year,
        media_type=media_type,
    )
    handler.send_json(results)


def handle_jacred_status(handler, path="", query=None):
    sett = load_settings()
    url = normalize_jacred_url(sett.get('jacred_url') or '')
    if not url:
        handler.send_json({"status": False})
        return
    client = JacRedClient(base_url=url)
    handler.send_json({"status": client.ping(timeout=5)})


def handle_torrserver_prewarm(handler, path="", query=None):
    query = query or {}
    magnet = query.get('magnet', [''])[0]
    title = query.get('title', [''])[0]
    poster = query.get('poster', [''])[0]
    ts = getattr(handler.app_context, 'ts', None) if handler.app_context else None

    if magnet and ts:
        def _async():
            try:
                ts.ensure_running()
                ts.add_torrent(magnet, title=title, poster=poster)
            except Exception as e:
                logger.debug(f"[Prewarm] TorrServer async add error: {e}")
        threading.Thread(target=_async, daemon=True).start()

    handler.send_json({"success": True})
