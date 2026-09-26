import os
import sys
import shutil
import json
import urllib.request
import urllib.parse
import urllib.error
import ssl
import re
import subprocess


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

from .db import (
    CONFIG_DIR,
    SETTINGS_PATH,
    DECKY_SETTINGS_DIR,
    DECKY_SETTINGS_PATH,
    DEFAULT_SETTINGS,
    get_user_home,
    get_db,
    DB_LOCK,
    db_get_setting,
    db_set_setting,
    db_get_all_settings
)

def get_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception as e:
        logger.debug(f"certifi fallback to default SSL context: {e}")
        try:
            return ssl.create_default_context()
        except Exception as e2:
            logger.warning(f"Failed to create verified SSL context, using unverified fallback: {e2}")
            return ssl._create_unverified_context()

DANGEROUS_EXT_REGEX = re.compile(
    r'(?i)(\.(exe|msi|scr|bat|cmd|pif|vbs|vbe|cpl|com|jar|apk|dmg|pkg)(?:$|[\s\?&"\'\)\]_#])|'
    r'(?:^|[\s.\[\(_-])exe(?:$|[\s.\]\)_-])|'
    r'\b(?:setup|installer|crack|keygen|patch)\.exe\b)'
)

def is_executable_release(title: str, magnet: str = "") -> bool:
    if not title and not magnet:
        return False
    combined = f"{title or ''} {magnet or ''}"
    return bool(DANGEROUS_EXT_REGEX.search(combined))

def normalize_jacred_url(url: str) -> str:
    if not url:
        return ""
    u = str(url).strip()
    if not u:
        return ""
    # Очищаем от путей API, если пользователь скопировал полную ссылку
    u = re.sub(r'/api/v2\.0/.*$', '', u, flags=re.IGNORECASE)
    u = re.sub(r'/api/.*$', '', u, flags=re.IGNORECASE)
    u = u.rstrip('/')

    if not (u.startswith("http://") or u.startswith("https://")):
        # Если это localhost, локальный IP или порт (например :9117, :8090), по умолчанию http://
        is_local = bool(
            re.search(r'^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)', u, re.IGNORECASE)
            or re.search(r':(9117|8090|8095|8080|80)\b', u)
        )
        u = f"http://{u}" if is_local else f"https://{u}"
    return u.rstrip('/')

def ping_jacred(url: str, timeout: int = 4) -> bool:
    url = normalize_jacred_url(url)
    if not url:
        return False

    contexts = [get_ssl_context()]
    try:
        contexts.append(ssl._create_unverified_context())
    except Exception:
        pass

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    endpoints = [
        "/api/v2.0/indexers",
        "/api/v2.0/indexers/all/results?apikey=1&Query=test"
    ]

    urls_to_try = [url]
    if url.startswith("https://"):
        urls_to_try.append("http://" + url[8:])

    for test_url in urls_to_try:
        for ep in endpoints:
            for ctx in contexts:
                try:
                    req = urllib.request.Request(f"{test_url}{ep}", headers=headers)
                    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                        if response.status in (200, 204):
                            return True
                except urllib.error.HTTPError as e:
                    # 200, 401, 403, 429: сервер ответил, API Jackett/JacRed доступен
                    if e.code in (200, 401, 403, 429):
                        return True
                except Exception as e:
                    logger.debug(f"Jacred ping error for {test_url}{ep}: {e}")
                    break
    return False

def _get_all_settings_candidates():
    candidates = [
        SETTINGS_PATH,
        SETTINGS_PATH + ".bak",
        DECKY_SETTINGS_PATH,
        DECKY_SETTINGS_PATH + ".bak",
        os.path.join(get_user_home(), ".config", "projactor", "settings.json"),
        os.path.join(get_user_home(), ".config", "projecktor", "settings.json"),
        os.path.join(get_user_home(), "homebrew", "settings", "projactor", "settings.json"),
        os.path.join(get_user_home(), "homebrew", "data", "Projacktor", "settings.json"),
    ]
    seen = set()
    res = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            res.append(c)
    return res

def _read_settings_file(path):
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

