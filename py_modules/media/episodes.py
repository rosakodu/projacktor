import os
import re
import logging

logger = logging.getLogger("projacktor.media.episodes")

VIDEO_EXTENSIONS = {
    '.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov',
    '.m4v', '.wmv', '.flv', '.3gp', '.m2ts', '.mpg', '.mpeg'
}


def natural_keys(text: str) -> list:
    """Produces list of integers and lowercased string fragments for natural sorting."""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(text or ''))]


# Alias for backward compatibility
natural_sort_key = natural_keys


def parse_season_episode(text: str) -> tuple[int, int]:
    """
    Parses season and episode numbers from filename or release title.
    Returns (season, episode_number), with 999999 as fallback episode number.
    """
    if not text:
        return (1, 999999)

    base, _ = os.path.splitext(os.path.basename(str(text)))

    # 1. Match S01E02, s1e2, s01.e02, etc.
    m = re.search(r'[sS](\d+)[\.\s_-]*[eE](\d+)', base)
    if m:
        return (int(m.group(1)), int(m.group(2)))

    # 2. Match 1x02, 01x02
    m = re.search(r'(\d+)[xX](\d+)', base)
    if m:
        return (int(m.group(1)), int(m.group(2)))

    # 3. Match Season/Сезон
    s_m = re.search(r'(?:[sS]eason|[сС]езон)\s*(\d+)', base, re.I)
    season = int(s_m.group(1)) if s_m else 1

    # 4. Match Episode/Серия/Сер/Эпизод/Ep/E
    e_m = re.search(r'(?:[eE]pisode|[eE]p\.?|[сС]ерия|[сС]ер\.?|[эЭ]пизод)\s*(\d+)', base, re.I)
    if e_m:
        return (season, int(e_m.group(1)))

    # 5. Match number before серия (e.g. "5 серия")
    e_m2 = re.search(r'(\d+)\s*(?:серия|сер|выпуск|эпизод)', base, re.I)
    if e_m2:
        return (season, int(e_m2.group(1)))

    # 6. Anime / clean standalone episode number
    cleaned = re.sub(
        r'(?i)\b(1080p|720p|480p|2160p|4k|x264|x265|h264|h265|hevc|bdrip|web-dl|webrip|dvdrip|aac|dts|flac|mp3|rus|eng|jap|sub|dub)\b',
        ' ',
        base
    )
    cleaned = re.sub(r'\b(19\d\d|20\d\d)\b', ' ', cleaned)

    # 6a. Explicit dash-separated episode (e.g. ' - 05', ' - [01]', ' - (01)', ' - 04v2')
    m_dash = re.search(r'(?:^|[\s_])-\s*[\[\(]?(\d{1,4})(?:v\d)?[\]\)]?(?:[\s\-_\.#\[\]\(\)]|$)', cleaned)
    if m_dash:
        return (season, int(m_dash.group(1)))

    # 6b. Bracketed / parenthesized episode number (e.g. '[01]', '(01)')
    m_bracket = re.search(r'[\[\(](\d{1,4})(?:v\d)?[\]\)]', cleaned)
    if m_bracket:
        return (season, int(m_bracket.group(1)))

    # 6c. Standalone number (take rightmost to avoid leading title numbers)
    matches = re.findall(r'(?:^|[\s\-_\.#\[\(])(\d{1,4})(?:v\d)?(?:[\s\-_\.#\]\)]|$)', cleaned)
    if matches:
        return (season, int(matches[-1]))

    return (season, 999999)


def episode_sort_key(ep) -> tuple[int, int, list]:
    """Generates comparison tuple (season, episode, natural_keys) for sorting episodes."""
    if isinstance(ep, str):
        name = ep
    elif isinstance(ep, dict):
        name = ep.get('name', '') or ep.get('path', '') or ep.get('file_name', '') or ''
    else:
        name = str(ep or '')

    season, ep_num = parse_season_episode(name)
    return (season, ep_num, natural_keys(name))


def find_target_episode(episodes: list[dict], file_index: int | str) -> dict | None:
    """Finds an episode dict from an episode list matching the given file_index."""
    if not episodes:
        return None
    try:
        f_idx = int(file_index)
    except (ValueError, TypeError):
        return None

    for ep in episodes:
        if isinstance(ep, dict):
            idx = ep.get('file_index')
            if idx is None:
                idx = ep.get('index')
            try:
                if idx is not None and int(idx) == f_idx:
                    return ep
            except (ValueError, TypeError):
                pass
    if 1 <= f_idx <= len(episodes):
        candidate = episodes[f_idx - 1]
        if isinstance(candidate, dict):
            return candidate
    return None


def filter_video_files(file_list: list[dict], path_key: str = 'path') -> list[dict]:
    """Filters a list of file dicts to only those having recognized video extensions."""
    result = []
    for item in file_list:
        if isinstance(item, dict):
            p = item.get(path_key) or ''
        else:
            p = str(item or '')
        if not p:
            continue
        ext = os.path.splitext(p)[1].lower()
        if ext in VIDEO_EXTENSIONS:
            result.append(item)
    return result



