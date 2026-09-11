import os
import sys

# Ensure system Python paths and http package path are available in PyInstaller sandbox
py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
sys_lib = f"/usr/lib/python{py_ver}"
for p in [sys_lib, f"{sys_lib}/lib-dynload", f"{sys_lib}/site-packages"]:
    if os.path.isdir(p) and p not in sys.path:
        sys.path.append(p)

import http
if hasattr(http, "__path__") and f"{sys_lib}/http" not in http.__path__:
    http.__path__.append(f"{sys_lib}/http")

import json
import sqlite3
import subprocess
import threading
import urllib.request
import urllib.parse
import urllib.error
import time
import shutil
import re
import socket
import ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import traceback
import hashlib
import asyncio

# DNS-обход блокировки/спуфинга api.themoviedb.org в РФ с кэшированием работающего IP
_orig_getaddrinfo = socket.getaddrinfo
_working_ip_cache = {}

def _custom_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in ("api.themoviedb.org", "image.tmdb.org"):
        cached_ip = _working_ip_cache.get(host)
        if cached_ip:
            try:
                return _orig_getaddrinfo(cached_ip, port, family, type, proto, flags)
            except Exception:
                _working_ip_cache.pop(host, None)

        if host == "api.themoviedb.org":
            try:
                res = _orig_getaddrinfo(host, port, family, type, proto, flags)
                if res and res[0][4][0] in ("127.0.0.1", "::1"):
                    raise ValueError("Poisoned DNS")
                return res
            except Exception:
                for ip in ["99.84.152.85", "99.84.152.8", "99.84.152.53", "99.84.152.32"]:
                    try:
                        res = _orig_getaddrinfo(ip, port, family, type, proto, flags)
                        if res:
                            _working_ip_cache[host] = ip
                            return res
                    except Exception:
                        continue
        elif host == "image.tmdb.org":
            try:
                res = _orig_getaddrinfo(host, port, family, type, proto, flags)
                if res and res[0][4][0] in ("127.0.0.1", "::1"):
                    raise ValueError("Poisoned DNS")
                return res
            except Exception:
                for ip in ["152.233.60.225", "152.233.60.226", "152.233.60.227"]:
                    try:
                        res = _orig_getaddrinfo(ip, port, family, type, proto, flags)
                        if res:
                            _working_ip_cache[host] = ip
                            return res
                    except Exception:
                        continue
    return _orig_getaddrinfo(host, port, family, type, proto, flags)
socket.getaddrinfo = _custom_getaddrinfo

# Импорт Decky Loader API
try:
    import decky
    logger = decky.logger
    DECKY_USER_HOME = decky.DECKY_USER_HOME
except ImportError:
    import logging
    logger = logging.getLogger("Projacktor")
    logger.setLevel(logging.DEBUG)
    DECKY_USER_HOME = os.environ.get("DECKY_USER_HOME", "/home/deck")

def get_user_home():
    return DECKY_USER_HOME

_legacy_cfg1 = os.path.join(get_user_home(), ".config", "projactor")
_legacy_cfg2 = os.path.join(get_user_home(), ".config", "projecktor")
_default_cfg = os.path.join(get_user_home(), ".config", "projacktor")
if os.path.isdir(_default_cfg):
    CONFIG_DIR = _default_cfg
elif os.path.isdir(_legacy_cfg1):
    CONFIG_DIR = _legacy_cfg1
elif os.path.isdir(_legacy_cfg2):
    CONFIG_DIR = _legacy_cfg2
else:
    CONFIG_DIR = _default_cfg

_db_projacktor = os.path.join(CONFIG_DIR, "projacktor.db")
_db_legacy = os.path.join(CONFIG_DIR, "projactor.db")
if os.path.isfile(_db_legacy) and os.path.getsize(_db_legacy) > 0:
    if not os.path.isfile(_db_projacktor) or os.path.getsize(_db_projacktor) == 0:
        try:
            shutil.copy2(_db_legacy, _db_projacktor)
            logger.info(f"Migrated legacy database {_db_legacy} -> {_db_projacktor}")
        except Exception as e:
            logger.error(f"Failed to migrate legacy db: {e}")
DB_PATH = _db_projacktor if os.path.isfile(_db_projacktor) and os.path.getsize(_db_projacktor) > 0 else _db_legacy
SETTINGS_PATH = os.path.join(CONFIG_DIR, "settings.json")

# Default Video path: Projacktor (fall back to legacy paths if they exist)
_legacy_video1 = os.path.join(get_user_home(), "Video", "Projactor")
_legacy_video2 = os.path.join(get_user_home(), "Video", "Projecktor")
_default_video = os.path.join(get_user_home(), "Video", "Projacktor")
if os.path.isdir(_default_video):
    INITIAL_DOWNLOAD_PATH = _default_video
elif os.path.isdir(_legacy_video1):
    INITIAL_DOWNLOAD_PATH = _legacy_video1
elif os.path.isdir(_legacy_video2):
    INITIAL_DOWNLOAD_PATH = _legacy_video2
else:
    INITIAL_DOWNLOAD_PATH = _default_video

DEFAULT_SETTINGS = {
    "jacred_url": "",
    "tmdb_api_key": "4ef0d7355d9ffb5151e987764708ce96",
    "download_path": INITIAL_DOWNLOAD_PATH,
    "language": "ru",
    "aria2_port": 6800
}

