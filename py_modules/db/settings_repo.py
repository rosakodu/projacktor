import os
import json
import shutil
import sqlite3
from typing import Optional, List, Dict, Any

from .connection import (
    CONFIG_DIR,
    SETTINGS_PATH,
    DECKY_SETTINGS_DIR,
    DECKY_SETTINGS_PATH,
    DEFAULT_SETTINGS,
    DB_LOCK,
    DB_PATH,
    get_user_home,
    logger
)
from ..core.env import get_all_settings_candidates

try:
    from ..core.network import normalize_jacred_url
except ImportError:
    import re
    def normalize_jacred_url(url: str) -> str:
        if not url:
            return ""
        u = str(url).strip()
        u = re.sub(r'/api(?:/.*)?$', '', u, flags=re.IGNORECASE).rstrip('/')
        if not (u.startswith("http://") or u.startswith("https://")):
            u = f"http://{u}"
        return u.rstrip('/')


def db_get_setting(key: str, default: str = "") -> str:
    """Reads a string setting value from the plugin_settings SQLite table."""
    if not os.path.isfile(DB_PATH):
        return default
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
    """Inserts or updates a setting in the plugin_settings SQLite table."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
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


def db_get_all_settings() -> Dict[str, str]:
    """Returns all settings from plugin_settings as a dictionary."""
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


def _get_all_settings_candidates() -> List[str]:
    """Delegates to core.env.get_all_settings_candidates for backward compatibility."""
    return get_all_settings_candidates()


def _read_settings_file(path: str) -> Optional[dict]:
    """Safely loads settings JSON from file if it exists and has content."""
    if not path or not os.path.isfile(path) or os.path.getsize(path) == 0:
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception as e:
        logger.debug(f"Could not read settings from {path}: {e}")
    return None


def load_settings() -> dict:
    """
    Loads settings from settings.json, backup candidates, and SQLite DB.
    Performs multi-location disaster recovery and synchronizes stores.
    """
    merged = DEFAULT_SETTINGS.copy()
    loaded_any = False
    has_sound_field = False
    has_haptic_field = False

    # 1. Читаем основной файл settings.json
    primary_data = _read_settings_file(SETTINGS_PATH)
    if primary_data:
        merged.update(primary_data)
        loaded_any = True
        if "sound_effects_enabled" in primary_data:
            has_sound_field = True
        if "haptic_feedback_enabled" in primary_data:
            has_haptic_field = True

    candidates = _get_all_settings_candidates()

    # 1b. Если основной файл поврежден — восстанавливаем настройки целиком из бэкапов
    if not loaded_any:
        for cand in candidates:
            if cand == SETTINGS_PATH:
                continue
            cand_data = _read_settings_file(cand)
            if cand_data and isinstance(cand_data, dict):
                merged.update(cand_data)
                loaded_any = True
                if "sound_effects_enabled" in cand_data:
                    has_sound_field = True
                if "haptic_feedback_enabled" in cand_data:
                    has_haptic_field = True
                logger.info(f"Restored full settings from backup {cand}")
                break

        if not loaded_any:
            try:
                db_all = db_get_setting("all_settings", "")
                if db_all:
                    parsed = json.loads(db_all)
                    if isinstance(parsed, dict) and parsed:
                        merged.update(parsed)
                        loaded_any = True
                        if "sound_effects_enabled" in parsed:
                            has_sound_field = True
                        if "haptic_feedback_enabled" in parsed:
                            has_haptic_field = True
            except Exception:
                pass

    # 2. Если файл отсутствует или ссылка на парсер пустая — ищем по резервным и официальным копиям
    if not merged.get("jacred_url"):
        for cand in candidates:
            if cand == SETTINGS_PATH:
                continue
            cand_data = _read_settings_file(cand)
            if cand_data and cand_data.get("jacred_url"):
                norm = normalize_jacred_url(cand_data["jacred_url"])
                if norm:
                    merged["jacred_url"] = norm
                    logger.info(f"Restored jacred_url from {cand} -> {norm}")
                    break

    # 3. Если ссылка всё ещё не найдена — проверяем таблицу настроек внутри SQLite базы данных
    if not merged.get("jacred_url"):
        try:
            db_url = db_get_setting("jacred_url", "")
            if db_url:
                norm = normalize_jacred_url(db_url)
                if norm:
                    merged["jacred_url"] = norm
                    logger.info(f"Restored jacred_url from SQLite DB -> {norm}")
        except Exception as e:
            logger.debug(f"Error querying db for jacred_url: {e}")

    # 4. Проверяем путь загрузок (при необходимости восстанавливаем из альтернативных мест)
    if not loaded_any or not merged.get("download_path") or merged.get("download_path") == DEFAULT_SETTINGS.get("download_path"):
        for cand in candidates:
            cand_data = _read_settings_file(cand)
            if cand_data and cand_data.get("download_path"):
                merged["download_path"] = cand_data["download_path"]
                break
        if not merged.get("download_path") or merged.get("download_path") == DEFAULT_SETTINGS.get("download_path"):
            try:
                db_dp = db_get_setting("download_path", "")
                if db_dp:
                    merged["download_path"] = db_dp
            except Exception:
                pass

    # Если текущий download_path пустой или не существует, но существует альтернативный каталог с медиафайлами — переключаемся на него
    cur_dp = os.path.realpath(os.path.expanduser(merged.get("download_path", "")))
    has_files = os.path.isdir(cur_dp) and bool(os.listdir(cur_dp))
    if not has_files:
        for alt_cand in [
            os.path.join(get_user_home(), "Movies", "Projacktor"),
            os.path.join(get_user_home(), "Videos", "Projacktor"),
            os.path.join(get_user_home(), "Video", "Projactor"),
        ]:
            real_alt = os.path.realpath(alt_cand)
            if os.path.isdir(real_alt) and bool(os.listdir(real_alt)):
                merged["download_path"] = real_alt
                logger.info(f"Auto-selected existing download_path with media: {real_alt}")
                break

    if merged.get("tmdb_api_key") == "aa86d1a6876222de71c258408e1a4ed3":
        merged["tmdb_api_key"] = DEFAULT_SETTINGS["tmdb_api_key"]

    if merged.get("jacred_url"):
        merged["jacred_url"] = normalize_jacred_url(merged["jacred_url"])

    # Двунаправленная синхронизация звука и вибро (Feature 12)
    if loaded_any:
        if not has_sound_field:
            merged["sound_effects_enabled"] = bool(merged.get("haptic_and_sound_enabled", True))
        else:
            merged["sound_effects_enabled"] = bool(merged["sound_effects_enabled"])

        if not has_haptic_field:
            merged["haptic_feedback_enabled"] = bool(merged.get("haptic_and_sound_enabled", True))
        else:
            merged["haptic_feedback_enabled"] = bool(merged["haptic_feedback_enabled"])

        merged["haptic_and_sound_enabled"] = bool(
            merged["sound_effects_enabled"] and merged["haptic_feedback_enabled"]
        )

    # Синхронизируем настройки во все хранилища (включая Decky dir и SQLite)
    save_settings(merged)
    return merged


def save_settings(settings: Any) -> None:
    """
    Atomically saves settings to settings.json, creates .bak, mirrors to Decky settings dir,
    and saves key values to plugin_settings SQLite table.
    """
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        os.makedirs(DECKY_SETTINGS_DIR, exist_ok=True)
    except Exception:
        pass

    current = DEFAULT_SETTINGS.copy()
    has_sound_on_disk = False
    has_haptic_on_disk = False

    # Считываем текущее состояние из существующих файлов
    for p in [SETTINGS_PATH, SETTINGS_PATH + ".bak", DECKY_SETTINGS_PATH, DECKY_SETTINGS_PATH + ".bak"]:
        data = _read_settings_file(p)
        if data:
            current.update(data)
            if "sound_effects_enabled" in data:
                has_sound_on_disk = True
            if "haptic_feedback_enabled" in data:
                has_haptic_on_disk = True
            break

    if not has_sound_on_disk and "haptic_and_sound_enabled" in current:
        current["sound_effects_enabled"] = bool(current["haptic_and_sound_enabled"])
    if not has_haptic_on_disk and "haptic_and_sound_enabled" in current:
        current["haptic_feedback_enabled"] = bool(current["haptic_and_sound_enabled"])

    # Если в файлах не было ссылки на парсер, подтягиваем из базы данных
    if not current.get("jacred_url"):
        try:
            db_url = db_get_setting("jacred_url", "")
            if db_url:
                current["jacred_url"] = db_url
        except Exception:
            pass

    if isinstance(settings, dict):
        has_legacy = "haptic_and_sound_enabled" in settings
        has_sound = "sound_effects_enabled" in settings
        has_haptic = "haptic_feedback_enabled" in settings

        if has_legacy and not has_sound and not has_haptic:
            leg_val = bool(settings["haptic_and_sound_enabled"])
            current["haptic_and_sound_enabled"] = leg_val
            current["sound_effects_enabled"] = leg_val
            current["haptic_feedback_enabled"] = leg_val
        elif has_sound or has_haptic:
            if has_sound:
                current["sound_effects_enabled"] = bool(settings["sound_effects_enabled"])
            if has_haptic:
                current["haptic_feedback_enabled"] = bool(settings["haptic_feedback_enabled"])
            current["haptic_and_sound_enabled"] = bool(
                current.get("sound_effects_enabled", True) and current.get("haptic_feedback_enabled", True)
            )

        for k, v in settings.items():
            if v is not None:
                # Защита от случайного стирания jacred_url
                if k == "jacred_url" and not str(v).strip() and current.get("jacred_url") and not settings.get("_force_clear"):
                    continue
                if k in ("haptic_and_sound_enabled", "sound_effects_enabled", "haptic_feedback_enabled"):
                    continue
                current[k] = v

    if "sound_effects_enabled" not in current:
        current["sound_effects_enabled"] = bool(current.get("haptic_and_sound_enabled", True))
    if "haptic_feedback_enabled" not in current:
        current["haptic_feedback_enabled"] = bool(current.get("haptic_and_sound_enabled", True))
    current["haptic_and_sound_enabled"] = bool(
        current.get("sound_effects_enabled", True) and current.get("haptic_feedback_enabled", True)
    )

    if "jacred_url" in current and current["jacred_url"]:
        current["jacred_url"] = normalize_jacred_url(current.get("jacred_url"))

    def _write_atomic(target_path: str):
        try:
            d = os.path.dirname(target_path)
            os.makedirs(d, exist_ok=True)
            tmp_path = target_path + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(current, f, indent=4)
            os.replace(tmp_path, target_path)
            try:
                if current.get("jacred_url") or not os.path.exists(target_path + ".bak"):
                    shutil.copy2(target_path, target_path + ".bak")
            except Exception:
                pass
            try:
                os.chmod(target_path, 0o666)
                if os.path.exists(target_path + ".bak"):
                    os.chmod(target_path + ".bak", 0o666)
                os.chmod(d, 0o777)
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Failed to write settings to {target_path}: {e}")

    # 1. Запись в основной путь ~/.config/projacktor/settings.json
    _write_atomic(SETTINGS_PATH)

    # 2. Зеркалирование в официальную папку настроек Decky ~/homebrew/settings/Projacktor/settings.json
    if DECKY_SETTINGS_PATH != SETTINGS_PATH:
        _write_atomic(DECKY_SETTINGS_PATH)

    # 3. Дублирование в SQLite базу данных
    try:
        if current.get("jacred_url"):
            db_set_setting("jacred_url", current["jacred_url"])
        if current.get("download_path"):
            db_set_setting("download_path", current["download_path"])
        db_set_setting("sound_effects_enabled", "1" if current.get("sound_effects_enabled") else "0")
        db_set_setting("haptic_feedback_enabled", "1" if current.get("haptic_feedback_enabled") else "0")
        db_set_setting("haptic_and_sound_enabled", "1" if current.get("haptic_and_sound_enabled") else "0")
        db_set_setting("all_settings", json.dumps(current))
    except Exception as e:
        logger.debug(f"Failed to mirror settings to DB: {e}")
