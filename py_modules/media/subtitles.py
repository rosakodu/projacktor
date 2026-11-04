import os
import re
import time
import hashlib
import shutil
import urllib.parse
import urllib.request
import subprocess
import logging

from ..core.env import get_bin_path
from ..core.process import _clean_env
from ..db import CONFIG_DIR
from ..torrserver import extract_ts_files, TorrServerManager

try:
    import chardet
except ImportError:
    chardet = None

logger = logging.getLogger("projacktor.media.subtitles")

BITMAP_SUBTITLE_CODECS = {
    'hdmv_pgs_subtitle', 'pgssub', 'pgs', 'dvd_subtitle',
    'dvdsub', 'vobsub', 'dvb_subtitle', 'xsub'
}


def is_bitmap_subtitle(codec_name: str) -> bool:
    """Checks whether the subtitle codec is bitmap-based (unsupported in web player)."""
    return (codec_name or '').lower() in BITMAP_SUBTITLE_CODECS


def detect_and_ensure_utf8(raw_data: bytes) -> bytes:
    """Ensures raw subtitle data is decoded and re-encoded into clean UTF-8."""
    if not raw_data:
        return b""
    if isinstance(raw_data, str):
        raw_data = raw_data.encode('utf-8', errors='ignore')

    # UTF-8 with BOM
    if raw_data.startswith(b'\xef\xbb\xbf'):
        raw_data = raw_data[3:]

    # UTF-16 LE with BOM
    if raw_data.startswith(b'\xff\xfe'):
        try:
            return raw_data[2:].decode('utf-16-le').encode('utf-8')
        except Exception:
            pass

    # UTF-16 BE with BOM
    if raw_data.startswith(b'\xfe\xff'):
        try:
            return raw_data[2:].decode('utf-16-be').encode('utf-8')
        except Exception:
            pass

    try:
        raw_data.decode('utf-8')
        return raw_data
    except UnicodeDecodeError:
        pass

    if chardet is not None:
        try:
            detected = chardet.detect(raw_data[:4096])
            enc = detected.get('encoding')
            if enc and detected.get('confidence', 0.0) >= 0.7:
                return raw_data.decode(enc, errors='replace').encode('utf-8')
        except Exception:
            pass

    for enc in ['cp1251', 'koi8-r', 'cp866', 'iso-8859-5', 'latin1']:
        try:
            return raw_data.decode(enc).encode('utf-8')
        except UnicodeDecodeError:
            continue

    return raw_data


# Alias for backward compatibility
ensure_utf8_subtitles = detect_and_ensure_utf8


def finalize_vtt(data: bytes) -> bytes:
    """Ensures WebVTT format is valid and trims trailing incomplete cue blocks."""
    if not data or len(data) < 10:
        return b"WEBVTT\n\n"
    if isinstance(data, str):
        data = data.encode('utf-8')
    text = data.decode('utf-8', errors='ignore').lstrip('\ufeff')
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    if text.startswith("WEBVTT"):
        text = re.sub(r"^WEBVTT[^\n]*\n*", "", text)

    blocks = re.split(r"\n\s*\n", text)
    valid_blocks = ["WEBVTT"]
    for b in blocks:
        b_clean = b.strip()
        if "-->" in b_clean:
            lines = [l for l in b_clean.split("\n") if l.strip()]
            if len(lines) >= 2 and any("-->" in l for l in lines):
                valid_blocks.append(b_clean)
    return ("\n\n".join(valid_blocks) + "\n\n").encode('utf-8')


def convert_subtitles_to_vtt(raw_data: bytes, timeout: float = 15.0) -> bytes | None:
    """Converts raw subtitle bytes (SRT, ASS, SSA) to WebVTT format via FFmpeg pipe."""
    if not raw_data:
        return None
    raw_utf8 = detect_and_ensure_utf8(raw_data)
    ffmpeg_bin = get_bin_path("ffmpeg")
    env = _clean_env()
    cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "webvtt", "pipe:1"]
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
        vtt_out, _ = proc.communicate(input=raw_utf8, timeout=timeout)
        if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64]:
            return finalize_vtt(vtt_out)
    except Exception as e:
        logger.debug(f"[convert_subtitles_to_vtt] conversion failed: {e}")
    return None



