import os
import json
import urllib.parse
import subprocess
import threading
import logging

from ..core.hardware import has_nvenc_support
from ..core.env import get_bin_path
from ..core.process import _clean_env
from ..constants import PROBE_CACHE_MAX_SIZE

logger = logging.getLogger("projacktor.media.probe")

_PROBE_LOCK = threading.Lock()
PROBE_CACHE = {}
_PROBE_IN_FLIGHT = {}


def is_header_ready(filepath: str) -> bool:
    """Verifies that the media container header is ready and non-zero."""
    try:
        if not filepath or not os.path.isfile(filepath):
            return False
        sz = os.path.getsize(filepath)
        if sz < 1024:
            return False
        with open(filepath, 'rb') as f:
            header = f.read(32)
            if len(header) < 4:
                return False
            # Zeroed-out preallocated blocks
            if header[:4] == b'\x00\x00\x00\x00':
                return False
            # Matroska / WebM EBML ID: 0x1A 0x45 0xDF 0xA3
            if header[:4] == b'\x1a\x45\xdf\xa3':
                return True
            # MP4 / MOV / M4V
            if b'ftyp' in header or b'moov' in header or b'mdat' in header:
                return True
            # AVI: RIFF....AVI
            if header[:4] == b'RIFF':
                return True
            # MPEG-TS sync byte 0x47
            if header[0] == 0x47:
                return True
            return True
    except Exception as e:
        logger.debug(f"is_header_ready check error for {filepath}: {e}")
        return False


def unwrap_stream_source(source: str) -> str:
    """Recursively unwraps internal /api/stream proxy URLs to get the real source."""
    if not source:
        return source
    for _ in range(5):
        if not (('/api/stream' in source or 'url=' in source or 'file=' in source) and ('?' in source)):
            break
        try:
            parsed_src = urllib.parse.urlparse(source)
            qs = urllib.parse.parse_qs(parsed_src.query)
            if 'file' in qs and qs['file'][0]:
                source = qs['file'][0]
            elif 'url' in qs and qs['url'][0]:
                source = qs['url'][0]
            else:
                break
        except Exception:
            break
    return source


def parse_ffprobe_data(data: dict) -> tuple:
    """Parses raw ffprobe JSON output into structured media metadata."""
    vcodec, acodec = None, None
    pix_fmt = ""
    color_transfer = ""
    duration = 0.0
    width = 0
    height = 0
    try:
        duration = float(data.get('format', {}).get('duration', 0.0))
    except (ValueError, TypeError):
        pass

    if duration <= 0:
        for s in data.get('streams', []):
            try:
                s_dur = float(s.get('duration', 0.0))
                if s_dur > duration:
                    duration = s_dur
            except (ValueError, TypeError):
                pass
            tags = s.get('tags', {})
            dur_str = tags.get('DURATION', '') or tags.get('duration', '')
            if dur_str and ':' in dur_str:
                try:
                    parts = dur_str.split(':')
                    if len(parts) == 3:
                        s_dur = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                        if s_dur > duration:
                            duration = s_dur
                except (ValueError, TypeError):
                    pass

    audio_tracks = []
    subtitle_tracks = []
    for s in data.get('streams', []):
        codec_type = s.get('codec_type')
        if codec_type == 'video':
            if not vcodec:
                vcodec = s.get('codec_name')
            if not width or not height:
                try:
                    width = int(s.get('width', 0) or 0)
                    height = int(s.get('height', 0) or 0)
                except Exception:
                    pass
            if not pix_fmt:
                pix_fmt = s.get('pix_fmt', '') or ''
            if not color_transfer:
                color_transfer = s.get('color_transfer', '') or ''
        elif codec_type == 'audio':
            if not acodec:
                acodec = s.get('codec_name')
            tags = s.get('tags', {})
            audio_tracks.append({
                "index": s.get('index'),
                "codec": s.get('codec_name'),
                "channels": s.get('channels', 2),
                "lang": tags.get('language', tags.get('lang', '')),
                "title": tags.get('title', f"Аудио #{s.get('index')}")
            })
        elif codec_type == 'subtitle':
            codec_name = (s.get('codec_name') or '').lower()
            tags = s.get('tags', {})
            is_bitmap = codec_name in [
                'hdmv_pgs_subtitle', 'pgssub', 'pgs', 'dvd_subtitle',
                'dvdsub', 'vobsub', 'dvb_subtitle', 'xsub'
            ]
            sub_title = tags.get('title', f"Субтитры #{s.get('index')}")
            if is_bitmap:
                sub_title = f"{sub_title} (графические)"
            subtitle_tracks.append({
                "index": s.get('index'),
                "codec": codec_name,
                "supported": not is_bitmap,
                "lang": tags.get('language', tags.get('lang', '')),
                "title": sub_title
            })
    return vcodec, acodec, duration, audio_tracks, subtitle_tracks, width, height, pix_fmt, color_transfer


# Alias for backward compatibility
_parse_ffprobe_data = parse_ffprobe_data