# --- Database ---
def init_db():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    cursor = conn.cursor()
    cursor.executescript('''
    CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id INTEGER UNIQUE,
        imdb_id TEXT,
        media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
        title TEXT NOT NULL,
        original_title TEXT,
        year INTEGER,
        overview TEXT,
        poster_path TEXT,
        backdrop_path TEXT,
        vote_average REAL DEFAULT 0,
        genres TEXT,
        runtime INTEGER,
        status TEXT DEFAULT 'catalog' CHECK(status IN ('catalog','downloading','downloaded','watched')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS media_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        season_number INTEGER,
        episode_number INTEGER,
        episode_title TEXT,
        watched BOOLEAN DEFAULT 0,
        watch_progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
        magnet_uri TEXT NOT NULL,
        torrent_title TEXT,
        quality TEXT,
        tracker TEXT,
        status TEXT DEFAULT 'queued' CHECK(status IN ('queued','downloading','seeding','paused','completed','error')),
        progress REAL DEFAULT 0,
        download_speed INTEGER DEFAULT 0,
        upload_speed INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        downloaded_size INTEGER DEFAULT 0,
        aria2_gid TEXT,
        download_dir TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS poster_cache (
        tmdb_id INTEGER NOT NULL,
        image_type TEXT NOT NULL CHECK(image_type IN ('poster', 'backdrop')),
        local_path TEXT NOT NULL,
        url TEXT NOT NULL,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tmdb_id, image_type)
    );
    CREATE TABLE IF NOT EXISTS watch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        file_id INTEGER REFERENCES media_files(id),
        watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        duration INTEGER DEFAULT 0
    );
    ''')

    # Safe migrations for media table to support in-library management
    for col, col_type in [
        ("magnet_uri", "TEXT"),
        ("torrent_title", "TEXT"),
        ("quality", "TEXT"),
        ("download_dir", "TEXT"),
        ("in_library", "BOOLEAN DEFAULT 1"),
        ("selected_files", "TEXT"),
        ("episodes_json", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE media ADD COLUMN {col} {col_type}")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn

# --- Settings ---
def normalize_jacred_url(url: str) -> str:
    if not url:
        return ""
    u = str(url).strip()
    if not u:
        return ""
    if not (u.startswith("http://") or u.startswith("https://")):
        u = f"https://{u}"
    return u.rstrip('/')

def ping_jacred(url: str, timeout: int = 5) -> bool:
    url = normalize_jacred_url(url)
    if not url:
        return False
    ctx = ssl._create_unverified_context()
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    endpoints = [
        "/api/v2.0/indexers",
        "/api/v2.0/indexers/all/results?apikey=1&Query=test"
    ]
    for ep in endpoints:
        try:
            req = urllib.request.Request(f"{url}{ep}", headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                if response.status in (200, 204):
                    return True
        except urllib.error.HTTPError as e:
            if e.code in (200, 401, 429):
                return True
        except Exception as e:
            logger.debug(f"Jacred ping error for {url}{ep}: {e}")
            continue
    return False

def load_settings():
    if not os.path.exists(SETTINGS_PATH):
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS.copy()
    try:
        with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
            settings = json.load(f)
            merged = DEFAULT_SETTINGS.copy()
            merged.update(settings)
            if merged.get("tmdb_api_key") == "aa86d1a6876222de71c258408e1a4ed3":
                merged["tmdb_api_key"] = DEFAULT_SETTINGS["tmdb_api_key"]
                save_settings(merged)
            if merged.get("jacred_url"):
                norm = normalize_jacred_url(merged["jacred_url"])
                if norm != merged["jacred_url"]:
                    merged["jacred_url"] = norm
                    save_settings(merged)
            return merged
    except Exception as e:
        logger.error(f"Error loading settings: {e}")
        return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if isinstance(settings, dict) and "jacred_url" in settings:
        settings["jacred_url"] = normalize_jacred_url(settings.get("jacred_url"))
    with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=4)

# --- Helper: Binary locator and Execution Environment ---
def get_bin_path(name: str) -> str:
    plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(plugin_dir, "bin", name),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", name)
    ]
    for c in candidates:
        if os.path.isfile(c):
            try:
                os.chmod(c, 0o755)
            except Exception:
                pass
            return c
    system_path = shutil.which(name)
    if system_path:
        return system_path
    return candidates[0]

def _clean_env():
    env = os.environ.copy()
    for key in ("LD_LIBRARY_PATH", "LD_PRELOAD", "APPDIR", "APPIMAGE"):
        env.pop(key, None)
    return env

# --- Helper: Build GUI Env ---
def _build_gui_env():
    env = _clean_env()
    env["DISPLAY"] = ":0"
    env["XDG_RUNTIME_DIR"] = "/run/user/1000"
    return env

# --- Popular BitTorrent Trackers for Fast Peer Discovery ---
POPULAR_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://explodie.org:6969/announce",
    "udp://opentor.net:6969",
    "udp://tracker.dler.com:6969/announce",
    "http://retracker.local/announce",
    "udp://bt1.archive.org:6969/announce",
    "udp://9.rarbg.to:2920/announce",
    "udp://tracker.openbittorrent.com:6969/announce"
]

