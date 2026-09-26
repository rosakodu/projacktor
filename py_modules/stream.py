import os
import json
import urllib.parse
import subprocess

from .db import logger
from .common import get_bin_path, _clean_env

PROBE_CACHE = {}

def is_header_ready(filepath):
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
            # Check for zeroed-out preallocated blocks
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
            # General fallback: non-zero
            return True
    except Exception as e:
        logger.debug(f"is_header_ready check error for {filepath}: {e}")
        return False

def unwrap_stream_source(source):
    """Recursively unwraps internal /api/stream proxy URLs to get the real source (local file path or TorrServer URL)."""
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

def _parse_ffprobe_data(data):
    vcodec, acodec = None, None
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
        if s.get('codec_type') == 'video':
            if not vcodec:
                vcodec = s.get('codec_name')
            if not width or not height:
                try:
                    width = int(s.get('width', 0) or 0)
                    height = int(s.get('height', 0) or 0)
                except Exception:
                    pass
        elif s.get('codec_type') == 'audio':
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
        elif s.get('codec_type') == 'subtitle':
            codec_name = (s.get('codec_name') or '').lower()
            tags = s.get('tags', {})
            is_bitmap = codec_name in ['hdmv_pgs_subtitle', 'pgssub', 'pgs', 'dvd_subtitle', 'dvdsub', 'vobsub', 'dvb_subtitle', 'xsub']
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
    return vcodec, acodec, duration, audio_tracks, subtitle_tracks, width, height

def _normalize_probe_key(filepath):
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

def probe_media_file(filepath):
    cache_key = _normalize_probe_key(filepath)
    if cache_key in PROBE_CACHE:
        return PROBE_CACHE[cache_key]
    
    filepath = unwrap_stream_source(filepath)
    is_http = filepath.startswith("http://") or filepath.startswith("https://")
    if not is_http:
        if not os.path.exists(filepath):
            return {}
        if not is_header_ready(filepath):
            return {}

    ffprobe_bin = get_bin_path("ffprobe")
    probesize = "1500000" if is_http else "6000000"
    analyzeduration = "2000000" if is_http else "4000000"

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
        if is_http and "127.0.0.1:8095" in probe_url and "/stream" in probe_url and "&play" not in probe_url:
            probe_url += "&play"
        cmd.append(probe_url)
        env = _clean_env()
        out = subprocess.check_output(cmd, env=env, timeout=timeout).decode('utf-8')
        return json.loads(out)

    probe_timeout = 10.0 if is_http else 4.0
    try:
        data = run_ffprobe(probesize, analyzeduration, probe_timeout)
        vcodec, acodec, duration, audio_tracks, subtitle_tracks, width, height = _parse_ffprobe_data(data)

        # Если для HTTP потока субтитры не обнаружены при первом быстром проходе,
        # делаем второй проход с увеличенным размером пробы (6MB / 5s),
        # так как субтитры часто находятся дальше в заголовках MKV/MP4 контейнеров
        if is_http and len(subtitle_tracks) == 0:
            try:
                retry_data = run_ffprobe("6000000", "5000000", 3.0)
                _, _, r_dur, r_audio, r_subs, r_w, r_h = _parse_ffprobe_data(retry_data)
                if r_subs:
                    subtitle_tracks = r_subs
                    logger.info(f"[probe_media_file] Retry found {len(r_subs)} subtitle tracks")
                if len(r_audio) > len(audio_tracks):
                    audio_tracks = r_audio
                if r_dur > duration:
                    duration = r_dur
                if r_w and r_h:
                    width, height = r_w, r_h
            except Exception as e:
                logger.debug(f"[probe_media_file] Retry probe skipped/failed: {e}")
        
        # Direct playback in Chromium HTML5 <video> is ONLY supported for non-HTTP local files in MP4/WebM with H264/VP8/VP9 and AAC/MP3.
        # Online / TorrServer streams ALWAYS require remux/transcode in http_server and are never direct.
        ext = os.path.splitext(filepath.split('?')[0])[1].lower()
        direct = (
            (not is_http) and
            (vcodec in ['h264', 'avc1', 'vp8', 'vp9']) and 
            (acodec in ['aac', 'mp3']) and 
            (ext in ['.mp4', '.m4v', '.webm'])
        )
        res = {
            "vcodec": vcodec,
            "acodec": acodec,
            "width": width,
            "height": height,
            "duration": duration,
            "direct": direct,
            "audio_tracks": audio_tracks,
            "subtitle_tracks": subtitle_tracks,
            "status": "direct_play" if direct else "needs_transcode"
        }
        if vcodec or (is_http and duration > 0):
            if len(PROBE_CACHE) >= 256:
                try:
                    PROBE_CACHE.pop(next(iter(PROBE_CACHE)))
                except Exception:
                    pass
            PROBE_CACHE[filepath] = res
        return res
    except subprocess.TimeoutExpired:
        logger.warning(f"probe_media_file timeout ({probe_timeout}s) for {filepath}")
        return {
            "vcodec": "h264",
            "acodec": "unknown",
            "width": 0,
            "height": 0,
            "duration": 0.0,
            "direct": False,
            "audio_tracks": [],
            "subtitle_tracks": [],
            "status": "timeout"
        }
    except Exception as e:
        logger.error(f"probe_media_file error: {e}")
        return {
            "vcodec": "h264",
            "acodec": "unknown",
            "width": 0,
            "height": 0,
            "duration": 0.0,
            "direct": False,
            "audio_tracks": [],
            "subtitle_tracks": [],
            "status": "error"
        }

