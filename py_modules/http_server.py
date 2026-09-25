plugin_instance = None
import os
import json
import time
import shutil
import urllib.request
import urllib.parse
import urllib.error
import subprocess
import re
import hashlib
import select
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import threading

from .db import CONFIG_DIR, get_user_home, get_db, logger
from .common import load_settings, save_settings, ping_jacred, normalize_jacred_url, get_ssl_context, get_bin_path, _clean_env, has_vaapi_support, is_executable_release
from .stream import unwrap_stream_source, is_header_ready, probe_media_file
from .torrserver import extract_hash_from_magnet, extract_ts_files
from .transcoder import resolve_transcode_plan, build_ffmpeg_stream_command

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def ensure_utf8_subtitles(raw_data: bytes) -> bytes:
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
    for enc in ['cp1251', 'koi8-r', 'cp866', 'iso-8859-5', 'latin1']:
        try:
            return raw_data.decode(enc).encode('utf-8')
        except UnicodeDecodeError:
            continue
    return raw_data

def finalize_vtt(data: bytes) -> bytes:
    """Ensures WebVTT format is valid and trims trailing incomplete cue blocks."""
    if not data or len(data) < 10:
        return b"WEBVTT\n\n"
    text = data.decode('utf-8', errors='ignore')
    if not text.startswith("WEBVTT"):
        text = "WEBVTT\n\n" + text
    blocks = text.split("\n\n")
    valid_blocks = ["WEBVTT"]
    for b in blocks[1:]:
        b_clean = b.strip()
        if "-->" in b_clean:
            lines = [l for l in b_clean.split("\n") if l.strip()]
            if len(lines) >= 2 and any("-->" in l for l in lines):
                valid_blocks.append(b_clean)
    return ("\n\n".join(valid_blocks) + "\n\n").encode('utf-8')

def find_external_subtitles(source: str):
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
            
            ts_mgr = getattr(plugin_instance, 'ts', None) or TorrServerManager()
            if thash and ts_mgr:
                t_info = ts_mgr.get_torrent(thash)
                ts_files = extract_ts_files(t_info)
                if not ts_files:
                    try:
                        ts_mgr.add_torrent(f"magnet:?xt=urn:btih:{thash}")
                    except Exception:
                        pass
                    for attempt in range(6):
                        time.sleep(0.5)
                        t_info = ts_mgr.get_torrent(thash)
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
                                
                            sub_url = f"{ts_mgr.base_url}/stream/{urllib.parse.quote(sf_name)}?link={thash}&index={sf_id}&play"
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

def prewarm_subtitle_cache(sub_url: str, video_source: str = "", track_idx: str = ""):
    """Pre-downloads and converts an external subtitle file into the WebVTT disk cache in background."""
    try:
        cache_dir = os.path.join(CONFIG_DIR, "cache", "subs")
        os.makedirs(cache_dir, exist_ok=True)

        cache_key_sub = hashlib.md5(f"{sub_url}_".encode('utf-8')).hexdigest() + ".vtt"
        path_sub = os.path.join(cache_dir, cache_key_sub)

        path_fallback = None
        if video_source and track_idx:
            cache_key_fallback = hashlib.md5(f"{video_source}_{track_idx}".encode('utf-8')).hexdigest() + ".vtt"
            path_fallback = os.path.join(cache_dir, cache_key_fallback)

        if os.path.isfile(path_sub) and os.path.getsize(path_sub) > 10:
            if path_fallback and not os.path.isfile(path_fallback):
                try:
                    shutil.copyfile(path_sub, path_fallback)
                except Exception:
                    pass
            return

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
            return

        raw_sub = ensure_utf8_subtitles(raw_sub)
        ffmpeg_bin = get_bin_path("ffmpeg")
        env = _clean_env()
        cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "webvtt", "pipe:1"]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
        vtt_out, _ = proc.communicate(input=raw_sub, timeout=5)

        if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64]:
            with open(path_sub, 'wb') as cf:
                cf.write(vtt_out)
            if path_fallback:
                try:
                    with open(path_fallback, 'wb') as cf:
                        cf.write(vtt_out)
                except Exception:
                    pass
    except Exception as e:
        logger.debug(f"[prewarm_subtitle_cache] Failed for {sub_url}: {e}")