# --- Download Manager ---
class DownloadManager:
    def __init__(self, port):
        self.port = port
        self.rpc_url = f"http://127.0.0.1:{self.port}/jsonrpc"
        self.process = None
        self._running = False
        self._sync_thread = None

    def start(self):
        aria2c_path = get_bin_path("aria2c")
        if not os.path.isfile(aria2c_path) and not shutil.which("aria2c"):
            logger.error(f"aria2c not found at {aria2c_path}!")
            return False
        
        session_file = os.path.join(CONFIG_DIR, "aria2.session")
        if not os.path.exists(session_file):
            try:
                open(session_file, 'a').close()
            except Exception as e:
                logger.error(f"Failed to touch session file: {e}")

        cmd = [
            aria2c_path,
            "--enable-rpc",
            f"--rpc-listen-port={self.port}",
            "--rpc-allow-origin-all",
            "--seed-time=0",
            "--max-concurrent-downloads=3",
            "--daemon=false",
            f"--input-file={session_file}",
            f"--save-session={session_file}",
            "--save-session-interval=30",
            "--bt-prioritize-piece=head=50M,tail=15M",
            "--file-allocation=none",
            "--enable-dht=true",
            "--dht-listen-port=6881",
            "--enable-peer-exchange=true",
            "--bt-enable-lpd=true",
            "--bt-max-peers=100",
            "--max-connection-per-server=16",
            f"--bt-tracker={','.join(POPULAR_TRACKERS)}"
        ]
        
        env = _clean_env()
        self.process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        self._running = True
        self._sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self._sync_thread.start()
        logger.info(f"Aria2c started with {aria2c_path} on port {self.port}.")
        return True

    def stop(self):
        self._running = False
        if self.process:
            self.process.terminate()
            self.process.wait()
            self.process = None
        logger.info("Aria2c stopped.")

    def _rpc_call(self, method, params=None):
        if params is None:
            params = []
        payload = {
            "jsonrpc": "2.0",
            "id": "projacktor",
            "method": method,
            "params": params
        }
        try:
            req = urllib.request.Request(self.rpc_url, data=json.dumps(payload).encode('utf-8'),
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=2) as response:
                return json.loads(response.read().decode('utf-8'))['result']
        except Exception as e:
            return None

    def add_download(self, magnet, directory, options=None):
        opt = {"dir": directory}
        if options and isinstance(options, dict):
            opt.update(options)
        res = self._rpc_call("aria2.addUri", [[magnet], opt])
        return res

    def get_status(self, gid):
        return self._rpc_call("aria2.tellStatus", [gid])

    def get_files(self, gid):
        return self._rpc_call("aria2.getFiles", [gid])

    def change_options(self, gid, options):
        return self._rpc_call("aria2.changeOption", [gid, options])

    def select_files(self, gid, file_indices):
        return self._rpc_call("aria2.changeOption", [gid, {"select-file": str(file_indices)}])
    
    def pause(self, gid):
        return self._rpc_call("aria2.pause", [gid])
        
    def resume(self, gid):
        return self._rpc_call("aria2.unpause", [gid])

    def unpause_all(self):
        return self._rpc_call("aria2.unpauseAll")

    def remove(self, gid):
        return self._rpc_call("aria2.remove", [gid])

    def tell_active(self):
        return self._rpc_call("aria2.tellActive") or []

    def tell_waiting(self, offset=0, num=100):
        return self._rpc_call("aria2.tellWaiting", [offset, num]) or []

    def tell_stopped(self, offset=0, num=100):
        return self._rpc_call("aria2.tellStopped", [offset, num]) or []

    def purge_download_result(self):
        return self._rpc_call("aria2.purgeDownloadResult")

    def get_global_stats(self):
        return self._rpc_call("aria2.getGlobalStat")
        
    def _sync_loop(self):
        while self._running:
            try:
                self._update_db()
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            time.sleep(3)
            
    def _update_db(self):
        active = self._rpc_call("aria2.tellActive") or []
        waiting = self._rpc_call("aria2.tellWaiting", [0, 100]) or []
        stopped = self._rpc_call("aria2.tellStopped", [0, 100]) or []
        
        all_tasks = active + waiting + stopped
        task_map = {t["gid"]: t for t in all_tasks}
        
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("SELECT id, aria2_gid, status, download_dir, media_id, magnet_uri FROM downloads WHERE status NOT IN ('completed')")
        for row in cursor.fetchall():
            row_id = row['id']
            gid = row['aria2_gid']
            
            # Check if current task finished metadata and spawned a followed task
            t = task_map.get(gid)
            if t:
                followed = t.get('followedBy')
                if followed and len(followed) > 0:
                    new_gid = followed[0]
                    cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                    gid = new_gid
                    t = task_map.get(gid)
            
            # Also check if any task in all_tasks is following this gid
            if not t:
                for cand in all_tasks:
                    if cand.get('following') == gid:
                        new_gid = cand['gid']
                        cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                        gid = new_gid
                        t = cand
                        break

            # Fallback: re-link if aria2 restarted and restored tasks under new GIDs
            if not t:
                magnet = (row['magnet_uri'] or "").lower()
                row_dir = os.path.normpath(row['download_dir']) if row['download_dir'] else ""
                target_hash = ""
                if "xt=urn:btih:" in magnet:
                    try:
                        target_hash = magnet.split("xt=urn:btih:")[1].split("&")[0].strip()
                    except: pass

                for cand in all_tasks:
                    cand_hash = cand.get('infoHash', '').lower()
                    cand_dir = os.path.normpath(cand.get('dir', '')) if cand.get('dir') else ""
                    if (target_hash and cand_hash == target_hash) or (row_dir and cand_dir == row_dir):
                        new_gid = cand['gid']
                        cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                        gid = new_gid
                        t = cand
                        logger.info(f"Re-linked download id={row_id} to new aria2 GID={new_gid}")
                        break
            
            if not t:
                # Проверяем, завершилась ли загрузка на диске (готовый видеофайл без .aria2)
                row_dir = row['download_dir']
                if row_dir and os.path.isdir(row_dir):
                    video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
                    has_aria2 = False
                    found_videos = []
                    for r_root, _, r_files in os.walk(row_dir):
                        for r_f in r_files:
                            if r_f.endswith('.aria2'):
                                has_aria2 = True
                            if os.path.splitext(r_f)[1].lower() in video_exts:
                                fp = os.path.join(r_root, r_f)
                                try:
                                    sz = os.path.getsize(fp)
                                    if sz > 10 * 1024 * 1024:
                                        found_videos.append((fp, sz))
                                except: pass
                    
                    if found_videos and not has_aria2:
                        total_sz = sum(sz for _, sz in found_videos)
                        logger.info(f"Download id={row_id} confirmed complete on disk ({total_sz} bytes), updating DB")
                        cursor.execute("""
                            UPDATE downloads 
                            SET status='completed', progress=100.0, download_speed=0, upload_speed=0,
                                total_size=CASE WHEN total_size > 0 THEN total_size ELSE ? END,
                                downloaded_size=CASE WHEN total_size > 0 THEN total_size ELSE ? END,
                                completed_at=COALESCE(completed_at, CURRENT_TIMESTAMP),
                                error_message=NULL
                            WHERE id=?
                        """, (total_sz, total_sz, row_id))
                        if row['media_id']:
                            self._scan_and_add_files(cursor, row['media_id'], row_dir)
                        continue

                # Если задачи нет в aria2 и файл не готов на диске, сбрасываем скорость
                if row['status'] == 'downloading':
                    cursor.execute("UPDATE downloads SET download_speed=0, upload_speed=0, status='paused' WHERE id=?", (row_id,))
                continue
                
            total = int(t.get('totalLength', 0))
            completed = int(t.get('completedLength', 0))
            prog = round((completed / total * 100), 1) if total > 0 else 0
            raw_status = t.get('status', 'queued')
            down_speed = int(t.get('downloadSpeed', 0))
            up_speed = int(t.get('uploadSpeed', 0))
            has_followed = bool(t.get('followedBy'))
            
            if raw_status == 'complete':
                if has_followed:
                    # Only metadata finished, content task is in progress
                    new_status = 'downloading'
                else:
                    new_status = 'completed'
            elif raw_status == 'active':
                new_status = 'downloading'
            elif raw_status == 'paused':
                new_status = 'paused'
            elif raw_status == 'error':
                err_code = str(t.get('errorCode', ''))
                err_msg = t.get('errorMessage', '')
                # aria2 errorCode 13: "File exists, but a control file(*.aria2) does not exist."
                # Это означает, что готовый файл уже присутствует на диске целиком.
                row_dir = row['download_dir']
                is_file_ready = err_code == '13' or 'exists, but a control file' in err_msg
                if not is_file_ready and row_dir and os.path.isdir(row_dir):
                    video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
                    has_aria2 = any(f.endswith('.aria2') for _, _, fs in os.walk(row_dir) for f in fs)
                    has_video = any(os.path.splitext(f)[1].lower() in video_exts for _, _, fs in os.walk(row_dir) for f in fs)
                    if not has_aria2 and has_video:
                        is_file_ready = True
                
                if is_file_ready:
                    new_status = 'completed'
                    prog = 100.0
                    down_speed = 0
                    up_speed = 0
                    if total <= 0:
                        total = int(t.get('totalLength', 0))
                    if completed <= 0:
                        completed = total
                else:
                    new_status = 'error'
            else:
                new_status = 'queued'
                
            cursor.execute("""
                UPDATE downloads 
                SET status=?, progress=?, download_speed=?, upload_speed=?, total_size=?, downloaded_size=?
                WHERE id=?
            """, (new_status, prog, down_speed, up_speed, total, completed, row_id))
            
            if new_status == 'completed' and not has_followed and row['status'] != 'completed':
                cursor.execute("UPDATE downloads SET completed_at=CURRENT_TIMESTAMP WHERE id=?", (row_id,))
                if row['download_dir'] and row['media_id']:
                    self._scan_and_add_files(cursor, row['media_id'], row['download_dir'])
            
        db.commit()
        db.close()
        
    def _scan_and_add_files(self, cursor, media_id, ddir):
        if not os.path.isdir(ddir):
            return
        video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
        for root, _, files in os.walk(ddir):
            for f in files:
                if os.path.splitext(f)[1].lower() in video_exts:
                    fp = os.path.join(root, f)
                    try:
                        sz = os.path.getsize(fp)
                    except:
                        sz = 0
                    cursor.execute("SELECT id FROM media_files WHERE media_id=? AND file_path=?", (media_id, fp))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO media_files (media_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)",
                                       (media_id, fp, f, sz))
        cursor.execute("UPDATE media SET status='downloaded' WHERE id=?", (media_id,))

# --- HTTP Server ---
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

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
    except:
        return False

def probe_media_file(filepath):
    if filepath in PROBE_CACHE:
        return PROBE_CACHE[filepath]
    if not os.path.exists(filepath):
        return {}
    if not is_header_ready(filepath):
        return {}
    ffprobe_bin = get_bin_path("ffprobe")
    cmd = [
        ffprobe_bin,
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        "-probesize", "10000000",
        "-analyzeduration", "10000000",
        filepath
    ]
    try:
        env = _clean_env()
        out = subprocess.check_output(cmd, env=env, timeout=5).decode('utf-8')
        data = json.loads(out)
        vcodec, acodec = None, None
        duration = 0.0
        try:
            duration = float(data.get('format', {}).get('duration', 0.0))
        except:
            pass
        audio_tracks = []
        subtitle_tracks = []
        for s in data.get('streams', []):
            if s.get('codec_type') == 'video' and not vcodec:
                vcodec = s.get('codec_name')
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
                tags = s.get('tags', {})
                subtitle_tracks.append({
                    "index": s.get('index'),
                    "codec": s.get('codec_name'),
                    "lang": tags.get('language', tags.get('lang', '')),
                    "title": tags.get('title', f"Субтитры #{s.get('index')}")
                })
        direct = (vcodec in ['h264', 'avc1']) and (acodec in ['aac', 'mp3', 'opus']) and filepath.lower().endswith('.mp4')
        res = {
            "vcodec": vcodec,
            "acodec": acodec,
            "duration": duration,
            "direct": direct,
            "audio_tracks": audio_tracks,
            "subtitle_tracks": subtitle_tracks,
            "status": "direct_play" if direct else "needs_transcode"
        }
        if vcodec:
            PROBE_CACHE[filepath] = res
        return res
    except Exception as e:
        logger.error(f"probe_media_file error: {e}")
        return {}