def find_external_subtitles(source: str, ts_mgr=None) -> list:
    """
    Detects external subtitle files (.srt, .ass, .vtt, .ssa) associated with the given video source.
    Works for both TorrServer online streams and local disk files.
    """
    tracks = []
    sub_exts = ('.srt', '.ass', '.vtt', '.ssa')
    try:
        parsed = urllib.parse.urlparse(source)
        is_http = source.startswith(('http://', 'https://'))

        if is_http and ('link=' in parsed.query or 'torrserver' in source.lower() or ':8095' in source):
            qs = urllib.parse.parse_qs(parsed.query)
            thash = qs.get('link', [''])[0] or qs.get('hash', [''])[0]
            chosen_id = qs.get('index', [''])[0] or qs.get('id', [''])[0]

            mgr = ts_mgr or TorrServerManager()
            if thash and mgr:
                t_info = mgr.get_torrent(thash)
                ts_files = extract_ts_files(t_info)
                if not ts_files:
                    try:
                        mgr.add_torrent(f"magnet:?xt=urn:btih:{thash}")
                    except Exception:
                        pass
                    for attempt in range(6):
                        time.sleep(0.5)
                        t_info = mgr.get_torrent(thash)
                        ts_files = extract_ts_files(t_info)
                        if ts_files:
                            logger.info(f"[find_external_subtitles] TorrServer metadata loaded on attempt {attempt+1}")
                            break
                if ts_files:
                    current_video_file = None
                    if chosen_id:
                        current_video_file = next((f for f in ts_files if str(f.get('id')) == chosen_id), None)
                    if not current_video_file:
                        raw_vname = urllib.parse.unquote(os.path.basename(parsed.path))
                        current_video_file = next((f for f in ts_files if os.path.basename(f.get('path', '')) == raw_vname), None)

                    video_path = current_video_file.get('path', '') if current_video_file else urllib.parse.unquote(os.path.basename(parsed.path))
                    video_name = os.path.basename(video_path)

                    sub_candidates = [f for f in ts_files if f.get('path', '').lower().endswith(sub_exts)]
                    logger.info(f"[find_external_subtitles] Searching subs for hash {thash}, video={video_name}, raw sub files={len(sub_candidates)}")
                    if sub_candidates:
                        ep_match = re.search(r'(?:s\d+e|ep|e|серия)\s*(\d{1,4})\b', video_name, re.IGNORECASE)
                        if ep_match and len(sub_candidates) > 1:
                            video_ep = int(ep_match.group(1))
                            ep_matched = []
                            for sf in sub_candidates:
                                sf_name = os.path.basename(sf.get('path', ''))
                                sf_match = re.search(r'(?:s\d+e|ep|e|серия)\s*(\d{1,4})\b', sf_name, re.IGNORECASE)
                                if sf_match and int(sf_match.group(1)) == video_ep:
                                    ep_matched.append(sf)
                            if ep_matched:
                                sub_candidates = ep_matched
                        elif len(sub_candidates) > 1:
                            video_stem = os.path.splitext(video_name)[0].lower()
                            stem_matched = [sf for sf in sub_candidates if video_stem in sf.get('path', '').lower()]
                            if stem_matched:
                                sub_candidates = stem_matched

                        for sf in sub_candidates:
                            sf_id = sf.get('id')
                            sf_path = sf.get('path', '')
                            sf_name = os.path.basename(sf_path)
                            sf_ext = os.path.splitext(sf_name)[1].lower().lstrip('.')
                            p_lower = sf_path.lower()
                            if any(x in p_lower for x in ['rus', 'ru', 'рус', 'russian']):
                                lang = 'rus'
                            elif any(x in p_lower for x in ['eng', 'en', 'english']):
                                lang = 'eng'
                            else:
                                lang = 'und'

                            parent_dir = os.path.basename(os.path.dirname(sf_path))
                            if parent_dir and parent_dir != '.' and parent_dir.lower() not in ['subs', 'subtitles', 'sub']:
                                title = f"{parent_dir} ({sf_name})"
                            else:
                                title = f"Внешние ({sf_name})"

                            sub_url = f"{mgr.base_url}/stream/{urllib.parse.quote(sf_name)}?link={thash}&index={sf_id}&play"
                            tracks.append({
                                "index": f"ext_{sf_id}",
                                "codec": sf_ext,
                                "lang": lang,
                                "title": title,
                                "url": sub_url
                            })

        elif not is_http and os.path.exists(source):
            folder = os.path.dirname(source)
            video_name = os.path.basename(source)
            video_stem = os.path.splitext(video_name)[0].lower()

            sub_candidates = []
            for root, _, files in os.walk(folder):
                for f in files:
                    if f.lower().endswith(sub_exts):
                        sub_candidates.append(os.path.join(root, f))

            if sub_candidates:
                ep_match = re.search(r'(?:s\d+e|ep|e|серия)\s*(\d{1,4})\b', video_name, re.IGNORECASE)
                if ep_match and len(sub_candidates) > 1:
                    video_ep = int(ep_match.group(1))
                    ep_matched = []
                    for sf_path in sub_candidates:
                        sf_name = os.path.basename(sf_path)
                        sf_match = re.search(r'(?:s\d+e|ep|e|серия)\s*(\d{1,4})\b', sf_name, re.IGNORECASE)
                        if sf_match and int(sf_match.group(1)) == video_ep:
                            ep_matched.append(sf_path)
                    if ep_matched:
                        sub_candidates = ep_matched
                elif len(sub_candidates) > 1:
                    stem_matched = [sf for sf in sub_candidates if video_stem in sf.lower()]
                    if stem_matched:
                        sub_candidates = stem_matched

                for idx, sf_path in enumerate(sub_candidates):
                    sf_name = os.path.basename(sf_path)
                    sf_ext = os.path.splitext(sf_name)[1].lower().lstrip('.')
                    p_lower = sf_path.lower()
                    if any(x in p_lower for x in ['rus', 'ru', 'рус', 'russian']):
                        lang = 'rus'
                    elif any(x in p_lower for x in ['eng', 'en', 'english']):
                        lang = 'eng'
                    else:
                        lang = 'und'
                    parent_dir = os.path.basename(os.path.dirname(sf_path))
                    if parent_dir and parent_dir != '.' and parent_dir.lower() not in ['subs', 'subtitles', 'sub']:
                        title = f"{parent_dir} ({sf_name})"
                    else:
                        title = f"Внешние ({sf_name})"
                    tracks.append({
                        "index": f"ext_{idx}",
                        "codec": sf_ext,
                        "lang": lang,
                        "title": title,
                        "url": sf_path
                    })
    except Exception as e:
        logger.warning(f"[find_external_subtitles] Error finding external subtitles: {e}")
    tracks.sort(key=lambda t: 0 if t.get('lang') == 'rus' or any(x in t.get('title', '').lower() for x in ['rus', 'рус', 'ru']) else 1)
    if tracks:
        logger.info(f"[find_external_subtitles] Detected {len(tracks)} external subtitle tracks")
    return tracks


