"""Subtitles handler for /api/stream/subtitles."""

import os
import hashlib
import urllib.parse
import urllib.request

from ..core.env import CONFIG_DIR, logger
from ..media.subtitles import (
    is_bitmap_subtitle,
    find_external_subtitles,
    convert_subtitles_to_vtt
)
from ..stream import unwrap_stream_source, probe_media_file
from .subtitles_extract import extract_embedded_vtt
from .stream_local import check_stream_security

EMPTY_VTT = b"WEBVTT\n\n"


def _send_vtt(handler, vtt_data: bytes, cache_control: str = 'no-cache'):
    handler.send_response(200)
    handler.send_cors_headers()
    handler.send_header('Content-Type', 'text/vtt; charset=utf-8')
    handler.send_header('Content-Length', str(len(vtt_data)))
    handler.send_header('Cache-Control', cache_control)
    handler.end_headers()
    try:
        handler.wfile.write(vtt_data)
    except Exception:
        pass


def _handle_external_sub(handler, actual_sub_source: str, cache_path: str):
    sub_is_http = actual_sub_source.startswith(("http://", "https://"))
    raw_sub = None
    try:
        if sub_is_http:
            with urllib.request.urlopen(urllib.request.Request(actual_sub_source), timeout=20) as resp:
                raw_sub = resp.read()
        else:
            with open(actual_sub_source, 'rb') as f:
                raw_sub = f.read()
    except Exception as e:
        logger.error(f"[stream_subtitles] Failed to fetch external subtitle: {e}")

    if raw_sub:
        vtt_out = raw_sub if (actual_sub_source.lower().endswith('.vtt') and b"WEBVTT" in raw_sub[:64]) else convert_subtitles_to_vtt(raw_sub, timeout=15)
        if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64] and b"-->" in vtt_out:
            try:
                with open(cache_path, 'wb') as cf:
                    cf.write(vtt_out)
            except Exception:
                pass
            _send_vtt(handler, vtt_out, 'public, max-age=86400')
            return
    _send_vtt(handler, EMPTY_VTT)


def handle_stream_subtitles(handler, path="", query=None):
    query = query or {}
    filepath = query.get('file', [''])[0]
    source = unwrap_stream_source(filepath or query.get('url', [''])[0])
    track_idx, start_val = str(query.get('track', [''])[0]), query.get('start', [''])[0]
    try:
        start_sec = max(0.0, float(start_val)) if start_val else 0.0
    except Exception:
        start_sec = 0.0

    if not source:
        handler.send_response(400)
        handler.send_cors_headers()
        handler.end_headers()
        return

    is_http = source.startswith(("http://", "https://"))
    source = check_stream_security(handler, source, is_http, filepath or source)
    if not source:
        return

    cache_dir = os.path.join(CONFIG_DIR, "cache", "subs")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, hashlib.md5(f"{source}_{track_idx}".encode('utf-8')).hexdigest() + ".vtt")

    if start_sec == 0.0 and os.path.isfile(cache_path) and os.path.getsize(cache_path) > 10:
        try:
            with open(cache_path, 'rb') as f:
                cdata = f.read()
            if b"WEBVTT" in cdata[:64] and b"-->" in cdata:
                _send_vtt(handler, cdata, 'public, max-age=86400')
                return
        except Exception:
            pass

    actual_sub_source = None
    if (urllib.parse.urlparse(source).path if is_http else source).lower().endswith(('.srt', '.vtt', '.ass', '.ssa')):
        actual_sub_source = source
    elif track_idx.startswith('ext_'):
        for es in find_external_subtitles(source):
            if str(es.get('index')) in (track_idx, f"ext_{track_idx.replace('ext_', '').strip()}"):
                actual_sub_source = es.get('url')
                break

    if actual_sub_source:
        _handle_external_sub(handler, actual_sub_source, cache_path)
        return
    if track_idx.startswith('ext_'):
        _send_vtt(handler, EMPTY_VTT)
        return

    if track_idx:
        for sub in probe_media_file(source).get('subtitle_tracks', []):
            if str(sub.get('index')) == track_idx and (is_bitmap_subtitle(sub.get('codec')) or not sub.get('supported', True)):
                logger.info(f"[stream_subtitles] Track {track_idx} is bitmap subtitle ({sub.get('codec')}), returning empty WebVTT")
                _send_vtt(handler, EMPTY_VTT)
                return

    vtt_out, completed_full = extract_embedded_vtt(source, track_idx, start_sec, is_http)
    if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64] and b"-->" in vtt_out:
        if completed_full and start_sec == 0:
            try:
                with open(cache_path, 'wb') as cf:
                    cf.write(vtt_out)
            except Exception:
                pass
        _send_vtt(handler, vtt_out, 'public, max-age=86400' if (completed_full and start_sec == 0) else 'no-cache')
    else:
        _send_vtt(handler, EMPTY_VTT)
