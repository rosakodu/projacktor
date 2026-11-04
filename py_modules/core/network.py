import ssl
import re
import urllib.request
import urllib.parse
import urllib.error
from typing import List

try:
    import decky
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("projacktor.network")


def get_ssl_context() -> ssl.SSLContext:
    """
    Returns verified SSLContext using certifi bundle when available,
    falling back to standard system certificates or unverified context if needed.
    """
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
    """
    Normalizes JacRed / Jackett URL by trimming API paths and ensuring http/https scheme.
    """
    if not url:
        return ""
    u = str(url).strip()
    if not u:
        return ""
    # Strip API paths if user pasted a full URL
    u = re.sub(r'/api(?:/.*)?$', '', u, flags=re.IGNORECASE)
    u = u.rstrip('/')

    if not (u.startswith("http://") or u.startswith("https://")):
        # If localhost, local IP or port (e.g. :9117, :8090), default to http://
        is_local = bool(
            re.search(r'^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)', u, re.IGNORECASE)
            or re.search(r':(9117|8090|8095|8080|80)\b', u)
        )
        u = f"http://{u}" if is_local else f"https://{u}"
    return u.rstrip('/')


def ping_jacred(url: str, timeout: int = 4) -> bool:
    """
    Checks JacRed/Jackett availability by querying indexers endpoint.
    """
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
                    # 200, 401, 403, 429: server responded, API is reachable
                    if e.code in (200, 401, 403, 429):
                        return True
                except Exception as e:
                    logger.debug(f"Jacred ping error for {test_url}{ep}: {e}")
                    break
    return False


POPULAR_TRACKERS: List[str] = [
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
