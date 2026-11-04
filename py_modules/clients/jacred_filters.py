import re
import urllib.parse
from typing import Set

DANGEROUS_EXT_REGEX = re.compile(
    r'(?i)(\.(exe|msi|scr|bat|cmd|pif|vbs|vbe|cpl|com|jar|apk|dmg|pkg)(?:$|[\s\?&"\'\)\]_#])|'
    r'(?:^|[\s.\[\(_-])exe(?:$|[\s.\]\)_-])|\b(?:setup|installer|crack|keygen|patch)\.exe\b)'
)

UNSUPPORTED_MEDIA_REGEX = re.compile(
    r'(?i)(\.(rar|zip|7z|tar|gz|bz2|xz|iso|img)(?:$|[\s\?&"\'\)\]_#])|\bpart\d+\.rar\b|'
    r'(?:^|[\s.\[\(_-])(?:rar|zip|7z|iso)(?:$|[\s.\]\)_-])|'
    r'\b(?:bdmv|dvd-?9|dvd-?5|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100|bd25|bd50|bd66|bd100)\b|'
    r'(?:^|[\s.\[\(_-])(?:bdmv|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100)(?:$|[\s.\]\)_-])|'
    r'(?:uhd\s*)?blu-?ray[\s._\-\(\[]*(?:full|complete|образ|disc|disk|диск)|'
    r'dvd[\s._\-\(\[]*(?:disc|disk|диск)|(?:полный|образ)\s*диск[а]?)'
)

BLOCKED_TRACKERS: Set[str] = {"korsars"}


def is_executable_release(title: str, magnet: str = "") -> bool:
    """Checks if release name or magnet contains dangerous executable extensions."""
    if not title and not magnet:
        return False
    combined = f"{title or ''} {magnet or ''}"
    return bool(DANGEROUS_EXT_REGEX.search(combined))


def is_unsupported_media_release(title: str, magnet: str = "") -> bool:
    """Checks if release contains archives (rar/zip/7z) or raw disk images (iso/bdmv)."""
    if not title and not magnet:
        return False
    combined = f"{title or ''} {magnet or ''}"
    if UNSUPPORTED_MEDIA_REGEX.search(combined):
        return True
    lower = combined.lower()
    if "blu-ray" in lower or "bluray" in lower:
        if not re.search(r'\b(remux|rip)\b', lower):
            if re.search(r'blu-?ray[\s._\-\(\[]*(?:\d+p|\d+i|cee|eur|rus|3d|custom)', lower):
                return True
    return False


def is_blocked_tracker(tracker: str, magnet: str = "") -> bool:
    """Checks if release belongs solely to blocked trackers."""
    if not tracker and not magnet:
        return False
    t_clean = str(tracker or "").lower().strip()
    trackers = [t.strip() for t in re.split(r'[,;|\s]+', t_clean) if t.strip()]
    if trackers and all(t in BLOCKED_TRACKERS for t in trackers):
        return True

    mag_decoded = urllib.parse.unquote((magnet or "").lower())
    if "korsars.pro" in mag_decoded:
        has_public = any(
            p in mag_decoded for p in [
                "rutor", "rutracker", "t-ru.org", "nnm-club", "nnmclub",
                "opentrackr", "opentor", "openbittorrent", "torrent.by", "dler"
            ]
        )
        if not has_public:
            return True
    return False


def detect_release_quality(title: str) -> str:
    """Automatically extracts video release quality/format from torrent title."""
    title_l = str(title or "").lower()
    is_ts = bool(re.search(r'\b(telesync|tsrip|hdts|hd-ts)\b|(?:\s|^|[\[\(/])ts(?:\s|$|[\]\)/])', title_l))
    is_cam = bool(re.search(r'\b(camrip|hdcam)\b|(?:\s|^|[\[\(/])cam(?:\s|$|[\]\)/])', title_l))
    is_tc = bool(re.search(r'\b(telecine)\b|(?:\s|^|[\[\(/])tc(?:\s|$|[\]\)/])', title_l))

    res = ""
    for rk in ["2160p", "4k", "4к", "uhd", "1080p", "720p"]:
        if rk in title_l:
            res = "4K" if rk in ["2160p", "4k", "4к", "uhd"] else rk
            break

    if is_ts:
        return f"TS {res}".strip()
    if is_cam:
        return f"CAM {res}".strip()
    if is_tc:
        return f"TC {res}".strip()
    if res:
        return res
    for qk in ["HDRip", "BDRip", "BDRemux", "BluRay", "WEB-DL", "WEBRip", "DVDRip"]:
        if qk.lower() in title_l:
            return qk
    return ""