class ProjacktorRequestHandler(BaseHTTPRequestHandler):
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            self._handle_api_get(path, query)
        else:
            self._serve_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_post(parsed.path)

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_patch(parsed.path)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_put(parsed.path)
            
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self._handle_api_delete(parsed.path)

    def _serve_static(self, path):
        if path == '/' or not path:
            path = '/index.html'
        static_dir = os.path.join(os.path.dirname(__file__), "dist", "webapp")
        file_path = os.path.abspath(os.path.join(static_dir, path.lstrip('/')))
        if not file_path.startswith(static_dir) or not os.path.exists(file_path):
            # Fallback to index.html for SPA routing if file not found
            file_path = os.path.join(static_dir, "index.html")
            if not os.path.exists(file_path):
                self.send_response(404)
                self.end_headers()
                return

        ext = os.path.splitext(file_path)[1].lower()
        mimes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.json': 'application/json',
            '.woff2': 'font/woff2',
            '.woff': 'font/woff'
        }
        
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', mimes.get(ext, 'application/octet-stream'))
        self.end_headers()
        with open(file_path, 'rb') as f:
            self.wfile.write(f.read())
            
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
        except:
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
            self._send_json({"aria2c": "running" if plugin_instance.dm._running else "stopped"})
        elif path == '/api/disk':
            sett = load_settings()
            dp = os.path.expanduser(sett['download_path'])
            try:
                total, used, free = shutil.disk_usage(dp)
            except:
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
            cursor = db.cursor()
            rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
            if plugin_instance and plugin_instance.dm:
                for r in rows:
                    if r['aria2_gid']:
                        try:
                            plugin_instance.dm.resume(r['aria2_gid'])
                        except:
                            pass
            cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
            db.commit()
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
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            db.close()
            if row and row['aria2_gid']:
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
            db.execute("UPDATE media_files SET watch_progress=?, watched=? WHERE id=?", (body.get('progress', 0), body.get('watched', 0), lid))
            db.commit()
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
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            if row and row['aria2_gid']:
                plugin_instance.dm.remove(row['aria2_gid'])
            db.execute("DELETE FROM downloads WHERE id=?", (did,))
            db.commit()
            db.close()
            self._send_json({"success": True})
        elif path.startswith('/api/library/'):
            mid = path.split('/')[-1]
            db = get_db()
            files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in files:
                try:
                    os.remove(f['file_path'])
                except: pass
            db.execute("DELETE FROM media WHERE id=?", (mid,))
            db.commit()
            db.close()
            self._send_json({"success": True})

    tmdb_cache = {}
    
    def _handle_tmdb(self, path, query):
        sett = load_settings()
        api_key = sett['tmdb_api_key']
        lang = sett['language']
        
        endpoint = path.replace('/api/tmdb', '')
        
        q_params = {'api_key': api_key, 'language': f"{lang}-{lang.upper()}"}
        for k, v in query.items():
            q_params[k] = v[0]
            
        url = f"https://api.themoviedb.org/3{endpoint}?{urllib.parse.urlencode(q_params)}"
        
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
                
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json"
                }
            )
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                data = json.loads(response.read().decode('utf-8'))
                self.tmdb_cache[url] = (now, data)
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(data, f)
                except Exception:
                    pass
                self._send_json(data)
        except Exception as e:
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self.tmdb_cache[url] = (now, data)
                    self._send_json(data)
                    return
                except Exception:
                    pass
            self._send_json({"error": str(e)}, 500)

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
            
        target_url = f"https://image.tmdb.org/t/p/{size}/{img_path}"
        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                }
            )
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=12, context=ctx) as response:
                content = response.read()
                if len(content) > 200:
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
        except Exception as e:
            logger.warning(f"Failed to fetch image {target_url}: {e}")
            self.send_response(404)
            self.end_headers()

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
            target += f"&Category[]={c}"
            
        try:
            req = urllib.request.Request(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; SteamOS; Linux x86_64) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            )
            ctx = ssl._create_unverified_context()
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
                    # Auto-detect quality from title
                    quality = ""
                    for qk in ["2160p", "4K", "1080p", "720p", "HDRip", "BDRip", "WEB-DL", "WEBRip"]:
                        if qk.lower() in title.lower():
                            quality = qk
                            break
                            
                    details = item.get("Details") or item.get("details") or item.get("url") or ""
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
        db.close()
        self._send_json([dict(row) for row in dls])
        
    def _handle_downloads_stats(self):
        stats = plugin_instance.dm.get_global_stats()
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
        
        gid = plugin_instance.dm.add_download(magnet, ddir)
        
        db = get_db()
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
        db.close()
        
        self._send_json({"success": True, "id": new_dl_id, "gid": gid})

    def _handle_library_list(self):
        db = get_db()
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
                                except:
                                    sz = 0
                                files_list.append({"file_path": fp, "file_name": fn, "file_size": sz})
            d['files'] = files_list
            result.append(d)
        db.close()
        self._send_json(result)
        
    def _handle_library_details(self, lid):
        db = get_db()
        media = db.execute("SELECT * FROM media WHERE id=?", (lid,)).fetchone()
        files = db.execute("SELECT * FROM media_files WHERE media_id=?", (lid,)).fetchall()
        db.close()
        if media:
            res = dict(media)
            res['files'] = [dict(f) for f in files]
            self._send_json(res)
        else:
            self._send_json({"error": "not found"}, 404)

    def _handle_stream(self, query):
        filepath = query.get('file', [''])[0]
        transcode_mode = query.get('transcode', ['auto'])[0]
        start_time = query.get('start', ['0'])[0]
        audio_idx = query.get('audio', [''])[0]
        is_online = (query.get('online', ['0'])[0] == '1' or 
                     query.get('follow', ['0'])[0] == '1' or 
                     os.path.exists(filepath + ".aria2"))
        
        if is_online:
            # Wait up to 60 seconds for torrent header to be downloaded and written to disk
            start_wait = time.time()
            while time.time() - start_wait < 60:
                if os.path.exists(filepath) and is_header_ready(filepath):
                    break
                time.sleep(0.5)

        if not os.path.exists(filepath):
            self.send_response(404)
            self.end_headers()
            return
            
        info = probe_media_file(filepath)
        vcodec = (info.get('vcodec') or '').lower()
        acodec = (info.get('acodec') or '').lower()
        ext = os.path.splitext(filepath)[1].lower()

        audio_needs_transcode = acodec not in ['aac', 'mp3', 'opus', 'vorbis', 'flac']
        video_needs_transcode = vcodec not in ['h264', 'avc1', 'vp8', 'vp9', 'av1', 'hevc', 'h265']
        container_needs_remux = ext not in ['.mp4', '.m4v'] or audio_needs_transcode
        has_start_offset = False
        try:
            has_start_offset = float(start_time) > 0
        except:
            pass

        must_transcode = (transcode_mode == '1') or (transcode_mode == 'auto' and (audio_needs_transcode or video_needs_transcode or container_needs_remux or has_start_offset))

        if must_transcode and transcode_mode != '0':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'none')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()

            ffmpeg_bin = get_bin_path("ffmpeg")
            cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "warning"]
            if is_online:
                cmd += ["-follow", "1"]
            if has_start_offset:
                cmd += ["-ss", str(start_time)]
            cmd += ["-i", filepath]

            if audio_idx:
                cmd += ["-map", "0:v:0", "-map", f"0:{audio_idx}?"]
            else:
                cmd += ["-map", "0:v:0", "-map", "0:a:0?"]

            if video_needs_transcode:
                cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "23"]
            else:
                cmd += ["-c:v", "copy"]

            if audio_needs_transcode or transcode_mode == '1':
                cmd += ["-c:a", "aac", "-b:a", "192k", "-ac", "2"]
            else:
                cmd += ["-c:a", "copy"]

            cmd += [
                "-sn",
                "-movflags", "frag_keyframe+empty_moov+default_base_moof",
                "-f", "mp4",
                "pipe:1"
            ]

            env = _clean_env()
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            try:
                chunk_size = 64 * 1024
                while True:
                    data = proc.stdout.read(chunk_size)
                    if not data:
                        break
                    self.wfile.write(data)
            except Exception:
                pass
            finally:
                proc.kill()
                try:
                    proc.stdout.close()
                    proc.stderr.close()
                except Exception:
                    pass
            return
        else:
            file_size = os.path.getsize(filepath)
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
                    
                    with open(filepath, 'rb') as f:
                        f.seek(start)
                        chunk_size = 1024 * 1024
                        to_read = end - start + 1
                        while to_read > 0:
                            data = f.read(min(chunk_size, to_read))
                            if not data: break
                            try:
                                self.wfile.write(data)
                            except:
                                break
                            to_read -= len(data)
                    return
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(file_size))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            with open(filepath, 'rb') as f:
                try:
                    shutil.copyfileobj(f, self.wfile)
                except:
                    pass

    def _handle_stream_probe(self, query):
        filepath = query.get('file', [''])[0]
        if not os.path.exists(filepath):
            self._send_json({"error": "file not found"}, 404)
            return
        info = probe_media_file(filepath)
        self._send_json(info)

    def _handle_stream_subtitles(self, query):
        filepath = query.get('file', [''])[0]
        track_idx = query.get('track', [''])[0]
        if not os.path.exists(filepath):
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', 'text/vtt; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        ffmpeg_bin = get_bin_path("ffmpeg")
        cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "warning", "-i", filepath]
        if track_idx:
            cmd += ["-map", f"0:{track_idx}"]
        else:
            cmd += ["-map", "0:s:0?"]
        cmd += ["-f", "webvtt", "pipe:1"]
        env = _clean_env()
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            out, _ = proc.communicate(timeout=10)
            self.wfile.write(out)
        except Exception as e:
            logger.error(f"stream_subtitles error: {e}")
            self.wfile.write(b"WEBVTT\n\n")

