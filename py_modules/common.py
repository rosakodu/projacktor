import time
import sqlite3

from .constants import DEFAULT_TMDB_API_KEY
from .core.env import (
    DECKY_USER_HOME,
    get_user_home,
    get_plugin_dir,
    CONFIG_DIR,
    SETTINGS_PATH,
    DECKY_SETTINGS_DIR,
    DECKY_SETTINGS_PATH,
    INITIAL_DOWNLOAD_PATH,
    VIDEO_DIR,
    get_all_settings_candidates,
    get_bin_path,
    get_steam_language,
    get_available_storage_drives,
    logger
)
from .core.process import (
    _clean_env,
    _build_gui_env,
    write_pid_file,
    read_pid_file,
    is_process_alive,
    terminate_process
)
from .core.hardware import (
    has_vaapi_support
)
from .core.network import (
    get_ssl_context,
    normalize_jacred_url,
    ping_jacred,
    POPULAR_TRACKERS
)
from .db import (
    get_db,
    DB_LOCK,
    DEFAULT_SETTINGS,
    db_get_setting,
    db_set_setting,
    db_get_all_settings,
    load_settings,
    save_settings,
    _get_all_settings_candidates,
    _read_settings_file
)
from .clients.tmdb import (
    clean_media_title,
    search_tmdb_metadata,
    get_tmdb_image_urls,
    build_image_url
)
from .clients.jacred import (
    is_executable_release,
    is_unsupported_media_release,
    is_blocked_tracker,
    detect_release_quality,
    DANGEROUS_EXT_REGEX,
    UNSUPPORTED_MEDIA_REGEX,
    BLOCKED_TRACKERS
)
from .clients.torrserver_client import extract_hash_from_magnet


def auto_enrich_library_metadata(conn=None) -> int:
    """
    Finds media entries in library that lack poster_path and queries TMDB to populate
    poster_path, backdrop_path, overview, tmdb_id, title and year.
    Returns count of enriched items.
    """
    should_close = False
    if conn is None:
        try:
            from .db import DB_PATH
            conn = sqlite3.connect(DB_PATH, timeout=10.0)
            conn.row_factory = sqlite3.Row
            should_close = True
        except Exception as e:
            logger.error(f"auto_enrich_library_metadata db error: {e}")
            return 0

    enriched = 0
    try:
        cursor = conn.cursor()
        rows = cursor.execute("""
            SELECT id, title, year, media_type, download_dir 
            FROM media 
            WHERE (poster_path IS NULL OR poster_path = '') AND in_library = 1
            ORDER BY id DESC
        """).fetchall()

        for r in rows:
            mid = r['id']
            raw_title = r['title']
            year = r['year']
            mtype = r['media_type'] or 'movie'

            meta = search_tmdb_metadata(raw_title, year=year, media_type=mtype)
            if meta and meta.get('poster_path'):
                cursor.execute("""
                    UPDATE media 
                    SET tmdb_id = COALESCE(?, tmdb_id),
                        title = ?,
                        year = COALESCE(?, year),
                        media_type = ?,
                        poster_path = ?,
                        backdrop_path = ?,
                        overview = ?,
                        vote_average = ?
                    WHERE id = ?
                """, (
                    meta.get('tmdb_id'),
                    meta.get('title'),
                    meta.get('year'),
                    meta.get('media_type', mtype),
                    meta.get('poster_path'),
                    meta.get('backdrop_path'),
                    meta.get('overview'),
                    meta.get('vote_average', 0.0),
                    mid
                ))
                enriched += 1
                logger.info(f"[TMDB Enrich] Enriched #{mid} '{raw_title}' -> '{meta.get('title')}' ({meta.get('year')})")
            time.sleep(0.15)

        if enriched > 0:
            conn.commit()
    except Exception as e:
        logger.error(f"auto_enrich_library_metadata error: {e}")
    finally:
        if should_close:
            conn.close()

    return enriched
