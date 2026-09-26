import os
import shutil
import sqlite3
import threading
import re

# Decky Loader API
try:
    import decky
    logger = decky.logger
    DECKY_USER_HOME = decky.DECKY_USER_HOME
except ImportError:
    import logging
    logger = logging.getLogger("Projacktor")
    logger.setLevel(logging.DEBUG)
    DECKY_USER_HOME = os.environ.get("DECKY_USER_HOME", "/home/deck")

def get_user_home():
    return DECKY_USER_HOME

_legacy_cfg1 = os.path.join(get_user_home(), ".config", "projactor")
_legacy_cfg2 = os.path.join(get_user_home(), ".config", "projecktor")
_default_cfg = os.path.join(get_user_home(), ".config", "projacktor")
if os.path.isdir(_default_cfg):
    CONFIG_DIR = _default_cfg
elif os.path.isdir(_legacy_cfg1):
    CONFIG_DIR = _legacy_cfg1
elif os.path.isdir(_legacy_cfg2):
    CONFIG_DIR = _legacy_cfg2
else:
    CONFIG_DIR = _default_cfg

_db_projacktor = os.path.join(CONFIG_DIR, "projacktor.db")
_db_legacy = os.path.join(CONFIG_DIR, "projactor.db")

# Multi-location restoration check: if projacktor.db missing/empty, restore from backup or legacy paths
if not os.path.isfile(_db_projacktor) or os.path.getsize(_db_projacktor) == 0:
    for candidate in [
        _db_projacktor + ".bak",
        _db_legacy,
        os.path.join(get_user_home(), ".config", "projactor", "projacktor.db"),
        os.path.join(get_user_home(), ".config", "projecktor", "projacktor.db"),
        os.path.join(get_user_home(), "homebrew", "data", "Projacktor", "projacktor.db"),
        os.path.join(get_user_home(), "homebrew", "settings", "Projacktor", "projacktor.db"),
    ]:
        if os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
            try:
                os.makedirs(CONFIG_DIR, exist_ok=True)
                shutil.copy2(candidate, _db_projacktor)
                logger.info(f"Restored database from {candidate} -> {_db_projacktor}")
                break
            except Exception as e:
                logger.warning(f"Could not restore db from {candidate}: {e}")

if os.path.isfile(_db_projacktor) and os.path.getsize(_db_projacktor) > 0:
    DB_PATH = _db_projacktor
elif os.path.isfile(_db_legacy) and os.path.getsize(_db_legacy) > 0:
    DB_PATH = _db_legacy
else:
    DB_PATH = _db_projacktor
SETTINGS_PATH = os.path.join(CONFIG_DIR, "settings.json")

DECKY_SETTINGS_DIR = os.environ.get("DECKY_PLUGIN_SETTINGS_DIR") or os.path.join(get_user_home(), "homebrew", "settings", "Projacktor")
DECKY_SETTINGS_PATH = os.path.join(DECKY_SETTINGS_DIR, "settings.json")

# Default Video path: Projacktor (fall back to legacy paths if they exist)
_legacy_video1 = os.path.join(get_user_home(), "Video", "Projactor")
_legacy_video2 = os.path.join(get_user_home(), "Video", "Projecktor")
_legacy_movies = os.path.join(get_user_home(), "Movies", "Projacktor")
_default_video = os.path.join(get_user_home(), "Videos", "Projacktor")
if os.path.isdir(_default_video):
    INITIAL_DOWNLOAD_PATH = _default_video
elif os.path.isdir(_legacy_movies):
    INITIAL_DOWNLOAD_PATH = _legacy_movies
elif os.path.isdir(_legacy_video1):
    INITIAL_DOWNLOAD_PATH = _legacy_video1
elif os.path.isdir(_legacy_video2):
    INITIAL_DOWNLOAD_PATH = _legacy_video2
else:
    INITIAL_DOWNLOAD_PATH = _default_video

VIDEO_DIR = INITIAL_DOWNLOAD_PATH

