import os
import re
import json
import time
import hashlib
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, Dict, Tuple, List, Any

from ..constants import DEFAULT_TMDB_API_KEY
from ..core.env import CONFIG_DIR, logger
from ..core.network import get_ssl_context
from ..db.settings_repo import load_settings


def clean_media_title(raw_title: str) -> Tuple[str, Optional[int], bool]:
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
    m_year = re.search(r'[\(\[\s._-]((?:19|20)\d{2})(?:[\)\]\s._-]|$)', base)
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


def get_tmdb_image_urls(img_path: str, size: str = "w342") -> List[str]:
    """Returns candidate URLs (mirror first, then official) for a TMDB image path."""
    if not img_path:
        return []
    clean_p = img_path.lstrip('/')
    return [
        f"https://deckyloader.ru/tmdb-image/t/p/{size}/{clean_p}",
        f"https://image.tmdb.org/t/p/{size}/{clean_p}"
    ]


def build_image_url(img_path: str, size: str = "w342", use_mirror: bool = True) -> str:
    """Builds a direct image URL from TMDB path."""
    if not img_path:
        return ""
    clean_p = img_path.lstrip('/')
    if use_mirror:
        return f"https://deckyloader.ru/tmdb-image/t/p/{size}/{clean_p}"
    return f"https://image.tmdb.org/t/p/{size}/{clean_p}"


class TMDBClient:
    """Encapsulates interaction with TMDB API and Decky TMDB mirror with disk/memory caching."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        language: str = "ru",
        timeout: int = 10,
        cache_dir: Optional[str] = None
    ):
        self._explicit_api_key = api_key
        self.language = language
        self.timeout = timeout
        self.cache_dir = cache_dir or os.path.join(CONFIG_DIR, "cache", "tmdb")
        self._memory_cache: Dict[str, Tuple[float, Any]] = {}
        os.makedirs(self.cache_dir, exist_ok=True)

    @property
    def api_key(self) -> str:
        if self._explicit_api_key:
            return self._explicit_api_key
        sett = load_settings()
        return sett.get("tmdb_api_key") or DEFAULT_TMDB_API_KEY

    def fetch_endpoint(
        self,
        endpoint: str,
        params: Optional[Dict[str, str]] = None,
        ttl: Optional[int] = None
    ) -> Tuple[Optional[Dict], Optional[Exception]]:
        """
        Fetches an arbitrary TMDB endpoint with caching and fallback from Decky mirror to official API.
        Returns (data_dict, exception_if_any).
        """
        clean_ep = endpoint if endpoint.startswith('/') else f"/{endpoint}"
        q_params = {
            "api_key": self.api_key,
            "language": "en-US" if str(self.language).lower().startswith("en") else f"{self.language}-{str(self.language).upper()}"
        }
        if params:
            q_params.update(params)

        primary_url = f"https://deckyloader.ru/tmdb-api/3{clean_ep}?{urllib.parse.urlencode(q_params)}"
        fallback_url = f"https://api.themoviedb.org/3{clean_ep}?{urllib.parse.urlencode(q_params)}"

        cache_ttl = ttl if ttl is not None else (1800 if "search" in clean_ep else 7200)
        now = time.time()

        # 1. Check memory cache
        if primary_url in self._memory_cache:
            cache_time, data = self._memory_cache[primary_url]
            if now - cache_time < cache_ttl:
                return data, None

        # 2. Check disk cache
        cache_key = hashlib.md5(primary_url.encode('utf-8')).hexdigest()
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.json")
        if os.path.exists(cache_file):
            try:
                mtime = os.path.getmtime(cache_file)
                if now - mtime < cache_ttl:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._memory_cache[primary_url] = (mtime, data)
                    return data, None
            except Exception:
                pass

        # 3. Network fetch
        last_err = None
        ctx = get_ssl_context()
        for fetch_url in [primary_url, fallback_url]:
            try:
                req = urllib.request.Request(
                    fetch_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json"
                    }
                )
                with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    self._memory_cache[primary_url] = (now, data)
                    try:
                        with open(cache_file, "w", encoding="utf-8") as f:
                            json.dump(data, f)
                    except Exception:
                        pass
                    return data, None
            except Exception as e:
                last_err = e
                logger.debug(f"Failed to fetch TMDB endpoint from {fetch_url}: {e}")
                continue

        # 4. Stale cache fallback if network fails completely
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return data, None
            except Exception:
                pass

        return None, last_err

    def search_metadata(
        self,
        title: str,
        year: Optional[int] = None,
        media_type: str = "movie"
    ) -> Optional[Dict]:
        """
        Searches TMDB for a movie or TV show using Decky mirror or official TMDB API.
        Returns metadata dict or None if not found or skipped.
        """
        clean_title, parsed_year, should_search = clean_media_title(title)
        if not should_search or not clean_title or len(clean_title) < 2:
            return None

        target_year = year or parsed_year
        types_to_try = [media_type]
        types_to_try.append("tv" if media_type == "movie" else "movie")

        ctx = get_ssl_context()
        for mtype in types_to_try:
            endpoint = "search/movie" if mtype == "movie" else "search/tv"
            params = {
                "api_key": self.api_key,
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
                            fallback_params = dict(params)
                            fallback_params.pop("primary_release_year", None)
                            fallback_params.pop("first_air_date_year", None)
                            url_ny = f"{base_api}/{endpoint}?{urllib.parse.urlencode(fallback_params)}"
                            req_ny = urllib.request.Request(url_ny, headers={"User-Agent": "Mozilla/5.0"})
                            with urllib.request.urlopen(req_ny, timeout=5, context=ctx) as r2:
                                d2 = json.loads(r2.read().decode('utf-8'))
                                raw_results = d2.get("results", [])
                                matched_year_results = []
                                for r_item in raw_results:
                                    r_dt = r_item.get("release_date") or r_item.get("first_air_date") or ""
                                    if r_dt and len(r_dt) >= 4:
                                        try:
                                            r_y = int(r_dt[:4])
                                            if abs(r_y - target_year) <= 1:
                                                matched_year_results.append(r_item)
                                        except Exception:
                                            pass
                                results = matched_year_results

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
                            if target_year and res_year and abs(res_year - target_year) > 1:
                                continue
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

    def get_details(self, tmdb_id: int, media_type: str = "movie") -> Optional[Dict]:
        """Fetches full movie or series details."""
        data, _ = self.fetch_endpoint(f"/{media_type}/{tmdb_id}", ttl=7200)
        return data

    def get_credits(self, tmdb_id: int, media_type: str = "movie") -> Optional[Dict]:
        """Fetches cast and crew credits."""
        data, _ = self.fetch_endpoint(f"/{media_type}/{tmdb_id}/credits", ttl=7200)
        return data


def search_tmdb_metadata(title: str, year: int = None, media_type: str = "movie") -> Optional[Dict]:
    """Compatibility function delegating to TMDBClient instance."""
    client = TMDBClient()
    return client.search_metadata(title=title, year=year, media_type=media_type)
