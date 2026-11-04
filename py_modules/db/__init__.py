from .connection import (
    get_user_home,
    get_db,
    SafeRow,
    DB_LOCK,
    CONFIG_DIR,
    DB_PATH,
    SETTINGS_PATH,
    DECKY_SETTINGS_DIR,
    DECKY_SETTINGS_PATH,
    INITIAL_DOWNLOAD_PATH,
    VIDEO_DIR,
    DEFAULT_SETTINGS,
    logger,
    DECKY_USER_HOME,
    is_valid_sqlite_db
)
from .schema import init_db
from .settings_repo import (
    db_get_setting,
    db_set_setting,
    db_get_all_settings,
    load_settings,
    save_settings,
    _get_all_settings_candidates,
    _read_settings_file
)


def rescan_library_from_disk(download_path: str = None, conn=None) -> int:
    """Delegates to LibraryService.rescan_library_from_disk for backward compatibility."""
    from ..services.library_service import rescan_library_from_disk as _rescan
    return _rescan(download_path=download_path, conn=conn)


__all__ = [
    "get_user_home",
    "init_db",
    "get_db",
    "SafeRow",
    "DB_LOCK",
    "CONFIG_DIR",
    "DB_PATH",
    "SETTINGS_PATH",
    "DECKY_SETTINGS_DIR",
    "DECKY_SETTINGS_PATH",
    "INITIAL_DOWNLOAD_PATH",
    "VIDEO_DIR",
    "DEFAULT_SETTINGS",
    "logger",
    "DECKY_USER_HOME",
    "db_get_setting",
    "db_set_setting",
    "db_get_all_settings",
    "load_settings",
    "save_settings",
    "rescan_library_from_disk",
    "_get_all_settings_candidates",
    "_read_settings_file",
    "is_valid_sqlite_db"
]
