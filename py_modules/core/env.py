import os
import shutil
import subprocess
import re
from typing import List, Dict

try:
    import decky
    logger = decky.logger
    DECKY_USER_HOME = decky.DECKY_USER_HOME
except ImportError:
    import logging
    logger = logging.getLogger("projacktor.env")
    logger.setLevel(logging.DEBUG)
    _fallback_home = "/home/deck" if os.path.isdir("/home/deck") else os.path.expanduser("~")
    DECKY_USER_HOME = os.environ.get("DECKY_USER_HOME", _fallback_home)


def get_user_home() -> str:
    """Returns the Decky/SteamOS user home directory path."""
    return DECKY_USER_HOME


def get_plugin_dir() -> str:
    """Returns the absolute root directory of the Projacktor plugin."""
    return os.environ.get(
        "DECKY_PLUGIN_DIR",
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )


# Resolving configuration directory (~/.config/projacktor with legacy fallbacks)
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

SETTINGS_PATH = os.path.join(CONFIG_DIR, "settings.json")
DECKY_SETTINGS_DIR = os.environ.get("DECKY_PLUGIN_SETTINGS_DIR") or os.path.join(
    get_user_home(), "homebrew", "settings", "Projacktor"
)
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


def get_all_settings_candidates() -> List[str]:
    """Returns candidate paths for settings.json to aid in disaster recovery."""
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


def get_bin_path(name: str) -> str:
    """
    Locates binary executable by name.
    Prefers system ffmpeg/ffprobe if it supports hardware acceleration (VA-API, CUDA, NVENC, QSV).
    Then looks inside plugin bin/, and finally in system $PATH.
    """
    from .process import _clean_env

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

    plugin_dir = get_plugin_dir()
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


def get_steam_language() -> str:
    """
    Detects language configured in Steam client or system locale.
    Returns: language code ('russian' / 'ru' / etc.).
    """
    try:
        home = get_user_home()

        # 1. System environment variables
        for env_var in ["STEAM_CLIENT_LANGUAGE", "LANGUAGE", "LC_ALL", "LANG"]:
            val = os.environ.get(env_var)
            if val:
                val_low = val.lower()
                if "ru" in val_low or "russian" in val_low:
                    return "russian"

        # 2. System locale files on SteamOS / Linux
        for loc_file in [
            "/etc/locale.conf",
            os.path.join(home, ".config", "locale.conf"),
            os.path.join(home, ".config", "plasma-localerc")
        ]:
            if os.path.exists(loc_file):
                try:
                    with open(loc_file, "r", encoding="utf-8", errors="ignore") as f:
                        c = f.read().lower()
                        if "ru_ru" in c or "lang=ru" in c or "language=ru" in c:
                            return "russian"
                except Exception:
                    pass

        # 3. userdata/*/config/localconfig.vdf Steam (8 = Russian in Steamworks ELanguage)
        steam_base = os.path.join(home, ".local", "share", "Steam", "userdata")
        if not os.path.exists(steam_base):
            steam_base = os.path.join(home, ".steam", "steam", "userdata")
        if os.path.exists(steam_base):
            try:
                for uid in os.listdir(steam_base):
                    cfg_path = os.path.join(steam_base, uid, "config", "localconfig.vdf")
                    if os.path.exists(cfg_path):
                        with open(cfg_path, "r", encoding="utf-8", errors="ignore") as f:
                            cfg_content = f.read()
                            if re.search(r'primary_language[\\\"\s:]+8\b', cfg_content):
                                return "russian"
            except Exception:
                pass

        # 4. registry.vdf (only HKCU section, skipping default steamglobal template)
        vdf_candidates = [
            os.path.join(home, ".steam", "registry.vdf"),
            os.path.join(home, ".steam", "steam", "registry.vdf"),
            os.path.join(home, ".local", "share", "Steam", "registry.vdf"),
        ]
        for vdf_path in vdf_candidates:
            if os.path.exists(vdf_path):
                try:
                    with open(vdf_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        hkcu_idx = content.find('"HKCU"')
                        target = content[hkcu_idx:] if hkcu_idx != -1 else content
                        target = re.sub(r'"steamglobal"\s*\{[^}]*\}', '', target, flags=re.IGNORECASE)
                        match = re.search(r'"language"\s+"([^"]+)"', target, re.IGNORECASE)
                        if match:
                            lang = match.group(1).lower()
                            if "ru" in lang:
                                return "russian"
                            return lang
                except Exception:
                    pass

        # 5. Check system env variables for English fallback
        for env_var in ["STEAM_CLIENT_LANGUAGE", "LANGUAGE", "LC_ALL", "LANG"]:
            val = os.environ.get(env_var)
            if val:
                return val.lower()

    except Exception as e:
        logger.debug(f"get_steam_language error: {e}")

    return "ru"


def get_available_storage_drives() -> List[Dict]:
    """
    Detects available internal and external storage drives (SSD + MicroSD cards in /run/media).
    Returns list of drive info dictionaries.
    """
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