def load_settings():
    merged = DEFAULT_SETTINGS.copy()
    loaded_any = False

    # 1. Читаем основной файл settings.json
    primary_data = _read_settings_file(SETTINGS_PATH)
    if primary_data:
        merged.update(primary_data)
        loaded_any = True

    # 2. Если файл отсутствует или ссылка на парсер пустая — ищем по резервным и официальным копиям
    candidates = _get_all_settings_candidates()
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

    # Синхронизируем настройки во все хранилища (включая Decky dir и SQLite)
    save_settings(merged)
    return merged

def save_settings(settings):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        os.makedirs(DECKY_SETTINGS_DIR, exist_ok=True)
    except Exception:
        pass

    current = DEFAULT_SETTINGS.copy()

    # Считываем текущее состояние из существующих файлов
    for p in [SETTINGS_PATH, SETTINGS_PATH + ".bak", DECKY_SETTINGS_PATH, DECKY_SETTINGS_PATH + ".bak"]:
        data = _read_settings_file(p)
        if data:
            current.update(data)
            break

    # Если в файлах не было ссылки на парсер, подтягиваем из базы данных
    if not current.get("jacred_url"):
        try:
            db_url = db_get_setting("jacred_url", "")
            if db_url:
                current["jacred_url"] = db_url
        except Exception:
            pass

    if isinstance(settings, dict):
        for k, v in settings.items():
            if v is not None:
                # Критически важная защита: если передана пустая ссылка на парсер,
                # но у нас уже есть сохраненная валидная ссылка — НЕ затираем её
                # пустым значением (защита от дефолтных перезаписей и гонок)
                if k == "jacred_url" and not str(v).strip() and current.get("jacred_url") and not settings.get("_force_clear"):
                    continue
                current[k] = v

    if "jacred_url" in current and current["jacred_url"]:
        current["jacred_url"] = normalize_jacred_url(current.get("jacred_url"))

    def _write_atomic(target_path):
        try:
            d = os.path.dirname(target_path)
            os.makedirs(d, exist_ok=True)
            tmp_path = target_path + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(current, f, indent=4)
            os.replace(tmp_path, target_path)
            try:
                # Обновляем .bak, только если текущий конфиг содержит данные
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
        db_set_setting("all_settings", json.dumps(current))
    except Exception as e:
        logger.debug(f"Failed to mirror settings to DB: {e}")

_vaapi_supported = None

