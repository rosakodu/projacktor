import json, random, threading, time
import urllib.error, urllib.parse, urllib.request
from typing import Optional, List, Dict, Tuple

from ..core.env import logger
from ..core.network import normalize_jacred_url, ping_jacred, get_ssl_context
from ..db.settings_repo import load_settings
from .jacred_filters import (
    DANGEROUS_EXT_REGEX, UNSUPPORTED_MEDIA_REGEX, BLOCKED_TRACKERS,
    is_executable_release, is_unsupported_media_release, is_blocked_tracker, detect_release_quality,
    clean_title_for_matching, extract_title_tokens, transliterate_text, extract_years,
    is_tv_release, is_unwanted_sequel, matches_word_boundary, extract_segment_title,
    is_matching_title, is_matching_year, is_matching_torrent, filter_torrents
)

_CACHE_LOCK = threading.Lock()
_SEARCH_CACHE: Dict[Tuple, Tuple[float, List[Dict]]] = {}
DEFAULT_CACHE_TTL = 60
BACKOFF_DELAYS = (0.5, 1.0, 2.0)


def clear_search_cache() -> None:
    """Clears the in-memory JacRed search cache."""
    with _CACHE_LOCK:
        _SEARCH_CACHE.clear()


class JacRedClient:
    """Client for JacRed / Jackett torrent indexing services with retry and cache."""

    def __init__(self, base_url: Optional[str] = None, timeout: int = 12):
        self._explicit_base_url = base_url
        self.timeout = timeout

    @property
    def base_url(self) -> str:
        if self._explicit_base_url:
            return normalize_jacred_url(self._explicit_base_url)
        sett = load_settings()
        return normalize_jacred_url(sett.get("jacred_url") or "")

    def ping(self, timeout: int = 4) -> bool:
        """Pings JacRed service to test reachability."""
        url = self.base_url
        return ping_jacred(url, timeout=timeout) if url else False

    def format_query(self, title: str, year: Optional[int] = None, season: Optional[int] = None, episode: Optional[int] = None) -> str:
        """Formats optimized search query for movies or series."""
        q = title.strip()
        if season is not None and episode is not None:
            return f"{q} s{season:02d}e{episode:02d}"
        if season is not None:
            return f"{q} s{season:02d}"
        return f"{q} {year}" if year else q

    def filter_and_normalize(
        self,
        raw_items: List[Dict],
        min_seeders: int = 1,
        target_title: Optional[str] = None,
        target_year: Optional[int] = None,
        media_type: Optional[str] = None,
        original_title: Optional[str] = None,
        year: Optional[int] = None,
    ) -> List[Dict]:
        eff_year = target_year if target_year is not None else year
        normalized = []
        for item in raw_items:
            title = item.get("Title") or item.get("title") or ""
            size = item.get("Size") or item.get("size") or 0
            seeders = item.get("Seeders") or item.get("seeders") or item.get("sid") or 0
            peers = item.get("Peers") or item.get("peers") or item.get("pir") or 0
            magnet = item.get("MagnetUri") or item.get("magnet") or item.get("Link") or item.get("link") or ""
            tracker = item.get("Tracker") or item.get("tracker") or "tracker"
            details = item.get("Details") or item.get("details") or item.get("url") or ""

            if is_executable_release(title, magnet) or is_executable_release(details):
                logger.warning(f"JacRed search blocked suspicious/executable torrent: {title}")
                continue
            if is_unsupported_media_release(title, magnet) or is_unsupported_media_release(details):
                logger.info(f"JacRed search blocked unsupported archive/disc image torrent: {title}")
                continue
            if is_blocked_tracker(tracker, magnet):
                logger.info(f"JacRed search blocked tracker '{tracker}': {title}")
                continue

            s_count = int(seeders) if str(seeders).isdigit() else 0
            p_count = int(peers) if str(peers).isdigit() else 0
            if s_count < min_seeders:
                continue

            if target_title:
                if not is_matching_torrent(title, target_title, eff_year, media_type or "movie", original_title):
                    continue

            quality = detect_release_quality(title)
            pub_date = str(item.get("PublishDate") or item.get("pubdate") or item.get("PubDate") or item.get("date") or "")
            normalized.append({
                "title": title, "size": size, "seeders": s_count, "seeds": s_count,
                "peers": p_count, "quality": quality, "magnet": magnet,
                "tracker": tracker, "details": details, "pub_date": pub_date
            })
        return normalized

    def search(
        self,
        query: str,
        category: Optional[str] = None,
        min_seeders: int = 1,
        ttl: int = DEFAULT_CACHE_TTL,
        bypass_cache: bool = False,
        target_title: Optional[str] = None,
        target_year: Optional[int] = None,
        media_type: Optional[str] = None,
        original_title: Optional[str] = None,
        year: Optional[int] = None,
    ) -> List[Dict]:
        """Performs search with in-memory TTL caching and HTTP 429 exponential backoff."""
        url = self.base_url
        if not url:
            return []

        eff_year = target_year if target_year is not None else year
        clean_q = query.strip()
        cat_str = category or ""
        cache_key = (
            url,
            clean_q.lower(),
            cat_str,
            min_seeders,
            str(target_title or "").lower(),
            str(original_title or "").lower(),
            int(eff_year) if eff_year else 0,
            str(media_type or "").lower(),
        )
        now = time.time()

        if not bypass_cache and ttl > 0:
            with _CACHE_LOCK:
                if cache_key in _SEARCH_CACHE:
                    cached_ts, cached_results = _SEARCH_CACHE[cache_key]
                    if now - cached_ts < ttl:
                        return cached_results

        target = f"{url}/api/v2.0/indexers/all/results?apikey=1&Query={urllib.parse.quote(clean_q)}"
        if category:
            for cat_id in [c.strip() for c in category.split(',') if c.strip()]:
                target += f"&Category[]={cat_id}"

        headers = {"User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36", "Accept": "application/json"}
        req = urllib.request.Request(target, headers=headers)
        ctx = get_ssl_context()
        max_retries = len(BACKOFF_DELAYS)

        for attempt in range(max_retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as response:
                    raw = json.loads(response.read().decode('utf-8'))
                    items = raw.get("Results", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
                    results = self.filter_and_normalize(
                        items,
                        min_seeders=min_seeders,
                        target_title=target_title,
                        target_year=eff_year,
                        media_type=media_type,
                        original_title=original_title,
                    )
                    if ttl > 0:
                        with _CACHE_LOCK:
                            if len(_SEARCH_CACHE) > 128:
                                cur_t = time.time()
                                for k in [k for k, (t, _) in _SEARCH_CACHE.items() if cur_t - t >= ttl]:
                                    _SEARCH_CACHE.pop(k, None)
                            _SEARCH_CACHE[cache_key] = (time.time(), results)
                    return results
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < max_retries:
                    retry_after = e.headers.get("Retry-After") if hasattr(e, "headers") and e.headers else None
                    base_delay = float(retry_after) if retry_after and retry_after.isdigit() else BACKOFF_DELAYS[attempt]
                    delay = min(base_delay, 5.0) + random.uniform(0.05, 0.2)
                    logger.warning(f"JacRed 429: retry {attempt + 1}/{max_retries} in {delay:.2f}s ('{clean_q}')")
                    time.sleep(delay)
                    continue
                logger.error(f"JacRed HTTP error {e.code}: {e}")
                break
            except Exception as e:
                logger.error(f"JacRed search error: {e}")
                break
        return []


__all__ = [
    "JacRedClient", "normalize_jacred_url", "ping_jacred", "clear_search_cache",
    "DEFAULT_CACHE_TTL", "BACKOFF_DELAYS", "DANGEROUS_EXT_REGEX", "UNSUPPORTED_MEDIA_REGEX",
    "BLOCKED_TRACKERS", "is_executable_release", "is_unsupported_media_release",
    "is_blocked_tracker", "detect_release_quality", "clean_title_for_matching",
    "extract_title_tokens", "transliterate_text", "extract_years", "is_tv_release",
    "is_unwanted_sequel", "matches_word_boundary", "extract_segment_title",
    "is_matching_title", "is_matching_year", "is_matching_torrent", "filter_torrents",
]