def prewarm_subtitle_cache(sub_url: str, video_source: str = "", track_idx: str = "", cache_dir: str = "") -> str:
    """Pre-downloads and converts an external subtitle file into the WebVTT disk cache in background."""
    try:
        target_cache_dir = cache_dir or os.path.join(CONFIG_DIR, "cache", "subs")
        os.makedirs(target_cache_dir, exist_ok=True)

        cache_key_sub = hashlib.md5(f"{sub_url}_".encode('utf-8')).hexdigest() + ".vtt"
        path_sub = os.path.join(target_cache_dir, cache_key_sub)

        path_fallback = None
        if video_source and track_idx:
            cache_key_fallback = hashlib.md5(f"{video_source}_{track_idx}".encode('utf-8')).hexdigest() + ".vtt"
            path_fallback = os.path.join(target_cache_dir, cache_key_fallback)

        if os.path.isfile(path_sub) and os.path.getsize(path_sub) > 10:
            if path_fallback and not os.path.isfile(path_fallback):
                try:
                    shutil.copyfile(path_sub, path_fallback)
                except Exception:
                    pass
            return path_sub

        is_http = sub_url.startswith(("http://", "https://"))
        raw_sub = None
        if is_http:
            req = urllib.request.Request(sub_url)
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw_sub = resp.read()
        else:
            with open(sub_url, 'rb') as f:
                raw_sub = f.read()

        if not raw_sub:
            return ""

        vtt_out = convert_subtitles_to_vtt(raw_sub, timeout=10.0)
        if vtt_out:
            with open(path_sub, 'wb') as cf:
                cf.write(vtt_out)
            if path_fallback:
                try:
                    with open(path_fallback, 'wb') as cf:
                        cf.write(vtt_out)
                except Exception:
                    pass
            return path_sub
    except Exception as e:
        logger.debug(f"[prewarm_subtitle_cache] Failed for {sub_url}: {e}")
    return ""