plugin_instance = None

class Plugin:
    def __init__(self):
        global plugin_instance
        plugin_instance = self
        self.server = None
        self.server_thread = None
        self.dm = None
        self.inhibit_proc = None

    async def _main(self):
        logger.info("Projacktor: Starting plugin")
        init_db()
        sett = load_settings()
        
        self.dm = DownloadManager(sett.get('aria2_port', 6800))
        self.dm.start()
        
        self.server = ThreadedHTTPServer(('127.0.0.1', 8400), ProjacktorRequestHandler)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()
        logger.info("Projacktor: Started HTTP server on port 8400")

    async def _unload(self):
        logger.info("Projacktor: Unloading plugin")
        if self.inhibit_proc and self.inhibit_proc.poll() is None:
            try:
                self.inhibit_proc.terminate()
            except: pass
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.dm:
            self.dm.stop()

    async def _uninstall(self):
        logger.info("Projacktor: Uninstalling plugin")
        try:
            shutil.rmtree(CONFIG_DIR)
        except Exception as e:
            logger.error(f"Error during uninstall cleanup: {e}")

    # Методы RPC (вызываются из JS-фронтенда)
    async def inhibit_sleep(self):
        try:
            if not self.inhibit_proc or self.inhibit_proc.poll() is not None:
                self.inhibit_proc = subprocess.Popen(
                    ["systemd-inhibit", "--what=idle", "--who=Projacktor", "--why=Downloading in MagicBlack screen-off mode", "sleep", "infinity"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info("Projacktor: Sleep inhibited for MagicBlack screen-off download")
            return {"success": True}
        except Exception as e:
            logger.error(f"inhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}

    async def uninhibit_sleep(self):
        try:
            if self.inhibit_proc and self.inhibit_proc.poll() is None:
                self.inhibit_proc.terminate()
                try:
                    self.inhibit_proc.wait(timeout=1)
                except:
                    self.inhibit_proc.kill()
                self.inhibit_proc = None
                logger.info("Projacktor: Sleep uninhibited")
            return {"success": True}
        except Exception as e:
            logger.error(f"uninhibit_sleep error: {e}")
            return {"success": False, "error": str(e)}
    async def get_status(self):
        sett = load_settings()
        dp = os.path.expanduser(sett['download_path'])
        try:
            total, used, free = shutil.disk_usage(dp)
        except:
            free = 0
            
        j_ok = ping_jacred(sett.get('jacred_url') or '', timeout=4)
        
        return {
            "aria2_running": self.dm._running if self.dm else False,
            "jacred_status": j_ok,
            "free_disk_space": free
        }

    async def get_settings(self):
        return load_settings()

    async def save_settings(self, settings_json: str):
        try:
            s = json.loads(settings_json)
            save_settings(s)
            return True
        except:
            return False

    async def get_downloads_count(self):
        db = get_db()
        c = db.execute("SELECT COUNT(id) FROM downloads WHERE status NOT IN ('completed', 'error')").fetchone()
        db.close()
        return c[0] if c else 0

    async def get_disk_space(self):
        sett = load_settings()
        dp = os.path.expanduser(sett['download_path'])
        try:
            total, used, free = shutil.disk_usage(dp)
            return free
        except:
            return 0

    async def check_jacred(self, url: str):
        return ping_jacred(url, timeout=6)

    async def get_steam_language(self):
        try:
            vdf_path = os.path.join(get_user_home(), ".steam", "registry.vdf")
            if os.path.exists(vdf_path):
                with open(vdf_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    match = re.search(r'"language"\s+"([^"]+)"', content, re.IGNORECASE)
                    if match:
                        return match.group(1)
        except: pass
        return "ru"

    async def get_downloads(self):
        db = get_db()
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
        db.close()
        return [dict(row) for row in dls]

    async def add_to_library(self, data: str):
        try:
            body = json.loads(data) if isinstance(data, str) else data
            sett = load_settings()
            magnet = body.get('magnet', '')
            tmdb_id = body.get('tmdb_id')
            title = body.get('title', 'Медиа')
            year = body.get('year', '')
            mtype = body.get('media_type', 'movie')
            quality = body.get('quality', '')
            torrent_title = body.get('torrent_title', '') or f"{title} ({quality})".strip()
            poster_path = body.get('poster_path', '')
            backdrop_path = body.get('backdrop_path', '')
            overview = body.get('overview', '')
            in_lib = 1 if body.get('in_library', True) else 0
            
            base_dir = os.path.expanduser(sett['download_path'])
            folder = "Фильмы" if mtype == 'movie' else "Сериалы"
            safe_title = re.sub(r'[/\\?%*:|"<>!]', '', title).strip() or "Media"
            ddir = os.path.join(base_dir, folder, f"{safe_title} ({year})".strip())
            os.makedirs(ddir, exist_ok=True)
            
            db = get_db()
            cursor = db.cursor()
            cursor.execute("SELECT id, in_library FROM media WHERE tmdb_id=?", (tmdb_id,))
            row = cursor.fetchone()
            if not row:
                cursor.execute("""
                    INSERT INTO media (tmdb_id, title, year, media_type, poster_path, backdrop_path, overview,
                                       magnet_uri, torrent_title, quality, download_dir, in_library, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'catalog')
                """, (tmdb_id, title, year, mtype, poster_path, backdrop_path, overview,
                      magnet, torrent_title, quality, ddir, in_lib))
                mid = cursor.lastrowid
            else:
                mid = row['id']
                final_in_lib = 1 if (row['in_library'] == 1 or in_lib == 1) else 0
                cursor.execute("""
                    UPDATE media 
                    SET title=?, year=?, media_type=?,
                        poster_path=COALESCE(NULLIF(poster_path, ''), ?),
                        backdrop_path=COALESCE(NULLIF(backdrop_path, ''), ?),
                        overview=COALESCE(NULLIF(overview, ''), ?),
                        magnet_uri=?, torrent_title=?, quality=?, download_dir=?, in_library=?
                    WHERE id=?
                """, (title, year, mtype, poster_path, backdrop_path, overview,
                      magnet, torrent_title, quality, ddir, final_in_lib, mid))
            
            cursor.execute("SELECT id FROM downloads WHERE media_id=?", (mid,))
            dl_row = cursor.fetchone()
            if not dl_row:
                cursor.execute("""
                    INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, status, quality)
                    VALUES (?, ?, ?, ?, 'queued', ?)
                """, (mid, magnet, torrent_title, ddir, quality))
            else:
                cursor.execute("""
                    UPDATE downloads 
                    SET magnet_uri=?, torrent_title=?, download_dir=?, quality=?
                    WHERE id=?
                """, (magnet, torrent_title, ddir, quality, dl_row['id']))
                
            db.commit()
            db.close()
            return {"success": True, "id": mid}
        except Exception as e:
            logger.error(f"Plugin add_to_library error: {e}")
            return {"success": False, "error": str(e)}

    async def start_download(self, mid: int, file_indices: str = ""):
        try:
            db = get_db()
            cursor = db.cursor()
            m = cursor.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return {"success": False, "error": "Media not found"}
            
            magnet = m['magnet_uri']
            ddir = m['download_dir']
            if not magnet or not ddir:
                db.close()
                return {"success": False, "error": "Magnet link missing"}
                
            os.makedirs(ddir, exist_ok=True)
            dl = cursor.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
            gid = dl['aria2_gid'] if dl else None
            
            options = {
                "dir": ddir,
                "file-allocation": "none",
                "bt-prioritize-piece": "head=50M,tail=15M"
            }
            if file_indices:
                options["select-file"] = str(file_indices)
                
            if gid and self.dm:
                st = self.dm.get_status(gid)
                if st:
                    followed = st.get('followedBy')
                    if followed and len(followed) > 0:
                        gid = followed[0]
                        st = self.dm.get_status(gid) or st
                        cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (gid, dl['id']))
                    if file_indices:
                        self.dm.select_files(gid, str(file_indices))
                    self.dm.resume(gid)
                    cursor.execute("UPDATE downloads SET status='downloading' WHERE id=?", (dl['id'],))
                    cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
                    db.commit()
                    db.close()
                    return {"success": True, "gid": gid}
                    
            new_gid = self.dm.add_download(magnet, ddir, options) if self.dm else ""
            if dl:
                cursor.execute("UPDATE downloads SET aria2_gid=?, status='downloading' WHERE id=?", (new_gid, dl['id']))
            else:
                cursor.execute("""
                    INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                    VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                """, (mid, magnet, m['torrent_title'], ddir, new_gid, m['quality']))
                
            cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
            db.commit()
            db.close()
            return {"success": True, "gid": new_gid}
        except Exception as e:
            logger.error(f"Plugin start_download error: {e}")
            return {"success": False, "error": str(e)}

    async def get_episodes(self, mid: int):
        try:
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return []
            
            video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
            existing_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY file_name ASC", (mid,)).fetchall()
            dl = db.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
            
            # 1. If local files are already indexed in media_files
            if existing_files and len(existing_files) > 0:
                db.close()
                episodes = []
                for idx, f in enumerate(existing_files, 1):
                    episodes.append({
                        "index": idx,
                        "name": f['file_name'],
                        "path": f['file_path'],
                        "size": f['file_size'],
                        "completed": f['file_size'],
                        "selected": True,
                        "downloaded": True
                    })
                return episodes

            # 2. Check download_dir for already downloaded video files
            ddir = m['download_dir'] or os.path.join(get_user_home(), "Video", "Projacktor", "Сериалы")
            if os.path.isdir(ddir):
                disk_episodes = []
                for root, _, files in os.walk(ddir):
                    for idx, f in enumerate(sorted(files), 1):
                        if os.path.splitext(f)[1].lower() in video_exts:
                            fp = os.path.join(root, f)
                            try:
                                sz = os.path.getsize(fp)
                            except:
                                sz = 0
                            is_dl = not os.path.exists(fp + ".aria2") and is_header_ready(fp)
                            disk_episodes.append({
                                "index": idx,
                                "name": f,
                                "path": fp,
                                "size": sz,
                                "completed": sz if is_dl else 0,
                                "selected": True,
                                "downloaded": is_dl
                            })
                if disk_episodes and all(e['downloaded'] for e in disk_episodes):
                    db.close()
                    return disk_episodes

            # 3. Check cached episodes in media table
            cached_json = m['episodes_json'] if 'episodes_json' in m.keys() else None
            gid = dl['aria2_gid'] if dl else None
            
            if cached_json:
                try:
                    cached_eps = json.loads(cached_json)
                    if cached_eps and len(cached_eps) > 0:
                        # Update live status from aria2 if available
                        if gid and self.dm:
                            st = self.dm.get_status(gid)
                            if st and st.get('followedBy'):
                                gid = st['followedBy'][0]
                                st = self.dm.get_status(gid) or st
                            if st and st.get('files'):
                                file_map = {int(f.get('index', 0)): f for f in st.get('files', [])}
                                for ep in cached_eps:
                                    af = file_map.get(ep['index'])
                                    if af:
                                        ep['completed'] = int(af.get('completedLength', ep['completed']))
                                        ep['selected'] = af.get('selected', 'false') == 'true'
                                        ep['downloaded'] = (ep['completed'] >= ep['size']) and ep['size'] > 0
                        db.close()
                        return cached_eps
                except Exception as e:
                    logger.error(f"Error reading cached episodes: {e}")

            # 4. Resolve metadata via aria2c
            aria_files = []
            if gid and self.dm:
                st = self.dm.get_status(gid)
                if st:
                    followed = st.get('followedBy')
                    if followed and len(followed) > 0:
                        gid = followed[0]
                        st = self.dm.get_status(gid) or st
                        if dl:
                            db.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (gid, dl['id']))
                            db.commit()
                    files = st.get('files', [])
                    real_files = [f for f in files if f.get('path') and not f.get('path', '').startswith('[METADATA]')]
                    if real_files:
                        aria_files = real_files

            if not aria_files and m['magnet_uri'] and self.dm:
                os.makedirs(ddir, exist_ok=True)
                st = self.dm.get_status(gid) if gid else None
                if not st:
                    gid = self.dm.add_download(m['magnet_uri'], ddir, {"pause": "false", "file-allocation": "none"})
                    if gid:
                        if dl:
                            db.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (gid, dl['id']))
                        else:
                            db.execute("""
                                INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                                VALUES (?, ?, ?, ?, ?, 'queued', ?)
                            """, (mid, m['magnet_uri'], m['torrent_title'], ddir, gid, m['quality']))
                        db.commit()

                # Poll aria2c up to 25s for metadata download
                for _ in range(25):
                    st = self.dm.get_status(gid) if gid else None
                    if st:
                        followed = st.get('followedBy')
                        if followed and len(followed) > 0:
                            gid = followed[0]
                            st = self.dm.get_status(gid) or st
                            if dl:
                                db.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (gid, dl['id']))
                                db.commit()
                        files = st.get('files', [])
                        real_files = [f for f in files if f.get('path') and not f.get('path', '').startswith('[METADATA]')]
                        video_files = [f for f in real_files if os.path.splitext(f.get('path', ''))[1].lower() in video_exts]
                        if video_files:
                            aria_files = real_files
                            if not dl or dl['status'] != 'downloading':
                                try:
                                    self.dm.pause(gid)
                                except:
                                    pass
                            break
                    await asyncio.sleep(1)

            episodes = []
            if aria_files:
                for f in aria_files:
                    path = f.get('path', '')
                    ext = os.path.splitext(path)[1].lower()
                    if ext in video_exts:
                        idx = int(f.get('index', 0))
                        length = int(f.get('length', 0))
                        completed = int(f.get('completedLength', 0))
                        selected = f.get('selected', 'false') == 'true'
                        downloaded = (completed >= length) and length > 0
                        name = os.path.basename(path)
                        episodes.append({
                            "index": idx,
                            "name": name,
                            "path": path,
                            "size": length,
                            "completed": completed,
                            "selected": selected,
                            "downloaded": downloaded
                        })
                # Cache episodes into DB
                if episodes:
                    try:
                        db.execute("UPDATE media SET episodes_json=? WHERE id=?", (json.dumps(episodes), mid))
                        db.commit()
                    except Exception as e:
                        logger.error(f"Error caching episodes: {e}")

            db.close()
            return episodes
        except Exception as e:
            logger.error(f"Plugin get_episodes error: {e}")
            return []

    async def download_episode(self, mid: int, file_index: int):
        idx = int(file_index) if file_index is not None else 0
        return await self.start_download(mid, str(idx))

    async def prepare_stream(self, mid: int, file_index: int = 0):
        try:
            file_idx = int(file_index) if file_index is not None else 0
            db = get_db()
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                db.close()
                return {"success": False, "error": "Медиа не найдено"}
            
            video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}

            # Check if media_files or download_dir has completed files
            m_files = db.execute("SELECT * FROM media_files WHERE media_id=? ORDER BY id ASC", (mid,)).fetchall()
            dl = db.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
            db.close()

            if m_files and len(m_files) > 0:
                target_file = None
                if file_idx > 0:
                    for f in m_files:
                        if str(file_idx) in f['file_name']:
                            target_file = f['file_path']
                            break
                if not target_file:
                    target_file = m_files[0]['file_path']
                if os.path.isfile(target_file) and is_header_ready(target_file):
                    return {
                        "success": True,
                        "file_path": target_file,
                        "title": m['title'],
                        "transcode": True,
                        "online": False
                    }

            ddir = m['download_dir'] or os.path.join(get_user_home(), "Video", "Projacktor", "Фильмы" if m['media_type'] == 'movie' else "Сериалы")
            
            # Check local files in ddir
            if os.path.isdir(ddir):
                for root, _, files in os.walk(ddir):
                    for f in sorted(files):
                        if os.path.splitext(f)[1].lower() in video_exts:
                            fp = os.path.join(root, f)
                            if not os.path.exists(fp + ".aria2") and is_header_ready(fp):
                                if file_idx > 0 and str(file_idx) not in f:
                                    continue
                                return {
                                    "success": True,
                                    "file_path": fp,
                                    "title": m['title'],
                                    "transcode": True,
                                    "online": False
                                }

            magnet = m['magnet_uri']
            if not magnet:
                return {"success": False, "error": "Нет magnet-ссылки для раздачи"}
                
            os.makedirs(ddir, exist_ok=True)
            gid = dl['aria2_gid'] if dl else None
            options = {
                "dir": ddir,
                "file-allocation": "none",
                "bt-prioritize-piece": "head=50M,tail=15M"
            }
            if file_idx > 0:
                options["select-file"] = str(file_idx)
                
            # Pause any other active streaming downloads so cache bandwidth is dedicated to this media
            if self.dm:
                try:
                    all_active = self.dm.tell_active() or []
                    for act in all_active:
                        act_gid = act.get('gid')
                        if act_gid and act_gid != gid:
                            try:
                                self.dm.pause(act_gid)
                            except:
                                pass
                except Exception as e:
                    logger.warning(f"Error pausing other downloads: {e}")

            if not gid and self.dm:
                gid = self.dm.add_download(magnet, ddir, options)
                db = get_db()
                if dl:
                    db.execute("UPDATE downloads SET aria2_gid=?, status='downloading' WHERE id=?", (gid, dl['id']))
                else:
                    db.execute("""
                        INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                        VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                    """, (mid, magnet, m['torrent_title'], ddir, gid, m['quality']))
                db.commit()
                db.close()
            elif gid and self.dm:
                st = self.dm.get_status(gid)
                if st and st.get('followedBy'):
                    gid = st['followedBy'][0]
                self.dm.change_options(gid, {"bt-prioritize-piece": "head=50M,tail=15M"})
                if file_idx > 0:
                    self.dm.select_files(gid, str(file_idx))
                self.dm.resume(gid)
                db = get_db()
                db.execute("UPDATE downloads SET status='downloading' WHERE media_id=?", (mid,))
                db.commit()
                db.close()
                
            target_file = None
            stream_title = f"{m['title']} (Онлайн)"
            
            # 1. If TV episode, check cached episodes in DB
            if file_idx > 0 and 'episodes_json' in m.keys() and m['episodes_json']:
                try:
                    eps = json.loads(m['episodes_json'])
                    for ep in eps:
                        if int(ep.get('index', -1)) == file_idx:
                            target_file = ep.get('path')
                            stream_title = f"{m['title']} - {ep.get('name', f'Серия #{file_idx}')}"
                            break
                except Exception as e:
                    logger.warning(f"Error parsing episodes_json: {e}")

            # 2. Check aria2 files if target_file not found yet (filter out [METADATA])
            if not target_file and gid and self.dm:
                st = self.dm.get_status(gid)
                if st and st.get('followedBy'):
                    gid = st['followedBy'][0]
                    st = self.dm.get_status(gid) or st
                if st and st.get('files'):
                    for af in st['files']:
                        af_path = af.get('path', '')
                        if not af_path or af_path.startswith('[METADATA]'):
                            continue
                        af_idx = int(af.get('index', 0))
                        if file_idx == 0 or af_idx == file_idx:
                            if file_idx > 0 or os.path.splitext(af_path)[1].lower() in video_exts:
                                target_file = af_path
                                if file_idx > 0:
                                    stream_title = f"{m['title']} - {os.path.basename(af_path)}"
                                break

            # 3. Check ddir for matching files
            if not target_file and os.path.isdir(ddir):
                for root, _, files in os.walk(ddir):
                    for f in sorted(files):
                        if f.startswith('[METADATA]'):
                            continue
                        if os.path.splitext(f)[1].lower() in video_exts:
                            if file_idx > 0 and str(file_idx) not in f:
                                continue
                            target_file = os.path.join(root, f)
                            if file_idx > 0:
                                stream_title = f"{m['title']} - {f}"
                            break
                    if target_file:
                        break

            # 4. If still not found, wait for aria2 to fetch metadata and spawn followed task (up to 35s)
            if not target_file and self.dm:
                for _ in range(35):
                    await asyncio.sleep(1)
                    # Re-check DB in case download was started/updated asynchronously
                    if not gid:
                        try:
                            db_chk = get_db()
                            dl_chk = db_chk.execute("SELECT aria2_gid FROM downloads WHERE media_id=? ORDER BY id DESC LIMIT 1", (mid,)).fetchone()
                            db_chk.close()
                            if dl_chk and dl_chk['aria2_gid']:
                                gid = dl_chk['aria2_gid']
                        except Exception:
                            pass

                    if gid:
                        st = self.dm.get_status(gid)
                        if st and st.get('followedBy'):
                            gid = st['followedBy'][0]
                            st = self.dm.get_status(gid) or st
                        if not st:
                            # Check if any task is following our old gid
                            waiting = self.dm.tell_waiting() or []
                            active = self.dm.tell_active() or []
                            for cand in (active + waiting):
                                if cand.get('following') == gid:
                                    gid = cand['gid']
                                    st = cand
                                    break
                        if st and st.get('files'):
                            for af in st['files']:
                                af_path = af.get('path', '')
                                if not af_path or af_path.startswith('[METADATA]'):
                                    continue
                                af_idx = int(af.get('index', 0))
                                if file_idx == 0 or af_idx == file_idx:
                                    if file_idx > 0 or os.path.splitext(af_path)[1].lower() in video_exts:
                                        target_file = af_path
                                        if file_idx > 0:
                                            stream_title = f"{m['title']} - {os.path.basename(af_path)}"
                                        break
                    
                    if not target_file and os.path.isdir(ddir):
                        for root, _, files in os.walk(ddir):
                            for f in sorted(files):
                                if f.startswith('[METADATA]'):
                                    continue
                                if os.path.splitext(f)[1].lower() in video_exts:
                                    if file_idx > 0 and str(file_idx) not in f:
                                        continue
                                    target_file = os.path.join(root, f)
                                    if file_idx > 0:
                                        stream_title = f"{m['title']} - {f}"
                                    break
                            if target_file:
                                break

                    if target_file:
                        break

            if target_file:
                return {
                    "success": True,
                    "file_path": target_file,
                    "title": stream_title,
                    "transcode": True,
                    "online": True
                }
            else:
                return {
                    "success": False,
                    "error": "Подключение к раздаче... Подождите несколько секунд и попробуйте снова."
                }
        except Exception as e:
            logger.error(f"Plugin prepare_stream error: {e}")
            return {"success": False, "error": str(e)}

    async def add_download(self, data: str):
        res = await self.add_to_library(data)
        if res.get("success") and res.get("id"):
            await self.start_download(res["id"])
        return res

    async def pause_download(self, did: int):
        try:
            db = get_db()
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            db.close()
            if row and row['aria2_gid'] and self.dm:
                self.dm.pause(row['aria2_gid'])
            return True
        except:
            return False

    async def resume_download(self, did: int):
        try:
            db = get_db()
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            db.close()
            if row and row['aria2_gid'] and self.dm:
                self.dm.resume(row['aria2_gid'])
            return True
        except:
            return False

    async def resume_all_downloads(self):
        try:
            if self.dm:
                self.dm.unpause_all()
            db = get_db()
            cursor = db.cursor()
            rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
            if self.dm:
                for r in rows:
                    if r['aria2_gid']:
                        try:
                            self.dm.resume(r['aria2_gid'])
                        except:
                            pass
            cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
            db.commit()
            db.close()
            if self.dm:
                self.dm._update_db()
            return True
        except Exception as e:
            logger.error(f"Plugin resume_all_downloads error: {e}")
            return False

    async def delete_download(self, did: int):
        try:
            db = get_db()
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            if row and row['aria2_gid'] and self.dm:
                try:
                    self.dm.remove(row['aria2_gid'])
                except: pass
            db.execute("DELETE FROM downloads WHERE id=?", (did,))
            db.commit()
            db.close()
            return True
        except:
            return False

    async def get_library(self):
        if self.dm:
            try:
                self.dm._update_db()
            except Exception as e:
                logger.error(f"get_library _update_db error: {e}")
        db = get_db()
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
            WHERE m.in_library = 1
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
                            if not os.path.exists(fp + ".aria2") and is_header_ready(fp):
                                try:
                                    sz = os.path.getsize(fp)
                                except:
                                    sz = 0
                                files_list.append({"file_path": fp, "file_name": fn, "file_size": sz})
            d['files'] = files_list
            if files_list and d.get('download_status') not in ('completed',):
                has_active_aria2 = any(os.path.exists(f['file_path'] + '.aria2') for f in files_list)
                if not has_active_aria2:
                    d['download_status'] = 'completed'
                    d['download_progress'] = 100.0
                    d['download_speed'] = 0
            result.append(d)
        db.close()
        return result

    async def delete_library_item(self, mid: int):
        try:
            db = get_db()
            files = db.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in files:
                try:
                    os.remove(f['file_path'])
                except: pass
            # Also cancel download if running
            dl = db.execute("SELECT aria2_gid FROM downloads WHERE media_id=?", (mid,)).fetchone()
            if dl and dl['aria2_gid'] and self.dm:
                try:
                    self.dm.remove(dl['aria2_gid'])
                except: pass
            db.execute("DELETE FROM downloads WHERE media_id=?", (mid,))
            db.execute("DELETE FROM media WHERE id=?", (mid,))
            db.commit()
            db.close()
            return True
        except:
            return False

    async def play_media(self, file_path: str):
        if not os.path.exists(file_path):
            return False
        env = _build_gui_env()
        for player in ["mpv", "vlc", "/usr/bin/xdg-open"]:
            if shutil.which(player):
                subprocess.Popen([player, file_path], env=env)
                return True
        return False

    async def clear_cache(self):
        try:
            # 1. Clear memory caches in HTTP server
            ProjacktorHandler.tmdb_cache.clear()
            
            # 2. Clear disk caches (TMDB metadata, images, etc.)
            cache_dir = os.path.join(CONFIG_DIR, "cache")
            if os.path.isdir(cache_dir):
                for item in os.listdir(cache_dir):
                    item_path = os.path.join(cache_dir, item)
                    try:
                        if os.path.isdir(item_path):
                            shutil.rmtree(item_path, ignore_errors=True)
                        else:
                            os.remove(item_path)
                    except Exception as e:
                        logger.warning(f"Failed to delete {item_path}: {e}")

            # 3. Clean temporary online downloads cache & unfinished files (.aria2 and stream cache)
            if self.dm:
                try:
                    self.dm.purge_download_result()
                except Exception as e:
                    logger.warning(f"Failed to purge aria2 download results: {e}")

            # Check download directories for items not marked completed or temporary online files
            try:
                db = get_db()
                # Find all files with .aria2 or temporary streaming files in download dirs
                rows = db.execute("SELECT download_dir, status FROM downloads").fetchall()
                db.close()
                for r in rows:
                    dd = r['download_dir']
                    if dd and os.path.isdir(dd) and r['status'] != 'completed':
                        for root, _, files in os.walk(dd):
                            for f in files:
                                if f.endswith(".aria2") or f.startswith("[METADATA]"):
                                    try:
                                        os.remove(os.path.join(root, f))
                                    except Exception:
                                        pass
            except Exception as e:
                logger.warning(f"Error cleaning download cache files: {e}")

            logger.info("Cache and temporary download files cleared successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False

