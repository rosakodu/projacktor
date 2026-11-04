import os
import shutil
import sqlite3
import time
from .connection import CONFIG_DIR, DB_PATH, DB_LOCK, logger, is_valid_sqlite_db


def _execute_schema_and_migrations(db_path: str):
    conn = sqlite3.connect(db_path, timeout=20.0)
    try:
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
                target_cols = [
                    'id', 'media_id', 'file_id', 'tmdb_id', 'title', 'original_title', 'media_type', 'year',
                    'poster_path', 'backdrop_path', 'overview', 'file_path', 'stream_url', 'torrent_hash',
                    'is_online', 'is_downloaded', 'episode_name', 'season_number', 'episode_number',
                    'current_time', 'duration', 'progress', 'watched_at'
                ]
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
    finally:
        conn.close()


def _recover_corrupt_database(db_path: str, bak_path: str) -> bool:
    ts = int(time.time())
    if os.path.isfile(db_path):
        quarantine_file = f"{db_path}.corrupt.{ts}"
        try:
            os.rename(db_path, quarantine_file)
            logger.warning(f"Quarantined corrupt database: {db_path} -> {quarantine_file}")
        except Exception:
            try:
                shutil.copy2(db_path, quarantine_file)
                os.remove(db_path)
            except Exception as e:
                logger.error(f"Failed to quarantine corrupt db: {e}")

    for ext in ("-wal", "-shm"):
        wal_file = db_path + ext
        if os.path.exists(wal_file):
            try:
                os.remove(wal_file)
            except Exception:
                pass

    if is_valid_sqlite_db(bak_path):
        try:
            shutil.copy2(bak_path, db_path)
            logger.info(f"Successfully restored database from backup: {bak_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to restore backup: {e}")

    if os.path.isfile(bak_path):
        try:
            os.rename(bak_path, f"{bak_path}.corrupt.{ts}")
        except Exception:
            pass

    logger.warning(f"No valid backup available for {db_path}. Initializing clean database.")
    return False


def init_db():
    with DB_LOCK:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        bak_path = DB_PATH + ".bak"

        if os.path.isfile(DB_PATH) and os.path.getsize(DB_PATH) > 0:
            if is_valid_sqlite_db(DB_PATH):
                try:
                    shutil.copy2(DB_PATH, bak_path)
                except Exception as e:
                    logger.warning(f"Could not create DB backup: {e}")
            else:
                logger.warning(
                    f"Existing DB {DB_PATH} is corrupted. Skipping backup overwrite to protect {bak_path}."
                )

        try:
            _execute_schema_and_migrations(DB_PATH)
        except sqlite3.DatabaseError as e:
            logger.error(f"Database error in init_db: {e}. Starting recovery...")
            _recover_corrupt_database(DB_PATH, bak_path)
            _execute_schema_and_migrations(DB_PATH)

        try:
            os.chmod(CONFIG_DIR, 0o777)
            if os.path.isfile(DB_PATH):
                os.chmod(DB_PATH, 0o666)
        except Exception:
            pass
        logger.info("Database initialized with full modern schema and indexes")
