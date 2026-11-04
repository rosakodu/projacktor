"""Stream handlers for /api/stream, /api/stream/stop, /api/stream/probe, /api/stream/torrent_status."""

import os
import time
import urllib.parse
import threading

from ..db.settings_repo import load_settings
from ..stream import unwrap_stream_source, is_header_ready, probe_media_file
from ..transcoder import resolve_transcode_plan
from .stream_pipe import stream_ffmpeg, stop_all_active_streams
from .stream_local import check_stream_security, stream_local_file


def handle_stream(handler, path="", query=None):
    query = query or {}
    url, filepath = query.get('url', [''])[0], query.get('file', [''])[0]
    source = unwrap_stream_source(url or filepath)
    if not source:
        handler.send_response(400)
        handler.send_cors_headers()
        handler.end_headers()
        return

    is_http = source.startswith(("http://", "https://"))
    source = check_stream_security(handler, source, is_http, filepath)
    if not source:
        return

    t_mode, start_time, audio_idx = query.get('transcode', ['auto'])[0], query.get('start', ['0'])[0], query.get('audio', [''])[0]
    is_online = is_http or query.get('online', ['0'])[0] == '1' or query.get('follow', ['0'])[0] == '1' or os.path.exists(source + ".aria2")
    if is_online and not is_http:
        w_start = time.time()
        while time.time() - w_start < 30 and (not os.path.exists(source) or not is_header_ready(source)):
            time.sleep(0.5)

    info = probe_media_file(source)
    clean_ext = os.path.splitext(source.split('?')[0])[1].lower()
    user_max_res = (load_settings().get("transcode_max_res") or "auto").lower()
    plan = resolve_transcode_plan(media_info=info, audio_idx=audio_idx, is_http=is_http, transcode_mode=t_mode, user_max_res=user_max_res)
    stream_container = plan.get("container", "webm" if plan.get("hw_accel") in ["vaapi", "none"] else "mp4")
    content_type = "video/webm" if stream_container == "webm" else "video/mp4"

    valid_native = ['.webm'] if stream_container == 'webm' else ['.mp4', '.m4v']
    remux = is_http or (clean_ext not in valid_native) or plan["audio_needs_transcode"]
    native_local = (not is_http) and (clean_ext in valid_native) and (not plan["audio_needs_transcode"]) and (not plan["video_needs_transcode"])
    must_transcode = False if (native_local and t_mode != '1') else ((t_mode == '1') or (t_mode == 'auto' and (plan["audio_needs_transcode"] or plan["video_needs_transcode"] or remux)))

    if must_transcode and t_mode != '0':
        stream_ffmpeg(handler, source, plan, start_time, audio_idx, is_http, is_online, stream_container, content_type)
        return
    if not must_transcode and is_http:
        handler.send_response(302)
        handler.send_header("Location", source)
        handler.send_cors_headers()
        handler.end_headers()
        return
    stream_local_file(handler, source)


def handle_stream_stop(handler, path="", query=None):
    stop_all_active_streams()
    handler.send_json({"success": True})


def handle_stream_probe(handler, path="", query=None):
    query = query or {}
    filepath = query.get('file', [''])[0]
    source = unwrap_stream_source(filepath or query.get('url', [''])[0])
    if not source:
        handler.send_json({"error": "missing file or url parameter"}, 400)
        return
    is_http = source.startswith(("http://", "https://"))
    source = check_stream_security(handler, source, is_http, filepath or source)
    if not source:
        return

    from ..media.subtitles import find_external_subtitles, prewarm_subtitle_cache
    ext_subs = find_external_subtitles(source)
    if ext_subs:
        for es in ext_subs:
            if es.get('url'):
                threading.Thread(target=prewarm_subtitle_cache, args=(es['url'], source, str(es.get('index', ''))), daemon=True).start()

    res_info = dict(probe_media_file(source))
    res_info['subtitle_tracks'] = (ext_subs + list(res_info.get('subtitle_tracks', []))) if ext_subs else list(res_info.get('subtitle_tracks', []))
    handler.send_json(res_info)


def handle_stream_torrent_status(handler, path="", query=None):
    query = query or {}
    thash = (query.get('hash', [''])[0] or '').lower()
    if not thash and query.get('url', [''])[0]:
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(query['url'][0]).query)
        thash = (qs.get('link', [''])[0] or '').lower()
    ts = getattr(handler.app_context, 'ts', None) if handler.app_context else None
    if thash and ts:
        st = ts.get_torrent_status(thash)
        if st:
            handler.send_json({"success": True, "status": st})
            return
    handler.send_json({"success": False, "status": None})
