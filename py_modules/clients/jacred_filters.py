import re
import urllib.parse
from typing import Set, List, Dict, Optional, Tuple

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


CYR_TO_LAT: Dict[str, str] = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
    'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
}

LAT_TO_CYR: Dict[str, str] = {
    'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г',
    'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н',
    'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у',
    'v': 'в', 'w': 'в', 'x': 'кс', 'y': 'й', 'z': 'з'
}

SEASON_EPISODE_WORDS: Set[str] = {
    "сезон", "сезона", "сезоны", "сезонов", "season", "seasons", "s",
    "серия", "серии", "серий", "серию", "эпизод", "эпизоды", "episode", "episodes", "ep",
    "из", "part", "часть", "й", "го", "я", "е", "му", "м", "st", "nd", "rd", "th"
}

TV_PATTERNS: List[re.Pattern] = [
    re.compile(r'(?i)\b[sS]\d+'),
    re.compile(r'(?i)\b\d+\s*[xX]\s*\d+\b'),
    re.compile(r'(?i)(?:^|[^\w])(сезон|сезона|сезоны|сезонов|сери[яий]|серия|серии|серий|эпизод|эпизоды|мини[- ]?сериал|сериал)(?:$|[^\w])'),
    re.compile(r'(?i)\b\d+\s*из\s*\d+\b'),
    re.compile(r'(?i)(?:\[|\()\s*(?!\d{4})\d{1,3}\s*[\s_-]+\s*(?!\d{4})\d{1,3}\s*(?:\]|\))'),
    re.compile(r'(?i)\[\s*(?:TV|ТВ|OVA|OAD|Special|Спешл)\b'),
    re.compile(r'(?i)\b(?:s\d+|season\s*\d+)\b'),
]


def clean_title_for_matching(title: str) -> str:
    """Normalizes title string: replaces ё->е, removes punctuation, trims spaces."""
    if not title:
        return ""
    t = str(title).lower().replace('ё', 'е')
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def extract_title_tokens(title: str) -> List[str]:
    """Extracts alphanumeric tokens from title, stripped of punctuation."""
    cleaned = clean_title_for_matching(title)
    return [t for t in cleaned.split() if t]


def transliterate_text(text: str) -> str:
    """Simple transliteration between Cyrillic and Latin for matching foreign/local titles."""
    if not text:
        return ""
    lower = text.lower().replace('ё', 'е')
    has_cyr = any('а' <= ch <= 'я' for ch in lower)
    has_lat = any('a' <= ch <= 'z' for ch in lower)
    if has_cyr and not has_lat:
        res = [CYR_TO_LAT.get(ch, ch) for ch in lower]
        return "".join(res)
    if has_lat and not has_cyr:
        res = [LAT_TO_CYR.get(ch, ch) for ch in lower]
        return "".join(res)
    return ""


def extract_years(title: str) -> List[int]:
    """Extracts valid 4-digit release years from title, ignoring video resolutions."""
    if not title:
        return []
    cleaned = re.sub(r'(?i)\b(1080[pi]?|2160[pi]?|720[pi]?|1920|1440[pi]?)\b', '', str(title))
    years = re.findall(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)', cleaned)
    return [int(y) for y in years]


def is_tv_release(title: str) -> bool:
    """Checks if release name contains TV/series indicators."""
    if not title:
        return False
    return any(p.search(title) for p in TV_PATTERNS)


def is_unwanted_sequel(torrent_title: str, target_title: str) -> bool:
    """Detects if torrent title is a sequel (e.g. Movie 2) when target is the original movie."""
    if not target_title:
        return False
    if re.search(r'(?i)(?:^|[^\w])(2|3|4|5|6|7|8|9|II|III|IV|V)(?:$|[^\w])', target_title):
        return False
    escaped = re.escape(target_title.strip())
    pattern = rf'(?i)(?:^|[^\w]){escaped}\s+(?:[2-9]|10|II|III|IV|VI?|VII|VIII)(?:$|[^\w])'
    return bool(re.search(pattern, torrent_title))


def matches_word_boundary(text: str, phrase: str) -> bool:
    """
    Checks if phrase exists in text with strict word boundaries (\\b).
    Tokens in phrase can be separated by whitespace, dot, underscore, or dash in text.
    """
    if not text or not phrase:
        return False
    tokens = extract_title_tokens(phrase)
    if not tokens:
        return False
    escaped_tokens = [re.escape(t) for t in tokens]
    token_sep = r'[^\w]+'
    regex_str = rf'(?i)(?<![^\W_]){token_sep.join(escaped_tokens)}(?![^\W_])'
    return bool(re.search(regex_str, text))


def extract_segment_title(segment: str) -> str:
    """Extracts raw title part from a torrent segment before seasons, years, brackets, or quality."""
    if not segment:
        return ""
    s = segment.strip()
    s = re.sub(r'^\s*(?:\[[^\]]+\]\s*)+', '', s)
    s = re.sub(r'(?i)^\s*(?:сериал|мини[- ]сериал|телесериал|х/?ф|т/?с|фильм|мультсериал|мультфильм|м/?ф|аниме)\s*[:\-–—]?\s*', '', s)
    s = re.split(r'(?i)\b(?:s\d+(?:e\d+)?(?:-s?\d+)?(?:-e?\d+)?|season\s*\d+|\d+[-_ ]?(?:й|го|я|е|му|м|st|nd|rd|th)?\s*сезон|сезон\s*\d+|сери[яий]|эпизод|\d+\s*из\s*\d+|\d{1,2}x\d{1,2}|e\d+|ep\d+)\b', s)[0]
    s = re.split(r'(?i)\b(?:2160p|1080p|720p|480p|4k|uhd|fhd|hd|web-?dl|webrip|bdrip|hdrip|bluray|remux|dvdrip|camrip|tsrip)\b', s)[0]
    s = re.split(r'(?<!^)[\(\[]', s)[0]
    return s.strip(' :.-_–—')