def has_vaapi_support() -> bool:
    global _vaapi_supported
    if _vaapi_supported is not None:
        return _vaapi_supported

    dri_dev = "/dev/dri/renderD128"
    if not (os.path.exists(dri_dev) and os.access(dri_dev, os.R_OK | os.W_OK)):
        _vaapi_supported = False
        return False

    ffmpeg_bin = get_bin_path("ffmpeg")
    try:
        res = subprocess.run(
            [ffmpeg_bin, "-hide_banner", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3,
            env=_clean_env()
        )
        if "h264_vaapi" in res.stdout:
            logger.info("[Hardware] VA-API hardware video acceleration detected and enabled (/dev/dri/renderD128)")
            _vaapi_supported = True
            return True
    except Exception as e:
        logger.debug(f"[Hardware] VA-API detection error: {e}")

    _vaapi_supported = False
    return False

def get_bin_path(name: str) -> str:
    # Prefer system ffmpeg / ffprobe if it supports hardware acceleration (VA-API, CUDA/NVENC, QSV)
    if name in ("ffmpeg", "ffprobe"):
        system_bin = shutil.which(name)
        if system_bin and os.path.isfile(system_bin):
            try:
                res = subprocess.run(
                    [system_bin, "-hide_banner", "-hwaccels"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=2,
                    env=_clean_env()
                )
                out_lower = res.stdout.lower()
                if any(hw in out_lower for hw in ("vaapi", "cuda", "nvdec", "nvenc", "qsv")):
                    return system_bin
            except Exception:
                pass

    plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidates = [
        os.path.join(plugin_dir, "bin", name),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin", name)
    ]
    for c in candidates:
        if os.path.isfile(c):
            try:
                os.chmod(c, 0o755)
            except Exception:
                pass
            return c
    system_path = shutil.which(name)
    if system_path:
        return system_path
    return candidates[0]


def _clean_env():
    env = os.environ.copy()
    for key in ("LD_LIBRARY_PATH", "LD_PRELOAD", "APPDIR", "APPIMAGE", "GST_PLUGIN_PATH", "GST_PLUGIN_SYSTEM_PATH", "PYTHONHOME", "PYTHONPATH"):
        env.pop(key, None)
    return env

def _build_gui_env():
    env = _clean_env()
    env["DISPLAY"] = ":0"
    env["XDG_RUNTIME_DIR"] = "/run/user/1000"
    return env

POPULAR_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://explodie.org:6969/announce",
    "udp://opentor.net:6969",
    "udp://tracker.dler.com:6969/announce",
    "http://retracker.local/announce",
    "udp://bt1.archive.org:6969/announce",
    "udp://9.rarbg.to:2920/announce",
    "udp://tracker.openbittorrent.com:6969/announce"
]

def get_steam_language():
    try:
        home = get_user_home()
        vdf_candidates = [
            os.path.join(home, ".steam", "registry.vdf"),
            os.path.join(home, ".steam", "steam", "registry.vdf"),
            os.path.join(home, ".local", "share", "Steam", "registry.vdf"),
        ]
        for vdf_path in vdf_candidates:
            if os.path.exists(vdf_path):
                try:
                    with open(vdf_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        match = re.search(r'"language"\s+"([^"]+)"', content, re.IGNORECASE)
                        if match:
                            return match.group(1).lower()
                except Exception:
                    pass
        for env_var in ["STEAM_CLIENT_LANGUAGE", "LANGUAGE", "LC_ALL", "LANG"]:
            val = os.environ.get(env_var)
            if val:
                return val.lower()
    except Exception:
        pass
    return "ru"

def get_available_storage_drives():
    drives = []
    home_dir = get_user_home()
    default_internal = os.path.join(home_dir, "Videos", "Projacktor")
    try:
        t, u, f = shutil.disk_usage(home_dir)
        drives.append({
            "id": "internal",
            "name": "Внутренняя память (SSD)",
            "path": default_internal,
            "total": t,
            "used": u,
            "free": f,
            "is_removable": False,
            "writable": True
        })
    except Exception:
        pass

    media_bases = ["/run/media", os.path.join("/run/media", os.path.basename(home_dir))]
    seen_paths = set()
    for mb in media_bases:
        if os.path.isdir(mb):
            try:
                for entry in os.listdir(mb):
                    entry_path = os.path.join(mb, entry)
                    if os.path.isdir(entry_path) and entry_path not in seen_paths and entry != os.path.basename(home_dir):
                        seen_paths.add(entry_path)
                        try:
                            t, u, f = shutil.disk_usage(entry_path)
                            is_writable = os.access(entry_path, os.W_OK)
                            label = f"Карта памяти MicroSD ({entry})"
                            drives.append({
                                "id": f"sd_{entry}",
                                "name": label,
                                "path": os.path.join(entry_path, "Videos", "Projacktor"),
                                "total": t,
                                "used": u,
                                "free": f,
                                "is_removable": True,
                                "writable": is_writable
                            })
                        except Exception:
                            pass
            except Exception:
                pass
    return drives


def clean_media_title(raw_title: str):
    """
    Cleans filename/folder name to extract clean title, year, and should_search flag.
    Returns (clean_title, year, should_search).
    """
    if not raw_title:
        return "", None, False

    base = os.path.splitext(raw_title)[0]

    # Phone camera / screen recording video patterns (skip TMDB search)
    if re.match(r'^(VID|IMG|PXL|MOV|REC|MVI|Screen_?Recording|Capture|gameplay)[-_0-9]', base, re.IGNORECASE):
        clean_name = re.sub(r'[._]+', ' ', base).strip()
        return clean_name or base, None, False

    year = None
    m_year = re.search(r'[\(\[\s._-]((?:19|20)\d{2})[\)\]\s._-]', base)
    if m_year:
        try:
            year = int(m_year.group(1))
            base = base[:m_year.start()]
        except Exception:
            pass

    # Strip series episode tags (S01E02, Season 1, etc.)
    base = re.sub(r'(?i)\b(s\d{1,2}e\d{1,2}|s\d{1,2}|season\s*\d+|сезон\s*\d+|серия\s*\d+|\d{1,2}x\d{1,3})\b.*$', '', base)

    # Strip release quality and groups
    base = re.sub(
        r'(?i)\b(1080p|720p|2160p|4k|uhd|web-dl|webrip|bdrip|brrip|bluray|dvdrip|h264|x264|h265|x265|hevc|10bit|aac|ac3|dts|ddp5\.1|dual|rus|eng|sub|dub|lostfilm|hdrezka|newstudio|alexfilm|кураж-бамбей)\b.*$',
        '',
        base
    )

    clean = re.sub(r'[._]+', ' ', base).strip()
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean or raw_title, year, True


def search_tmdb_metadata(title: str, year: int = None, media_type: str = "movie"):
    """
    Searches TMDB for a movie or TV show using Decky mirror or official TMDB API.
    Returns metadata dict or None if not found or skipped.
    """
    clean_title, parsed_year, should_search = clean_media_title(title)
    if not should_search or not clean_title or len(clean_title) < 2:
        return None

    target_year = year or parsed_year
    api_key = "4ef0d7355d9ffb5151e987764708ce96"

    types_to_try = [media_type]
    if media_type == "movie":
        types_to_try.append("tv")
    else:
        types_to_try.append("movie")

    ctx = get_ssl_context()

    for mtype in types_to_try:
        endpoint = "search/movie" if mtype == "movie" else "search/tv"
        params = {
            "api_key": api_key,
            "language": "ru-RU",
            "query": clean_title,
        }
        if target_year:
            if mtype == "movie":
                params["primary_release_year"] = str(target_year)
            else:
                params["first_air_date_year"] = str(target_year)

        for base_api in ["https://deckyloader.ru/tmdb-api/3", "https://api.themoviedb.org/3"]:
            try:
                url = f"{base_api}/{endpoint}?{urllib.parse.urlencode(params)}"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    results = data.get("results", [])
                    if not results and target_year:
                        # Fallback search without year filter
                        fallback_params = dict(params)
                        if "primary_release_year" in fallback_params:
                            del fallback_params["primary_release_year"]
                        if "first_air_date_year" in fallback_params:
                            del fallback_params["first_air_date_year"]
                        url_ny = f"{base_api}/{endpoint}?{urllib.parse.urlencode(fallback_params)}"
                        req_ny = urllib.request.Request(url_ny, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req_ny, timeout=5, context=ctx) as r2:
                            d2 = json.loads(r2.read().decode('utf-8'))
                            results = d2.get("results", [])

                    if results:
                        first = results[0]
                        res_title = first.get("title") or first.get("name") or clean_title
                        res_orig = first.get("original_title") or first.get("original_name") or ""
                        res_date = first.get("release_date") or first.get("first_air_date") or ""
                        res_year = target_year
                        if res_date and len(res_date) >= 4:
                            try:
                                res_year = int(res_date[:4])
                            except Exception:
                                pass
                        return {
                            "tmdb_id": first.get("id"),
                            "title": res_title,
                            "original_title": res_orig,
                            "year": res_year,
                            "media_type": mtype,
                            "poster_path": first.get("poster_path") or "",
                            "backdrop_path": first.get("backdrop_path") or "",
                            "overview": first.get("overview") or "",
                            "vote_average": float(first.get("vote_average", 0.0) or 0.0),
                        }
            except Exception as e:
                logger.debug(f"TMDB search query failed ({base_api}): {e}")
                continue

    return None


def auto_enrich_library_metadata(conn=None) -> int:
    """
    Finds media entries in library that lack poster_path and queries TMDB to populate
    poster_path, backdrop_path, overview, tmdb_id, title and year.
    Returns count of enriched items.
    """
    import time
    import sqlite3
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

