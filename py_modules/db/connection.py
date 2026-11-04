import os
import shutil
import sqlite3
import threading

from ..constants import (
    DEFAULT_HTTP_PORT,
    DEFAULT_TORRSERVER_PORT,
    DEFAULT_ARIA2_PORT,
    DEFAULT_TMDB_API_KEY
)
from ..core.env import (
    get_user_home,
    DECKY_USER_HOME,
    CONFIG_DIR,
    SETTINGS_PATH,
    DECKY_SETTINGS_DIR,
    DECKY_SETTINGS_PATH,
    INITIAL_DOWNLOAD_PATH,
    VIDEO_DIR,
    logger
)

SQLITE_HEADER = b"SQLite format 3\x00"


def is_valid_sqlite_db(path: str) -> bool:
    """Проверяет валидность заголовка и целостность базы SQLite."""
    if not path or not os.path.isfile(path) or os.path.getsize(path) < 100:
        return False
    try:
        with open(path, "rb") as f:
            if f.read(16) != SQLITE_HEADER:
                return False
    except Exception:
        return False

    try:
        conn = sqlite3.connect(path, timeout=5.0)
        try:
            cur = conn.cursor()
            cur.execute("PRAGMA quick_check(1)")
            res = cur.fetchone()
            return bool(res and res[0] == "ok")
        finally:
            conn.close()
    except Exception:
        return False


# Multi-location restoration check: if projacktor.db missing/empty, restore from backup or legacy paths
_db_projacktor = os.path.join(CONFIG_DIR, "projacktor.db")
_db_legacy = os.path.join(CONFIG_DIR, "projactor.db")

if not os.path.isfile(_db_projacktor) or os.path.getsize(_db_projacktor) == 0:
    for candidate in [
        _db_projacktor + ".bak",
        _db_legacy,
        os.path.join(get_user_home(), ".config", "projactor", "projacktor.db"),
        os.path.join(get_user_home(), ".config", "projecktor", "projacktor.db"),
        os.path.join(get_user_home(), "homebrew", "data", "Projacktor", "projacktor.db"),
        os.path.join(get_user_home(), "homebrew", "settings", "Projacktor", "projacktor.db"),
    ]:
        if is_valid_sqlite_db(candidate):
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

DEFAULT_SETTINGS = {
    "jacred_url": "",
    "tmdb_api_key": DEFAULT_TMDB_API_KEY,
    "download_path": INITIAL_DOWNLOAD_PATH,
    "language": "ru",
    "aria2_port": DEFAULT_ARIA2_PORT,
    "torrserver_port": DEFAULT_TORRSERVER_PORT,
    "http_server_port": DEFAULT_HTTP_PORT,
    "transcode_max_res": "auto",
    "haptic_and_sound_enabled": True,
    "sound_effects_enabled": True,
    "haptic_feedback_enabled": True,
    "kids_mode": False
}

# RLock to prevent race conditions across concurrent threads
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
    """Opens a SQLite connection with WAL mode, busy timeout and SafeRow factory."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        conn = sqlite3.connect(DB_PATH, timeout=20.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.row_factory = lambda c, r: SafeRow(c, r)
        return conn
    except sqlite3.DatabaseError as e:
        logger.error(f"Database error in get_db: {e}. Attempting recovery...")
        from .schema import init_db
        init_db()
        conn = sqlite3.connect(DB_PATH, timeout=20.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.row_factory = lambda c, r: SafeRow(c, r)
        return conn