def is_matching_title(torrent_title: str, target_title: str, original_title: Optional[str] = None) -> bool:
    """
    Checks if torrent release title matches target title (or original title) using strict
    word boundary matching and token comparison, preventing false substring matches (e.g. Mayday for Ayda).
    """
    if not torrent_title or not target_title:
        return False

    raw_candidates = [target_title]
    if original_title and original_title.strip() and original_title.strip() != target_title.strip():
        raw_candidates.append(original_title)

    candidates: List[List[str]] = []
    for rc in raw_candidates:
        tokens = extract_title_tokens(rc)
        if tokens:
            if tokens not in candidates:
                candidates.append(tokens)
            if len(tokens) > 1 and tokens[0] in ("the", "a", "an"):
                no_art = tokens[1:]
                if no_art not in candidates:
                    candidates.append(no_art)
            trans = transliterate_text(rc)
            if trans:
                t_tokens = extract_title_tokens(trans)
                if t_tokens and t_tokens not in candidates:
                    candidates.append(t_tokens)

    if not candidates:
        return False

    boundary_matched_cands = []
    for cand in candidates:
        phrase = " ".join(cand)
        if matches_word_boundary(torrent_title, phrase):
            boundary_matched_cands.append(cand)

    if not boundary_matched_cands:
        return False

    segments = [seg.strip() for seg in re.split(r'[/|\\]', torrent_title) if seg.strip()]
    if not segments:
        segments = [torrent_title]

    for cand in boundary_matched_cands:
        cand_collapsed = "".join(cand)
        for seg in segments:
            seg_title = extract_segment_title(seg)
            seg_tokens = extract_title_tokens(seg_title)
            if not seg_tokens:
                continue

            seg_no_art = seg_tokens[1:] if (len(seg_tokens) > 1 and seg_tokens[0] in ("the", "a", "an")) else seg_tokens

            if seg_tokens == cand or seg_no_art == cand:
                return True

            seg_collapsed = "".join(seg_tokens)
            if seg_collapsed == cand_collapsed:
                return True

            for st in (seg_tokens, seg_no_art):
                if len(st) > len(cand) and st[:len(cand)] == cand:
                    remainder = st[len(cand):]
                    if all(
                        r in SEASON_EPISODE_WORDS or r.isdigit() or bool(re.match(r'^(?:s\d+(?:e\d+)?(?:-s?\d+)?(?:-e?\d+)?|e\d+|ep\d+|\d+x\d+|\d+-\d+)$', r, re.I))
                        for r in remainder
                    ):
                        return True

    return False


def is_matching_year(torrent_title: str, target_year: Optional[int], media_type: str = "movie") -> bool:
    """Verifies year match between torrent title and target year."""
    if not target_year or target_year <= 0:
        return True
    years = extract_years(torrent_title)
    if not years:
        return True

    ty = int(target_year)
    is_movie = (media_type or "").lower() == "movie"
    is_tv = (media_type or "").lower() == "tv"

    if is_movie:
        return any(abs(y - ty) <= 1 for y in years)

    if is_tv:
        is_s1 = bool(re.search(r'(?i)\b(s0?1\b|1\s*сезон|сезон\s*0?1|season\s*0?1|1[-_ ]?й\s*сезон)\b', torrent_title))
        has_later = bool(re.search(r'(?i)\b(s0?[2-9]\b|s[1-9]\d\b|[2-9]\s*сезон|сезон\s*[2-9]|season\s*[2-9])\b', torrent_title))
        if is_s1 and not has_later:
            return any(abs(y - ty) <= 1 for y in years)
        if has_later:
            return any(ty - 1 <= y <= ty + 15 for y in years)
        return any(abs(y - ty) <= 1 for y in years)

    return any(abs(y - ty) <= 1 for y in years)


def is_matching_torrent(
    torrent_title: str,
    target_title: str,
    target_year: Optional[int] = None,
    media_type: str = "movie",
    original_title: Optional[str] = None
) -> bool:
    """End-to-end check whether a torrent release matches target title, year, and media type."""
    if not torrent_title or not target_title:
        return False
    if is_executable_release(torrent_title):
        return False
    if is_unsupported_media_release(torrent_title):
        return False

    is_movie = (media_type or "").lower() == "movie"
    is_tv = (media_type or "").lower() == "tv"

    if is_movie:
        if is_tv_release(torrent_title):
            return False
        if is_unwanted_sequel(torrent_title, target_title):
            return False
        if original_title and is_unwanted_sequel(torrent_title, original_title):
            return False

    if is_tv:
        if re.search(r'(?i)\b(полнометражный\s*фильм|фильм\b|movie\b)\b', torrent_title) and not is_tv_release(torrent_title):
            return False

    if target_year and not is_matching_year(torrent_title, target_year, media_type):
        return False

    if not is_matching_title(torrent_title, target_title, original_title):
        return False

    return True


def filter_torrents(
    items: List[Dict],
    target_title: str,
    target_year: Optional[int] = None,
    media_type: str = "movie",
    original_title: Optional[str] = None,
    min_seeders: int = 1
) -> List[Dict]:
    """Filters torrent list against target title, year, media type, and safety rules."""
    matched = []
    for item in items:
        title = item.get("Title") or item.get("title") or ""
        seeders = item.get("Seeders") or item.get("seeders") or item.get("sid") or item.get("seeds") or 0
        s_count = int(seeders) if str(seeders).isdigit() else 0
        if s_count < min_seeders:
            continue
        if is_matching_torrent(title, target_title, target_year, media_type, original_title):
            matched.append(item)
    return matched