def match_episode_to_file(
    af_list: list[dict],
    target_name: str = "",
    target_season: int = 1,
    target_ep_num: int = 999999,
    target_size: int = 0,
    fallback_idx: int = 0
) -> dict | None:
    """
    Unified 5-tier matching engine to associate a target episode with an aria2 file item.
    Tier 1: Exact basename match
    Tier 2: Alphanumeric normalized basename match
    Tier 3: Season and episode number match
    Tier 4: File length match within 64KB tolerance
    Tier 5: Fallback positional video file index
    """
    if not af_list:
        return None

    # Tier 1: Exact basename match
    if target_name:
        t_clean = target_name.lower().strip()
        for af in af_list:
            if not isinstance(af, dict):
                continue
            p = af.get('path') or ''
            if not p:
                continue
            if os.path.basename(p).lower().strip() == t_clean:
                return af

    # Tier 2: Alphanumeric normalized basename match
    if target_name:
        norm_target = re.sub(r'[^a-z0-9а-яё]', '', target_name.lower())
        if norm_target:
            for af in af_list:
                if not isinstance(af, dict):
                    continue
                p = af.get('path') or ''
                if not p:
                    continue
                norm_p = re.sub(r'[^a-z0-9а-яё]', '', os.path.basename(p).lower())
                if norm_target == norm_p:
                    return af

    # Tier 3: Season and episode match
    if target_ep_num != 999999:
        for af in af_list:
            if not isinstance(af, dict):
                continue
            p = af.get('path') or ''
            if not p:
                continue
            af_s, af_e = parse_season_episode(p)
            if af_e != 999999 and af_e == target_ep_num and af_s == target_season:
                return af

    # Tier 4: File size match within 64KB tolerance
    if target_size > 0:
        for af in af_list:
            if not isinstance(af, dict):
                continue
            try:
                af_len = int(af.get('length', 0) or 0)
                if abs(af_len - target_size) < 65536:
                    return af
            except (ValueError, TypeError):
                pass

    # Tier 5: Fallback video index
    if fallback_idx > 0:
        video_afs = filter_video_files(af_list, path_key='path')
        if 1 <= fallback_idx <= len(video_afs):
            return video_afs[fallback_idx - 1]

    return None


def match_aria2_file(
    af_list: list[dict],
    target_ep: dict | None = None,
    target_name: str = "",
    ep_index: int | None = None
) -> dict | None:
    """Convenience adapter over match_episode_to_file extracting metadata from target_ep."""
    t_name = target_name
    t_season = 1
    t_num = 999999
    t_size = 0
    fallback_idx = ep_index or 0

    if target_ep and isinstance(target_ep, dict):
        if not t_name:
            t_name = target_ep.get('name') or target_ep.get('path') or target_ep.get('file_name') or ''
        raw_season = target_ep.get('season_number')
        if raw_season is not None and str(raw_season).strip() != "":
            try:
                t_season = int(raw_season)
            except (ValueError, TypeError):
                t_season = 1
        elif t_name:
            t_season, _ = parse_season_episode(t_name)

        parsed_num = target_ep.get('episode_number')
        if parsed_num is not None:
            try:
                t_num = int(parsed_num)
            except (ValueError, TypeError):
                pass
        if t_num == 999999 and t_name:
            _, t_num = parse_season_episode(t_name)
        try:
            t_size = int(target_ep.get('size', 0) or 0)
        except (ValueError, TypeError):
            t_size = 0
        if not fallback_idx:
            try:
                fallback_idx = int(target_ep.get('file_index', 0) or target_ep.get('index', 0) or 0)
            except (ValueError, TypeError):
                fallback_idx = 0

    return match_episode_to_file(
        af_list,
        target_name=t_name,
        target_season=t_season,
        target_ep_num=t_num,
        target_size=t_size,
        fallback_idx=fallback_idx
    )


def collect_candidate_paths(
    ddir: str,
    target_name: str = "",
    target_path: str = "",
    matched_path: str = ""
) -> set[str]:
    """Collects all candidate file paths on disk for an episode to support cleanup / deletion."""
    candidate_paths = set()

    for p in (matched_path, target_path):
        if p:
            candidate_paths.add(p)
            if ddir and not os.path.isabs(p):
                candidate_paths.add(os.path.join(ddir, p))

    if ddir and os.path.isdir(ddir) and target_name:
        t_lower = target_name.lower().strip()
        t_noext = os.path.splitext(t_lower)[0]
        for root, _, files in os.walk(ddir):
            for f in files:
                f_clean = f[:-6] if f.endswith('.aria2') else f
                f_lower = f_clean.lower().strip()
                if f_lower == t_lower or os.path.splitext(f_lower)[0] == t_noext:
                    candidate_paths.add(os.path.join(root, f_clean))

    return candidate_paths


def sort_episodes(episodes: list) -> list:
    """Sorts episodes list in place by season and episode number."""
    if episodes:
        episodes.sort(key=episode_sort_key)
    return episodes