DEFAULT_SETTINGS = {
    "jacred_url": "",
    "tmdb_api_key": "4ef0d7355d9ffb5151e987764708ce96",
    "download_path": INITIAL_DOWNLOAD_PATH,
    "language": "ru",
    "aria2_port": 6800,
    "torrserver_port": 8095,
    "transcode_max_res": "auto"
}

# Мьютекс для предотвращения состояния гонки (Race condition) между параллельными потоками
DB_LOCK = threading.RLock()

class SafeRow(dict):
    """
    Универсальный класс строки SQLite, совмещающий доступ по ключам d['col'],
    безопасный метод d.get('col', default), доступ по числовому индексу d[0],
    а также методы keys(), values() и сериализацию.
    """
    def __init__(self, cursor, row):
        super().__init__()
        self._values = row
        for idx, col in enumerate(cursor.description):
            self[col[0]] = row[idx]

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self.get(key, None)

    def __getattr__(self, key):
        return self.get(key, None)

def get_db():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = lambda c, r: SafeRow(c, r)
    return conn

def init_db():
    with DB_LOCK:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        if os.path.isfile(DB_PATH) and os.path.getsize(DB_PATH) > 0:
            try:
                shutil.copy2(DB_PATH, DB_PATH + ".bak")
            except Exception:
                pass
        conn = sqlite3.connect(DB_PATH, timeout=20.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()
        cursor.executescript('''
        CREATE TABLE IF NOT EXISTS plugin_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER UNIQUE,
            imdb_id TEXT,
            media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
            title TEXT NOT NULL,
            original_title TEXT,
            year INTEGER,
            overview TEXT,
            poster_path TEXT,
            backdrop_path TEXT,
            vote_average REAL DEFAULT 0,
            genres TEXT,
            runtime INTEGER,
            status TEXT DEFAULT 'catalog' CHECK(status IN ('catalog','downloading','downloaded','watched')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS media_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER DEFAULT 0,
            season_number INTEGER,
            episode_number INTEGER,
            episode_title TEXT,
            watched BOOLEAN DEFAULT 0,
            watch_progress INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
            magnet_uri TEXT NOT NULL,
            torrent_title TEXT,
            quality TEXT,
            tracker TEXT,
            status TEXT DEFAULT 'queued' CHECK(status IN ('queued','downloading','seeding','paused','completed','error')),
            progress REAL DEFAULT 0,
            download_speed INTEGER DEFAULT 0,
            upload_speed INTEGER DEFAULT 0,
            total_size INTEGER DEFAULT 0,
            downloaded_size INTEGER DEFAULT 0,
            aria2_gid TEXT,
            download_dir TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            error_message TEXT
        );
        CREATE TABLE IF NOT EXISTS poster_cache (
            tmdb_id INTEGER NOT NULL,
            image_type TEXT NOT NULL CHECK(image_type IN ('poster', 'backdrop')),
            local_path TEXT NOT NULL,
            url TEXT NOT NULL,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tmdb_id, image_type)
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER UNIQUE,
            media_type TEXT NOT NULL DEFAULT 'movie',
            title TEXT NOT NULL,
            original_title TEXT,
            year TEXT,
            overview TEXT,
            poster_path TEXT,
            backdrop_path TEXT,
            vote_average REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_watchlist_tmdb_id ON watchlist(tmdb_id);

        CREATE TABLE IF NOT EXISTS watch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER,
            file_id INTEGER,
            tmdb_id INTEGER,
            title TEXT NOT NULL,
            original_title TEXT,
            media_type TEXT DEFAULT 'movie',
            year TEXT,
            poster_path TEXT,
            backdrop_path TEXT,
            overview TEXT,
            file_path TEXT,
            stream_url TEXT,
            torrent_hash TEXT,
            is_online BOOLEAN DEFAULT 0,
            is_downloaded INTEGER DEFAULT 0,
            episode_name TEXT,
            season_number INTEGER,
            episode_number INTEGER,
            current_time REAL DEFAULT 0,
            duration REAL DEFAULT 0,
            progress REAL DEFAULT 0,
            watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_media_files_media_id ON media_files(media_id);
        CREATE INDEX IF NOT EXISTS idx_downloads_media_id ON downloads(media_id);
        CREATE INDEX IF NOT EXISTS idx_downloads_aria2_gid ON downloads(aria2_gid);
        CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
        ''')

        # Safe migration for watch_history to drop NOT NULL constraint on media_id if present
        try:
            cursor.execute("PRAGMA table_info(watch_history)")
            wh_cols = cursor.fetchall()
            needs_wh_migration = any(c[1] == 'media_id' and c[3] == 1 for c in wh_cols)
            if needs_wh_migration:
                logger.info("Migrating watch_history to remove NOT NULL constraint on media_id")
                cursor.execute("ALTER TABLE watch_history RENAME TO watch_history_old")
                cursor.execute("""
                    CREATE TABLE watch_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        media_id INTEGER,
                        file_id INTEGER,
                        tmdb_id INTEGER,
                        title TEXT NOT NULL,
                        original_title TEXT,
                        media_type TEXT DEFAULT 'movie',
                        year TEXT,
                        poster_path TEXT,
                        backdrop_path TEXT,
                        overview TEXT,
                        file_path TEXT,
                        stream_url TEXT,
                        torrent_hash TEXT,
                        is_online BOOLEAN DEFAULT 0,
                        is_downloaded INTEGER DEFAULT 0,
                        episode_name TEXT,
                        season_number INTEGER,
                        episode_number INTEGER,
                        current_time REAL DEFAULT 0,
                        duration REAL DEFAULT 0,
                        progress REAL DEFAULT 0,
                        watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cursor.execute("PRAGMA table_info(watch_history_old)")
                old_cols = {c[1] for c in cursor.fetchall()}
                target_cols = ['id', 'media_id', 'file_id', 'tmdb_id', 'title', 'original_title', 'media_type', 'year', 'poster_path', 'backdrop_path', 'overview', 'file_path', 'stream_url', 'torrent_hash', 'is_online', 'is_downloaded', 'episode_name', 'season_number', 'episode_number', 'current_time', 'duration', 'progress', 'watched_at']
                valid_cols = [c for c in target_cols if c in old_cols]
                if valid_cols:
                    c_str = ", ".join(valid_cols)
                    cursor.execute(f"INSERT INTO watch_history ({c_str}) SELECT {c_str} FROM watch_history_old")
                cursor.execute("DROP TABLE watch_history_old")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_watch_history_watched_at ON watch_history(watched_at DESC)")
        except Exception as e:
            logger.error(f"Migration watch_history error: {e}")

        # Safe migrations for watch_history table if it already existed with old schema
        for col, col_type in [
            ("media_id", "INTEGER"),
            ("file_id", "INTEGER"),
            ("tmdb_id", "INTEGER"),
            ("title", "TEXT"),
            ("original_title", "TEXT"),
            ("media_type", "TEXT DEFAULT 'movie'"),
            ("year", "TEXT"),
            ("poster_path", "TEXT"),
            ("backdrop_path", "TEXT"),
            ("overview", "TEXT"),
            ("file_path", "TEXT"),
            ("stream_url", "TEXT"),
            ("torrent_hash", "TEXT"),
            ("is_online", "BOOLEAN DEFAULT 0"),
            ("is_downloaded", "INTEGER DEFAULT 0"),
            ("episode_name", "TEXT"),
            ("season_number", "INTEGER"),
            ("episode_number", "INTEGER"),
            ("current_time", "REAL DEFAULT 0"),
            ("duration", "REAL DEFAULT 0"),
            ("progress", "REAL DEFAULT 0"),
        ]:
            try:
                cursor.execute(f"ALTER TABLE watch_history ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

        # Clean up orphan media entries marked in_library=1 without downloads or files
        try:
            cursor.execute("""
                UPDATE media 
                SET in_library = 0 
                WHERE in_library = 1 
                  AND id NOT IN (SELECT media_id FROM downloads) 
                  AND id NOT IN (SELECT media_id FROM media_files)
            """)
        except Exception:
            pass

        # Safe migrations for media table to support in-library management
        for col, col_type in [
            ("magnet_uri", "TEXT"),
            ("torrent_title", "TEXT"),
            ("quality", "TEXT"),
            ("download_dir", "TEXT"),
            ("in_library", "BOOLEAN DEFAULT 1"),
            ("selected_files", "TEXT"),
            ("episodes_json", "TEXT")
        ]:
            try:
                cursor.execute(f"ALTER TABLE media ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

        try:
            cursor.execute("DELETE FROM downloads WHERE status='queued' AND (downloaded_size=0 OR downloaded_size IS NULL) AND (aria2_gid IS NULL OR aria2_gid='') AND media_id IN (SELECT id FROM media WHERE in_library=0)")
        except Exception:
            pass

        conn.commit()
        conn.close()
        try:
            os.chmod(CONFIG_DIR, 0o777)
            if os.path.isfile(DB_PATH):
                os.chmod(DB_PATH, 0o666)
        except Exception:
            pass
        logger.info("Database initialized with full modern schema and indexes")

def db_get_setting(key: str, default: str = "") -> str:
    try:
        with DB_LOCK:
            conn = sqlite3.connect(DB_PATH, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE IF NOT EXISTS plugin_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            row = cursor.execute("SELECT value FROM plugin_settings WHERE key = ?", (key,)).fetchone()
            conn.close()
            if row and row[0] is not None:
                return str(row[0])
    except Exception as e:
        logger.debug(f"db_get_setting error for {key}: {e}")
    return default

def db_set_setting(key: str, value: str):
    try:
        with DB_LOCK:
            conn = sqlite3.connect(DB_PATH, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE IF NOT EXISTS plugin_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cursor.execute(
                "INSERT INTO plugin_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
                (key, str(value) if value is not None else "")
            )
            conn.commit()
            conn.close()
    except Exception as e:
        logger.debug(f"db_set_setting error for {key}: {e}")

def db_get_all_settings() -> dict:
    res = {}
    try:
        with DB_LOCK:
            conn = sqlite3.connect(DB_PATH, timeout=5.0)
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE IF NOT EXISTS plugin_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            for row in cursor.execute("SELECT key, value FROM plugin_settings").fetchall():
                if row and row[0]:
                    res[row[0]] = row[1]
            conn.close()
    except Exception as e:
        logger.debug(f"db_get_all_settings error: {e}")
    return res

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
                    ext = os.path.splitext(fn)[1].lower()
                    if ext in video_exts:
                        fp = os.path.realpath(os.path.join(dirpath, fn))
                        if fp in indexed_files:
                            continue
                        try:
                            sz = os.path.getsize(fp)
                            if sz >= 100 * 1024 and is_header_ready(fp):
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

            if row:
                mid = row['id'] if isinstance(row, dict) else row[0]
                cursor.execute("""
                    UPDATE media 
                    SET in_library = 1, status = 'downloaded', download_dir = ?
                    WHERE id = ?
                """, (item_dir, mid))
            else:
                cursor.execute("""
                    INSERT INTO media (title, year, media_type, in_library, status, download_dir)
                    VALUES (?, ?, ?, 1, 'downloaded', ?)
                """, (parsed_title, parsed_year, media_type, item_dir))
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
                    ) VALUES (?, '', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (mid, folder_name, dl_status, dl_progress, tot_sz, tot_sz, item_dir))
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

            if mf_row:
                mid = mf_row['media_id'] if isinstance(mf_row, dict) else mf_row[0]
                cursor.execute("""
                    UPDATE media 
                    SET in_library = 1, status = 'downloaded', download_dir = ?
                    WHERE id = ?
                """, (parent_dir, mid))
            else:
                cursor.execute("""
                    INSERT INTO media (title, year, media_type, in_library, status, download_dir)
                    VALUES (?, ?, ?, 1, 'downloaded', ?)
                """, (file_title, p_year, media_type, parent_dir))
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
                    if not d.startswith('.') and d.lower() not in skip_dir_names
                ]

                # Проверяем, не является ли dirpath стандартной категорией
                if os.path.basename(dirpath).lower() in known_cat_names:
                    continue

                # Ищем неиндексированные видеофайлы в текущей директории
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
                is_structured_release = (not is_root_dir) and (len(local_vfiles) > 1 and is_season_folder)

                if is_structured_release:
                    mtype = "tv" if is_season_folder else "movie"
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