class ProjacktorRequestHandler(BaseHTTPRequestHandler):
    def _is_origin_allowed(self):
        origin = self.headers.get('Origin', '')
        if not origin or origin == 'null':
            return True
        return any(origin.startswith(prefix) for prefix in [
            'http://127.0.0.1', 'http://localhost', 'https://steamloopback.host', 'steam://'
        ])

    def send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        if origin and origin != 'null' and self._is_origin_allowed():
            self.send_header('Access-Control-Allow-Origin', origin)
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            self._handle_api_get(path, query)
        else:
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()

    def do_POST(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_post(parsed.path)

    def do_PATCH(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_patch(parsed.path)

    def do_PUT(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_put(parsed.path)
            
    def do_DELETE(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_delete(parsed.path)


    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def _get_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0: return {}
            body = self.rfile.read(length)
            return json.loads(body)
        except Exception as e:
            logger.warning(f"Error parsing request body: {e}")
            return {}

    def _handle_api_get(self, path, query):
        if path.startswith('/api/tmdb/'):
            self._handle_tmdb(path, query)
        elif path.startswith('/api/jacred/search'):
            self._handle_jacred_search(query)
        elif path == '/api/jacred/status':
            self._handle_jacred_status()
        elif path == '/api/image':
            self._handle_image_proxy(query)
        elif path == '/api/downloads':
            self._handle_downloads_list()
        elif path == '/api/downloads/stats':
            self._handle_downloads_stats()
        elif path == '/api/library':
            self._handle_library_list()
        elif path.startswith('/api/library/'):
            id_str = path.split('/')[-1]
            if id_str.isdigit():
                self._handle_library_details(id_str)
        elif path == '/api/stream':
            self._handle_stream(query)
        elif path == '/api/stream/probe':
            self._handle_stream_probe(query)
        elif path == '/api/stream/subtitles':
            self._handle_stream_subtitles(query)
        elif path == '/api/settings':
            self._send_json(load_settings())
        elif path == '/api/status':
            dm_running = bool(plugin_instance and plugin_instance.dm and plugin_instance.dm._running)
            self._send_json({"aria2c": "running" if dm_running else "stopped"})
        elif path == '/api/disk':
            sett = load_settings()
            dp = os.path.expanduser(sett['download_path'])
            try:
                total, used, free = shutil.disk_usage(dp)
            except Exception as e:
                logger.warning(f"Error checking disk usage for {dp}: {e}")
                free = 0
            self._send_json({"free": free})
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_api_post(self, path):
        if path == '/api/downloads':
            body = self._get_body()
            self._handle_downloads_add(body)
        elif path == '/api/downloads/resume_all':
            if plugin_instance and plugin_instance.dm:
                plugin_instance.dm.unpause_all()
            db = get_db()
            try:
                cursor = db.cursor()
                rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
                if plugin_instance and plugin_instance.dm:
                    for r in rows:
                        if r['aria2_gid']:
                            try:
                                plugin_instance.dm.resume(r['aria2_gid'])
                            except Exception as e:
                                logger.warning(f"Failed to resume GID {r['aria2_gid']}: {e}")
                cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
                db.commit()
            finally:
                db.close()
            if plugin_instance and plugin_instance.dm:
                plugin_instance.dm._update_db()
            self._send_json({"success": True})
        else:
            self.send_response(404)
            self.end_headers()
            
    def _handle_api_patch(self, path):
        if path.startswith('/api/downloads/'):
            did = path.split('/')[-1]
            body = self._get_body()
            act = body.get('action')
            db = get_db()
            try:
                row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            finally:
                db.close()
            if row and row['aria2_gid'] and plugin_instance and plugin_instance.dm:
                gid = row['aria2_gid']
                if act == 'pause':
                    plugin_instance.dm.pause(gid)
                elif act == 'resume':
                    plugin_instance.dm.resume(gid)
            self._send_json({"success": True})
        elif path.startswith('/api/library/'):
            lid = path.split('/')[-1]
            body = self._get_body()
            db = get_db()
            try:
                db.execute("UPDATE media_files SET watch_progress=?, watched=? WHERE id=?", (body.get('progress', 0), body.get('watched', 0), lid))
                db.commit()
            finally:
                db.close()
            self._send_json({"success": True})
            
    def _handle_api_put(self, path):
        if path == '/api/settings':
            body = self._get_body()
            save_settings(body)
            self._send_json({"success": True})

    def _handle_api_delete(self, path):
        if path.startswith('/api/downloads/'):
            did = path.split('/')[-1]
            db = get_db()
            try:
                row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
                if row and row['aria2_gid']:
                    if plugin_instance and plugin_instance.dm:
                        plugin_instance.dm.remove(row['aria2_gid'])
                db.execute("DELETE FROM downloads WHERE id=?", (did,))
                db.commit()
            finally:
                db.close()
            self._send_json({"success": True})
        elif path.startswith('/api/library/'):
            mid = path.split('/')[-1]
            db = get_db()
            try:
                files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
                for f in files:
                    try:
                        os.remove(f['file_path'])
                    except Exception as e:
                        logger.warning(f"Error removing file {f.get('file_path')}: {e}")
                db.execute("DELETE FROM media WHERE id=?", (mid,))
                db.commit()
            finally:
                db.close()
            self._send_json({"success": True})

    tmdb_cache = {}
    
    def _handle_tmdb(self, path, query):
        sett = load_settings()
        api_key = sett.get('tmdb_api_key', '4ef0d7355d9ffb5151e987764708ce96')
        lang = sett.get('language', 'ru')
        
        endpoint = path.replace('/api/tmdb', '')
        
        default_lang = "en-US" if str(lang).lower().startswith("en") else f"{lang}-{str(lang).upper()}"
        q_params = {'api_key': api_key, 'language': default_lang}
        for k, v in query.items():
            q_params[k] = v[0]
            
        primary_url = f"https://deckyloader.ru/tmdb-api/3{endpoint}?{urllib.parse.urlencode(q_params)}"
        fallback_url = f"https://api.themoviedb.org/3{endpoint}?{urllib.parse.urlencode(q_params)}"
        url = primary_url
        
        ttl = 1800 if "search" in endpoint else 7200
        now = time.time()
        
        if url in self.tmdb_cache:
            cache_time, data = self.tmdb_cache[url]
            if now - cache_time < ttl:
                self._send_json(data)
                return
                
        disk_cache_dir = os.path.join(CONFIG_DIR, "cache", "tmdb")
        os.makedirs(disk_cache_dir, exist_ok=True)
        cache_key = hashlib.md5(url.encode('utf-8')).hexdigest()
        cache_file = os.path.join(disk_cache_dir, f"{cache_key}.json")
        
        if os.path.exists(cache_file):
            try:
                mtime = os.path.getmtime(cache_file)
                if now - mtime < ttl:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self.tmdb_cache[url] = (mtime, data)
                    self._send_json(data)
                    return
            except Exception:
                pass
                
        data = None
        last_err = None
        for fetch_url in [primary_url, fallback_url]:
            try:
                req = urllib.request.Request(
                    fetch_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/json"
                    }
                )
                ctx = get_ssl_context()
                with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    self.tmdb_cache[url] = (now, data)
                    try:
                        with open(cache_file, "w", encoding="utf-8") as f:
                            json.dump(data, f)
                    except Exception:
                        pass
                    self._send_json(data)
                    return
            except Exception as e:
                last_err = e
                logger.warning(f"Failed to fetch TMDB from {fetch_url}: {e}")
                continue

        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.tmdb_cache[url] = (now, data)
                self._send_json(data)
                return
            except Exception:
                pass
        self._send_json({"error": str(last_err)}, 500)

    def _handle_image_proxy(self, query):
        img_path = query.get('path', [''])[0].lstrip('/')
        url_param = query.get('url', [''])[0]
        size = query.get('size', ['w342'])[0]

        if not img_path and url_param:
            parsed = urllib.parse.urlparse(url_param)
            parts = parsed.path.strip('/').split('/')
            if len(parts) >= 3 and parts[0] == 't' and parts[1] == 'p':
                size = parts[2]
                img_path = '/'.join(parts[3:])
            else:
                img_path = parts[-1]

        if not img_path:
            self.send_response(400)
            self.end_headers()
            return
            
        cache_dir = os.path.join(CONFIG_DIR, "cache", "images", size)
        os.makedirs(cache_dir, exist_ok=True)
        local_file = os.path.join(cache_dir, os.path.basename(img_path))
        
        if os.path.isfile(local_file) and os.path.getsize(local_file) > 200:
            with open(local_file, 'rb') as f:
                content = f.read()
            ctype = 'image/webp' if (content.startswith(b'RIFF') and b'WEBP' in content[:12]) else ('image/png' if content.startswith(b'\x89PNG') else 'image/jpeg')
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'public, max-age=31536000')
            self.end_headers()
            self.wfile.write(content)
            return
            
        target_urls = [
            f"https://deckyloader.ru/tmdb-image/t/p/{size}/{img_path}",
            f"https://image.tmdb.org/t/p/{size}/{img_path}"
        ]
        content = None
        for target_url in target_urls:
            try:
                req = urllib.request.Request(
                    target_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    }
                )
                ctx = get_ssl_context()
                with urllib.request.urlopen(req, timeout=12, context=ctx) as response:
                    content = response.read()
                    if len(content) > 200:
                        break
            except Exception as e:
                logger.warning(f"Failed to fetch image {target_url}: {e}")
                continue

        if content and len(content) > 200:
            try:
                with open(local_file, 'wb') as f:
                    f.write(content)
            except Exception:
                pass
            ctype = 'image/webp' if (content.startswith(b'RIFF') and b'WEBP' in content[:12]) else ('image/png' if content.startswith(b'\x89PNG') else 'image/jpeg')
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'public, max-age=31536000')
            self.end_headers()
            self.wfile.write(content)
            return

        self.send_response(404)
        self.send_cors_headers()
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Image not found')

    def _handle_jacred_search(self, query):
        sett = load_settings()
        url = normalize_jacred_url(sett.get('jacred_url') or '')
        if not url:
            self._send_json([])
            return

        q = query.get('query', [''])[0]
        c = query.get('category', [''])[0]
        
        target = f"{url}/api/v2.0/indexers/all/results?apikey=1&Query={urllib.parse.quote(q)}"
        if c:
            for cat_id in c.split(','):
                cat_clean = cat_id.strip()
                if cat_clean:
                    target += f"&Category[]={cat_clean}"
            
        try:
            req = urllib.request.Request(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            )
            ctx = get_ssl_context()
            with urllib.request.urlopen(req, timeout=12, context=ctx) as response:
                raw = json.loads(response.read().decode('utf-8'))
                items = raw.get("Results", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])
                normalized = []
                for item in items:
                    title = item.get("Title") or item.get("title") or ""
                    size = item.get("Size") or item.get("size") or 0
                    seeders = item.get("Seeders") or item.get("seeders") or item.get("sid") or 0
                    peers = item.get("Peers") or item.get("peers") or item.get("pir") or 0
                    magnet = item.get("MagnetUri") or item.get("magnet") or item.get("Link") or item.get("link") or ""
                    tracker = item.get("Tracker") or item.get("tracker") or "tracker"
                    # Auto-detect quality from title (including TS, TeleSync, TC, CAM, WEB-DL, BDRip, etc.)
                    quality = ""
                    title_l = title.lower()
                    is_ts = bool(re.search(r'\b(telesync|tsrip|hdts|hd-ts)\b|(?:\s|^|[\[\(/])ts(?:\s|$|[\]\)/])', title_l))
                    is_cam = bool(re.search(r'\b(camrip|hdcam)\b|(?:\s|^|[\[\(/])cam(?:\s|$|[\]\)/])', title_l))
                    is_tc = bool(re.search(r'\b(telecine)\b|(?:\s|^|[\[\(/])tc(?:\s|$|[\]\)/])', title_l))

                    res = ""
                    for rk in ["2160p", "4k", "4к", "uhd", "1080p", "720p"]:
                        if rk in title_l:
                            res = "4K" if rk in ["2160p", "4k", "4к", "uhd"] else rk
                            break

                    if is_ts:
                        quality = f"TS {res}".strip()
                    elif is_cam:
                        quality = f"CAM {res}".strip()
                    elif is_tc:
                        quality = f"TC {res}".strip()
                    elif res:
                        quality = res
                    else:
                        for qk in ["HDRip", "BDRip", "BDRemux", "BluRay", "WEB-DL", "WEBRip", "DVDRip"]:
                            if qk.lower() in title_l:
                                quality = qk
                                break
                            
                    details = item.get("Details") or item.get("details") or item.get("url") or ""

                    # Строгий запрет на показ и выдачу любых раздач с .exe и исполняемыми файлами
                    if is_executable_release(title, magnet) or is_executable_release(details):
                        logger.warning(f"JacRed search blocked suspicious/executable torrent: {title}")
                        continue

                    s_count = int(seeders) if str(seeders).isdigit() else 0
                    p_count = int(peers) if str(peers).isdigit() else 0
                    normalized.append({
                        "title": title,
                        "size": size,
                        "seeders": s_count,
                        "seeds": s_count,
                        "peers": p_count,
                        "quality": quality,
                        "magnet": magnet,
                        "tracker": tracker,
                        "details": details
                    })
                self._send_json(normalized)
        except Exception as e:
            logger.error(f"JacRed search error: {e}")
            self._send_json([])
            
    def _handle_jacred_status(self):
        sett = load_settings()
        url = normalize_jacred_url(sett.get('jacred_url') or '')
        if not url:
            self._send_json({"status": False})
            return
        self._send_json({"status": ping_jacred(url, timeout=5)})

    def _handle_downloads_list(self):
        db = get_db()
        try:
            dls = db.execute("""
                SELECT d.*, 
                       COALESCE(m.title, d.torrent_title, 'Медиа') AS title,
                       m.year,
                       m.poster_path,
                       m.backdrop_path,
                       m.media_type,
                       m.overview
                FROM downloads d
                LEFT JOIN media m ON d.media_id = m.id
                ORDER BY d.id DESC
            """).fetchall()
            self._send_json([dict(row) for row in dls])
        finally:
            db.close()
        
    def _handle_downloads_stats(self):
        stats = plugin_instance.dm.get_global_stats() if (plugin_instance and plugin_instance.dm) else {}
        self._send_json(stats or {})

    def _handle_downloads_add(self, body):
        sett = load_settings()
        magnet = body.get('magnet')
        tmdb_id = body.get('tmdb_id')
        title = body.get('title', 'Медиа')
        year = body.get('year', '')
        mtype = body.get('media_type', 'movie')
        quality = body.get('quality', '')
        poster_path = body.get('poster_path', '')
        backdrop_path = body.get('backdrop_path', '')
        overview = body.get('overview', '')
        
        base_dir = os.path.expanduser(sett['download_path'])
        folder = "Фильмы" if mtype == 'movie' else "Сериалы"
        safe_title = re.sub(r'[/\\?%*:|"<>!]', '', title).strip() or "Media"
        ddir = os.path.join(base_dir, folder, f"{safe_title} ({year})".strip())
        os.makedirs(ddir, exist_ok=True)
        
        gid = plugin_instance.dm.add_download(magnet, ddir) if (plugin_instance and plugin_instance.dm) else None
        
        db = get_db()
        try:
            cursor = db.cursor()
            cursor.execute("SELECT id FROM media WHERE tmdb_id=?", (tmdb_id,))
            row = cursor.fetchone()
            if not row:
                cursor.execute("""
                    INSERT INTO media (tmdb_id, title, year, media_type, poster_path, backdrop_path, overview)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (tmdb_id, title, year, mtype, poster_path, backdrop_path, overview))
                mid = cursor.lastrowid
            else:
                mid = row['id']
                cursor.execute("""
                    UPDATE media 
                    SET poster_path=COALESCE(NULLIF(poster_path, ''), ?),
                        backdrop_path=COALESCE(NULLIF(backdrop_path, ''), ?),
                        overview=COALESCE(NULLIF(overview, ''), ?)
                    WHERE id=?
                """, (poster_path, backdrop_path, overview, mid))
                
            cursor.execute("""
                INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                VALUES (?, ?, ?, ?, ?, 'queued', ?)
            """, (mid, magnet, f"{title} ({quality})".strip(), ddir, gid, quality))
            new_dl_id = cursor.lastrowid
            db.commit()
        finally:
            db.close()
        
        self._send_json({"success": True, "id": new_dl_id, "gid": gid})

    def _handle_library_list(self):
        db = get_db()
        try:
            rows = db.execute("""
                SELECT m.*, 
                       COUNT(f.id) AS file_count, 
                       COALESCE(SUM(f.file_size), 0) AS total_file_size,
                       d.id AS download_id,
                       d.status AS download_status,
                       d.progress AS download_progress,
                       d.download_speed,
                       d.total_size AS download_total_size,
                       d.downloaded_size AS download_downloaded_size,
                       d.aria2_gid,
                       COALESCE(m.magnet_uri, d.magnet_uri) AS effective_magnet,
                       COALESCE(m.quality, d.quality) AS effective_quality,
                       COALESCE(m.torrent_title, d.torrent_title) AS effective_torrent_title,
                       COALESCE(m.download_dir, d.download_dir) AS effective_download_dir
                FROM media m
                LEFT JOIN media_files f ON m.id = f.media_id
                LEFT JOIN downloads d ON m.id = d.media_id
                WHERE m.in_library = 1 OR d.id IS NOT NULL OR f.id IS NOT NULL
                GROUP BY m.id
                ORDER BY m.id DESC
            """).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                m_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY id ASC", (d['id'],)).fetchall()
                files_list = [dict(f) for f in m_files]
                if not files_list and d.get('effective_download_dir') and os.path.isdir(d['effective_download_dir']):
                    for root, _, fnames in os.walk(d['effective_download_dir']):
                        for fn in sorted(fnames):
                            if os.path.splitext(fn)[1].lower() in {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}:
                                fp = os.path.join(root, fn)
                                if not os.path.exists(fp + ".aria2"):
                                    try:
                                        sz = os.path.getsize(fp)
                                    except Exception:
                                        sz = 0
                                    files_list.append({"file_path": fp, "file_name": fn, "file_size": sz})
                d['files'] = files_list
                result.append(d)
            self._send_json(result)
        finally:
            db.close()
        
    def _handle_library_details(self, lid):
        db = get_db()
        try:
            media = db.execute("SELECT * FROM media WHERE id=?", (lid,)).fetchone()
            files = db.execute("SELECT * FROM media_files WHERE media_id=?", (lid,)).fetchall()
            if media:
                res = dict(media)
                res['files'] = [dict(f) for f in files]
                self._send_json(res)
            else:
                self._send_json({"error": "not found"}, 404)
        finally:
            db.close()

    def _handle_stream(self, query):
        url = query.get('url', [''])[0]
        filepath = query.get('file', [''])[0]
        source = unwrap_stream_source(url or filepath)

        if not source:
            self.send_response(400)
            self.end_headers()
            return

        is_http = source.startswith("http://") or source.startswith("https://")

        # Security check for local files to prevent path traversal
        if not is_http:
            real_path = os.path.realpath(source)
            sett = load_settings()
            allowed_dirs = [
                os.path.realpath(os.path.expanduser(sett.get('download_path', '~/Videos/Projacktor'))),
                os.path.realpath(CONFIG_DIR),
                "/run/media",
                get_user_home()
            ]
            if not any(real_path.startswith(ad) for ad in allowed_dirs):
                logger.warning(f"Path traversal attempt blocked: {filepath}")
                self.send_response(403)
                self.end_headers()
                return
            if not os.path.exists(real_path):
                self.send_response(404)
                self.end_headers()
                return
            source = real_path
        else:
            # For HTTP streams, verify it is local TorrServer or loopback
            parsed = urllib.parse.urlparse(source)
            if parsed.hostname not in ['127.0.0.1', 'localhost', '::1']:
                logger.warning(f"External stream URL rejected: {source}")
                self.send_response(403)
                self.end_headers()
                return

            # Ensure TorrServer is running and torrent is present
            if 'link=' in parsed.query and plugin_instance and plugin_instance.ts:
                try:
                    plugin_instance.ts.ensure_running()
                    qs = urllib.parse.parse_qs(parsed.query)
                    thash = (qs.get('link', [''])[0] or '').lower()
                    if thash:
                        t_info = plugin_instance.ts.get_torrent(thash)
                        if not t_info or not t_info.get('data'):
                            db = get_db()
                            try:
                                row = db.execute("SELECT magnet_uri, title, poster_path FROM media WHERE magnet_uri LIKE ? LIMIT 1", (f"%{thash}%",)).fetchone()
                                if not row:
                                    row = db.execute("SELECT magnet_uri, torrent_title as title, '' as poster_path FROM downloads WHERE magnet_uri LIKE ? LIMIT 1", (f"%{thash}%",)).fetchone()
                                mag = row['magnet_uri'] if (row and row['magnet_uri']) else f"magnet:?xt=urn:btih:{thash}"
                                ttl = row['title'] if (row and row['title']) else ""
                                pst = row['poster_path'] if (row and row['poster_path']) else ""
                                logger.info(f"[Stream] Auto-restoring torrent {thash} in TorrServer before playback...")
                                plugin_instance.ts.add_torrent(mag, title=ttl, poster=pst)
                            finally:
                                db.close()
                except Exception as e:
                    logger.debug(f"[Stream] Auto-heal TorrServer error: {e}")

        transcode_mode = query.get('transcode', ['auto'])[0]
        start_time = query.get('start', ['0'])[0]
        audio_idx = query.get('audio', [''])[0]
        is_online = (is_http or 
                     query.get('online', ['0'])[0] == '1' or 
                     query.get('follow', ['0'])[0] == '1' or 
                     os.path.exists(source + ".aria2"))
        
        if is_online and not is_http:
            # Wait up to 30 seconds for torrent header to be downloaded and written to disk
            start_wait = time.time()
            while time.time() - start_wait < 30:
                if os.path.exists(source) and is_header_ready(source):
                    break
                time.sleep(0.5)

        info = probe_media_file(source)
        clean_ext = os.path.splitext(source.split('?')[0])[1].lower()

        sett = load_settings()
        user_max_res = (sett.get("transcode_max_res") or "auto").lower()

        plan = resolve_transcode_plan(
            media_info=info,
            audio_idx=audio_idx,
            is_http=is_http,
            transcode_mode=transcode_mode,
            user_max_res=user_max_res
        )

        logger.info(
            f"[Transcoder] source={clean_ext} vcodec={plan['vcodec']} acodec={plan['acodec']} "
            f"profile='{plan['profile_name']}' docked={plan['is_docked']} hw_accel={plan['hw_accel']}"
        )

        container_needs_remux = is_http or (clean_ext not in ['.mp4', '.m4v', '.webm']) or plan["audio_needs_transcode"]
        is_native_local = (not is_http) and (clean_ext in ['.mp4', '.m4v', '.webm']) and (not plan["audio_needs_transcode"]) and (not plan["video_needs_transcode"])

        if is_native_local and transcode_mode != '1':
            must_transcode = False
        else:
            must_transcode = (transcode_mode == '1') or (transcode_mode == 'auto' and (plan["audio_needs_transcode"] or plan["video_needs_transcode"] or container_needs_remux))

        if must_transcode and transcode_mode != '0':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'none')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()

            f_start = 0.0
            try:
                f_start = float(start_time)
            except Exception:
                pass

            cmd = build_ffmpeg_stream_command(
                source=source,
                plan=plan,
                start_time=f_start,
                audio_idx=audio_idx,
                is_http=is_http,
                is_online=is_online
            )

            env = _clean_env()
            logger.info(f"[Stream] FFmpeg cmd: {' '.join(cmd[:6])}... source={source[:80]}")
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                bufsize=1024*1024
            )

            # Drain stderr in a background thread to prevent pipe buffer deadlock
            stderr_lines = []
            import threading
            def _drain_stderr():
                try:
                    for line in proc.stderr:
                        try:
                            txt = line.decode('utf-8', errors='replace').rstrip()
                            if txt:
                                stderr_lines.append(txt)
                                logger.warning(f"[FFmpeg] {txt}")
                        except Exception:
                            pass
                except Exception:
                    pass
            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()

            try:
                chunk_size = 128 * 1024
                # Wait for first chunk with a timeout to detect dead streams early
                import select
                ready = select.select([proc.stdout], [], [], 15.0)
                if not ready[0]:
                    logger.error(f"[Stream] FFmpeg produced no output in 15s, killing. stderr: {'; '.join(stderr_lines[-5:])}")
                    proc.kill()
                    proc.wait(timeout=2)
                    return
                while True:
                    data = proc.stdout.read(chunk_size)
                    if not data:
                        break
                    self.wfile.write(data)
            except Exception:
                pass
            finally:
                if proc:
                    try:
                        proc.terminate()
                        try:
                            proc.wait(timeout=1.5)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait(timeout=1.0)
                    except Exception as e:
                        logger.debug(f"[Stream] Error reaping FFmpeg process: {e}")
                    try:
                        proc.stdout.close()
                    except Exception:
                        pass
                    try:
                        proc.stderr.close()
                    except Exception:
                        pass
                    stderr_thread.join(timeout=1.0)
                    if stderr_lines:
                        logger.info(f"[Stream] FFmpeg stderr summary ({len(stderr_lines)} lines): {'; '.join(stderr_lines[-3:])}")
            return
        else:
            if not must_transcode and is_http:
                # Прямой редирект на TorrServer вместо попытки чтения файла через os.path.getsize
                self.send_response(302)
                self.send_header("Location", source)
                self.send_cors_headers()
                self.end_headers()
                return

            if not os.path.exists(source):
                self.send_response(404)
                self.end_headers()
                return

            file_size = os.path.getsize(source)
            range_header = self.headers.get('Range', None)
            
            if range_header:
                match = re.search(r'bytes=(\d+)-(\d*)', range_header)
                if match:
                    start = int(match.group(1))
                    end = match.group(2)
                    end = int(end) if end else file_size - 1
                    
                    self.send_response(206)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('Content-Length', str(end - start + 1))
                    self.end_headers()
                    
                    with open(source, 'rb') as f:
                        f.seek(start)
                        chunk_size = 1024 * 1024
                        to_read = end - start + 1
                        while to_read > 0:
                            data = f.read(min(chunk_size, to_read))
                            if not data: break
                            try:
                                self.wfile.write(data)
                            except Exception:
                                break
                            to_read -= len(data)
                    return
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(file_size))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            with open(source, 'rb') as f:
                try:
                    shutil.copyfileobj(f, self.wfile)
                except Exception:
                    pass

    def _handle_stream_probe(self, query):
        url = query.get('url', [''])[0]
        filepath = query.get('file', [''])[0]
        source = unwrap_stream_source(filepath or url)

        if not source:
            self._send_json({"error": "missing file or url parameter"}, 400)
            return

        if not (source.startswith("http://") or source.startswith("https://")):
            if not os.path.exists(source):
                self._send_json({"error": "file not found"}, 404)
                return

        # 1. Find external subtitles immediately (instantaneous from TorrServer RAM / local disk)
        ext_subs = find_external_subtitles(source)
        if ext_subs:
            for es in ext_subs:
                s_url = es.get('url')
                s_idx = str(es.get('index', ''))
                if s_url:
                    threading.Thread(
                        target=prewarm_subtitle_cache,
                        args=(s_url, source, s_idx),
                        daemon=True
                    ).start()

        # 2. Probe media file for duration, video/audio tracks
        info = probe_media_file(source)
        res_info = dict(info)
        sub_tracks = list(res_info.get('subtitle_tracks', []))
        
        # 3. Combine subtitle tracks (external prioritized)
        if ext_subs:
            sub_tracks = ext_subs + sub_tracks
            
        res_info['subtitle_tracks'] = sub_tracks
        self._send_json(res_info)

    def _handle_stream_subtitles(self, query):
        url = query.get('url', [''])[0]
        filepath = query.get('file', [''])[0]
        source = unwrap_stream_source(url or filepath)
        track_idx = str(query.get('track', [''])[0])
        start_val = query.get('start', [''])[0]
        try:
            start_sec = max(0.0, float(start_val)) if start_val else 0.0
        except Exception:
            start_sec = 0.0

        if not source:
            self.send_response(400)
            self.send_cors_headers()
            self.end_headers()
            return

        is_http = source.startswith("http://") or source.startswith("https://")
        if not is_http and not os.path.exists(source):
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()
            return

        # 1. Disk Cache Check
        cache_dir = os.path.join(CONFIG_DIR, "cache", "subs")
        os.makedirs(cache_dir, exist_ok=True)
        cache_key = hashlib.md5(f"{source}_{track_idx}".encode('utf-8')).hexdigest() + ".vtt"
        cache_path = os.path.join(cache_dir, cache_key)
        if start_sec == 0.0 and os.path.isfile(cache_path) and os.path.getsize(cache_path) > 10:
            try:
                with open(cache_path, 'rb') as f:
                    cached_data = f.read()
                if b"WEBVTT" in cached_data[:64] and b"-->" in cached_data:
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                    self.send_header('Content-Length', str(len(cached_data)))
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.end_headers()
                    self.wfile.write(cached_data)
                    return
            except Exception:
                pass

        # 2. Check if source is a standalone external subtitle file or track_idx is external
        sub_exts = ('.srt', '.vtt', '.ass', '.ssa')
        source_clean_path = urllib.parse.urlparse(source).path if is_http else source
        
        actual_sub_source = None
        if source_clean_path.lower().endswith(sub_exts):
            actual_sub_source = source
        elif track_idx.startswith('ext_'):
            ext_id = track_idx.replace('ext_', '').strip()
            ext_subs = find_external_subtitles(source)
            for es in ext_subs:
                if str(es.get('index')) == track_idx or str(es.get('index')) == f"ext_{ext_id}":
                    actual_sub_source = es.get('url')
                    break

        ffmpeg_bin = get_bin_path("ffmpeg")
        env = _clean_env()

        if actual_sub_source:
            actual_cache_key = hashlib.md5(f"{actual_sub_source}_".encode('utf-8')).hexdigest() + ".vtt"
            actual_cache_path = os.path.join(cache_dir, actual_cache_key)
            if os.path.isfile(actual_cache_path) and os.path.getsize(actual_cache_path) > 10:
                try:
                    with open(actual_cache_path, 'rb') as f:
                        cached_data = f.read()
                    if b"WEBVTT" in cached_data[:64] and b"-->" in cached_data:
                        try:
                            shutil.copyfile(actual_cache_path, cache_path)
                        except Exception:
                            pass
                        self.send_response(200)
                        self.send_cors_headers()
                        self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                        self.send_header('Content-Length', str(len(cached_data)))
                        self.send_header('Cache-Control', 'public, max-age=86400')
                        self.end_headers()
                        self.wfile.write(cached_data)
                        return
                except Exception:
                    pass

            sub_is_http = actual_sub_source.startswith("http://") or actual_sub_source.startswith("https://")
            raw_sub = None
            try:
                if sub_is_http:
                    req = urllib.request.Request(actual_sub_source)
                    with urllib.request.urlopen(req, timeout=20) as resp:
                        raw_sub = resp.read()
                else:
                    with open(actual_sub_source, 'rb') as f:
                        raw_sub = f.read()
            except Exception as e:
                logger.error(f"[stream_subtitles] Failed to fetch external subtitle: {e}")

            if raw_sub:
                raw_sub = ensure_utf8_subtitles(raw_sub)
                vtt_out = None
                if actual_sub_source.lower().endswith('.vtt') and b"WEBVTT" in raw_sub[:64]:
                    vtt_out = raw_sub
                else:
                    cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "webvtt", "pipe:1"]
                    proc = None
                    try:
                        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
                        vtt_out, _ = proc.communicate(input=raw_sub, timeout=15)
                    except subprocess.TimeoutExpired:
                        if proc:
                            try:
                                proc.kill()
                                proc.wait(timeout=1.0)
                            except Exception:
                                pass
                    except Exception as e:
                        logger.error(f"[stream_subtitles] FFmpeg pipe conversion error: {e}")
                    finally:
                        if proc and proc.poll() is None:
                            try:
                                proc.kill()
                                proc.wait(timeout=0.5)
                            except Exception:
                                pass

                if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64] and b"-->" in vtt_out:
                    try:
                        with open(cache_path, 'wb') as cf:
                            cf.write(vtt_out)
                        if actual_cache_path != cache_path:
                            with open(actual_cache_path, 'wb') as acf:
                                acf.write(vtt_out)
                    except Exception:
                        pass
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                    self.send_header('Content-Length', str(len(vtt_out)))
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.end_headers()
                    try:
                        self.wfile.write(vtt_out)
                    except Exception:
                        pass
                    return

            empty_vtt = b"WEBVTT\n\n"
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Content-Length', str(len(empty_vtt)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            try:
                self.wfile.write(empty_vtt)
            except Exception:
                pass
            return

        # If track_idx is an ext_ track but could not be resolved, do NOT read video container as subtitle!
        if track_idx.startswith('ext_'):
            empty_vtt = b"WEBVTT\n\n"
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Content-Length', str(len(empty_vtt)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            try:
                self.wfile.write(empty_vtt)
            except Exception:
                pass
            return

        # 3. Check if the requested embedded track is an unsupported bitmap format (PGS, VobSub, DVB)
        if track_idx:
            info = probe_media_file(source)
            for sub in info.get('subtitle_tracks', []):
                if str(sub.get('index')) == track_idx:
                    if not sub.get('supported', True):
                        logger.info(f"[stream_subtitles] Track {track_idx} is bitmap subtitle ({sub.get('codec')}), returning empty WebVTT")
                        empty_vtt = b"WEBVTT\n\n"
                        self.send_response(200)
                        self.send_cors_headers()
                        self.send_header('Content-Type', 'text/vtt; charset=utf-8')
                        self.send_header('Content-Length', str(len(empty_vtt)))
                        self.send_header('Cache-Control', 'no-cache')
                        self.end_headers()
                        try:
                            self.wfile.write(empty_vtt)
                        except Exception:
                            pass
                        return
                    break

        # 4. Embedded subtitle track inside video container
        sub_source = source
        if is_http and '&play' not in sub_source and ('link=' in sub_source or 'torrent' in sub_source):
            sub_source += '&play'

        cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "error"]
        if start_sec > 0:
            cmd += ["-ss", str(start_sec), "-copyts"]
        cmd += ["-vn", "-an"]
        if is_http:
            cmd += ["-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_delay_max", "2"]
        cmd += ["-i", sub_source]
        if track_idx:
            cmd += ["-map", f"0:{track_idx}"]
        else:
            cmd += ["-map", "0:s:0?"]
        cmd += ["-c:s", "webvtt", "-flush_packets", "1", "-f", "webvtt", "pipe:1"]

        proc = None
        vtt_out = None
        chunks = []
        completed_full = False
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)

            def _reader():
                try:
                    while True:
                        c = proc.stdout.read1(4096) if hasattr(proc.stdout, 'read1') else proc.stdout.read(512)
                        if not c:
                            break
                        chunks.append(c)
                except Exception:
                    pass

            reader_th = threading.Thread(target=_reader, daemon=True)
            reader_th.start()

            t0 = time.time()
            max_wait = 20.0 if is_http else 10.0
            while time.time() - t0 < max_wait:
                reader_th.join(timeout=0.2)
                if not reader_th.is_alive():
                    completed_full = True
                    break
                current_len = sum(len(x) for x in chunks)
                if (time.time() - t0 > 2.0) and current_len > 150:
                    raw_preview = b"".join(chunks)
                    if raw_preview.count(b"-->") >= 3:
                        break
                elif current_len > 32768:
                    raw_preview = b"".join(chunks)
                    if raw_preview.count(b"-->") >= 30:
                        break

            raw_vtt = b"".join(chunks)
            if raw_vtt and b"-->" in raw_vtt:
                vtt_out = finalize_vtt(raw_vtt)
            elif raw_vtt and b"WEBVTT" in raw_vtt[:30]:
                vtt_out = raw_vtt
            else:
                vtt_out = None
        except Exception as e:
            logger.error(f"[stream_subtitles] FFmpeg extraction error: {e}")
            raw_vtt = b"".join(chunks)
            vtt_out = finalize_vtt(raw_vtt) if (raw_vtt and b"-->" in raw_vtt) else None
        finally:
            if proc and proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=0.5)
                except Exception:
                    pass

        if vtt_out and len(vtt_out) > 10 and b"WEBVTT" in vtt_out[:64] and b"-->" in vtt_out:
            if completed_full and start_sec == 0:
                try:
                    with open(cache_path, 'wb') as cf:
                        cf.write(vtt_out)
                except Exception:
                    pass
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Content-Length', str(len(vtt_out)))
            if completed_full and start_sec == 0:
                self.send_header('Cache-Control', 'public, max-age=86400')
            else:
                self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            try:
                self.wfile.write(vtt_out)
            except Exception:
                pass
            return
        else:
            empty_vtt = b"WEBVTT\n\n"
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/vtt; charset=utf-8')
            self.send_header('Content-Length', str(len(empty_vtt)))
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            try:
                self.wfile.write(empty_vtt)
            except Exception:
                pass
            return

