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
    DEFAULT_SETTINGS,
    get_user_home,
    get_db,
    DB_LOCK
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

def normalize_jacred_url(url: str) -> str:
    if not url:
        return ""
    u = str(url).strip()
    if not u:
        return ""
    if not (u.startswith("http://") or u.startswith("https://")):
        u = f"https://{u}"
    return u.rstrip('/')

def ping_jacred(url: str, timeout: int = 5) -> bool:
    url = normalize_jacred_url(url)
    if not url:
        return False
    ctx = get_ssl_context()
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    endpoints = [
        "/api/v2.0/indexers",
        "/api/v2.0/indexers/all/results?apikey=1&Query=test"
    ]
    for ep in endpoints:
        try:
            req = urllib.request.Request(f"{url}{ep}", headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                if response.status in (200, 204):
                    return True
        except urllib.error.HTTPError as e:
            if e.code in (200, 401, 429):
                return True
        except Exception as e:
            logger.debug(f"Jacred ping error for {url}{ep}: {e}")
            continue
    return False

def load_settings():
    if not os.path.exists(SETTINGS_PATH):
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS.copy()
    try:
        with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
            settings = json.load(f)
            merged = DEFAULT_SETTINGS.copy()
            merged.update(settings)
            if merged.get("tmdb_api_key") == "aa86d1a6876222de71c258408e1a4ed3":
                merged["tmdb_api_key"] = DEFAULT_SETTINGS["tmdb_api_key"]
                save_settings(merged)
            if merged.get("jacred_url"):
                norm = normalize_jacred_url(merged["jacred_url"])
                if norm != merged["jacred_url"]:
                    merged["jacred_url"] = norm
                    save_settings(merged)
            return merged
    except Exception as e:
        logger.error(f"Error loading settings: {e}")
        return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    current = DEFAULT_SETTINGS.copy()
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                current.update(json.load(f))
        except Exception:
            pass
    if isinstance(settings, dict):
        current.update(settings)
    if "jacred_url" in current:
        current["jacred_url"] = normalize_jacred_url(current.get("jacred_url"))
    with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
        json.dump(current, f, indent=4)

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
    # Prefer system ffmpeg / ffprobe if it supports VA-API
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
                if "vaapi" in res.stdout:
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