def _normalize_probe_key(filepath: str) -> str:
    unwrapped = unwrap_stream_source(filepath)
    try:
        parsed = urllib.parse.urlparse(unwrapped)
        if parsed.query:
            qs = urllib.parse.parse_qs(parsed.query)
            filtered = {k: v for k, v in qs.items() if k in ['link', 'index', 'file', 'url']}
            new_query = urllib.parse.urlencode(filtered, doseq=True)
            return urllib.parse.urlunparse(parsed._replace(query=new_query))
    except Exception:
        pass
    return unwrapped


def probe_media_file(filepath: str) -> dict:
    """Probes media file metadata and determines direct-play capability."""
    cache_key = _normalize_probe_key(filepath)
    event_to_wait = None
    with _PROBE_LOCK:
        if cache_key in PROBE_CACHE:
            cached = PROBE_CACHE[cache_key]
            return cached.copy() if isinstance(cached, dict) else cached
        if cache_key in _PROBE_IN_FLIGHT:
            event_to_wait = _PROBE_IN_FLIGHT[cache_key]
        else:
            evt = threading.Event()
            _PROBE_IN_FLIGHT[cache_key] = evt

    if event_to_wait is not None:
        event_to_wait.wait(timeout=22.0)
        with _PROBE_LOCK:
            cached = PROBE_CACHE.get(cache_key)
            if cached:
                return cached.copy() if isinstance(cached, dict) else cached

    try:
        filepath = unwrap_stream_source(filepath)
        is_http = filepath.startswith("http://") or filepath.startswith("https://")
        if not is_http:
            if not os.path.exists(filepath):
                return {}
            if not is_header_ready(filepath):
                return {}

        ffprobe_bin = get_bin_path("ffprobe")
        probesize = "2500000" if is_http else "6000000"
        analyzeduration = "2500000" if is_http else "4000000"

        def run_ffprobe(psize, adur, timeout):
            cmd = [
                ffprobe_bin,
                "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-show_format",
                "-probesize", str(psize),
                "-analyzeduration", str(adur),
            ]
            if is_http:
                cmd += [
                    "-reconnect", "1",
                    "-reconnect_at_eof", "1",
                    "-reconnect_streamed", "1",
                    "-reconnect_delay_max", "2"
                ]
            probe_url = filepath
            if is_http and ("127.0.0.1:" in probe_url or "localhost:" in probe_url) and "/stream/" in probe_url:
                if "&play" not in probe_url and "?play" not in probe_url:
                    probe_url += ("&play" if "?" in probe_url else "?play")
            cmd.append(probe_url)
            env = _clean_env()
            out = subprocess.check_output(cmd, env=env, timeout=timeout).decode('utf-8')
            return json.loads(out)

        probe_timeout = 25.0 if is_http else 15.0
        try:
            data = run_ffprobe(probesize, analyzeduration, probe_timeout)
            vcodec, acodec, duration, audio_tracks, subtitle_tracks, width, height, pix_fmt, color_transfer = parse_ffprobe_data(data)

            is_10bit_probe = any(tag in (pix_fmt or '').lower() for tag in ['10le', '10be', 'p010', 'yuv420p10'])
            ext = os.path.splitext(filepath.split('?')[0])[1].lower()

            is_webm_native = (vcodec in ['vp8', 'vp9']) and (acodec in ['opus', 'vorbis']) and (ext in ['.webm'])
            can_direct_mp4 = has_nvenc_support()
            is_mp4_native = can_direct_mp4 and (vcodec in ['h264', 'avc1']) and (acodec in ['aac', 'mp3']) and (ext in ['.mp4', '.m4v'])

            direct = (
                (not is_http) and
                (not is_10bit_probe) and
                (is_webm_native or is_mp4_native)
            )
            res = {
                "vcodec": vcodec,
                "acodec": acodec,
                "width": width,
                "height": height,
                "pix_fmt": pix_fmt,
                "color_transfer": color_transfer,
                "duration": duration,
                "direct": direct,
                "audio_tracks": audio_tracks,
                "subtitle_tracks": subtitle_tracks,
                "status": "direct_play" if direct else "needs_transcode"
            }
            if vcodec or (is_http and duration > 0):
                with _PROBE_LOCK:
                    if len(PROBE_CACHE) >= PROBE_CACHE_MAX_SIZE:
                        try:
                            oldest_key = next(iter(PROBE_CACHE))
                            del PROBE_CACHE[oldest_key]
                        except Exception:
                            pass
                    PROBE_CACHE[cache_key] = res
            return res
        except subprocess.TimeoutExpired:
            logger.warning(f"probe_media_file timeout ({probe_timeout}s) for {filepath}")
            return {
                "vcodec": "unknown",
                "acodec": "unknown",
                "width": 0,
                "height": 0,
                "pix_fmt": "",
                "color_transfer": "",
                "duration": 0.0,
                "direct": False,
                "audio_tracks": [],
                "subtitle_tracks": [],
                "status": "timeout"
            }
        except Exception as e:
            logger.error(f"probe_media_file error: {e}")
            return {
                "vcodec": "unknown",
                "acodec": "unknown",
                "width": 0,
                "height": 0,
                "pix_fmt": "",
                "color_transfer": "",
                "duration": 0.0,
                "direct": False,
                "audio_tracks": [],
                "subtitle_tracks": [],
                "status": "error"
            }
    finally:
        with _PROBE_LOCK:
            finished_evt = _PROBE_IN_FLIGHT.pop(cache_key, None)
            if finished_evt:
                finished_evt.set()
