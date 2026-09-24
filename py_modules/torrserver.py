import os
import re
import time
import urllib.request
import urllib.parse
import urllib.error
import subprocess
import shutil
import threading
import json

from .db import CONFIG_DIR, get_user_home, logger
from .common import get_bin_path, _clean_env

def extract_hash_from_magnet(magnet):
    if not magnet:
        return ""
    m = re.search(r'xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})', magnet)
    if m:
        h = m.group(1).lower()
        if len(h) == 32:
            try:
                import base64
                return base64.b32decode(h.upper()).hex().lower()
            except Exception:
                pass
        return h
    return ""

# --- TorrServer Manager ---
class TorrServerManager:
    def __init__(self, port=8095):
        self.port = port
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.process = None
        self._running = False
        self._lock = threading.Lock()

    def is_running(self):
        try:
            req = urllib.request.Request(f"{self.base_url}/echo")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                text = resp.read().decode('utf-8', errors='ignore')
                return "MatriX" in text or "TorrServer" in text
        except Exception:
            return False

    def ensure_running(self):
        if self.is_running():
            self._running = True
            return True
        logger.warning("TorrServer is not running. Starting it now...")
        return self.start()

    def start(self):
        with self._lock:
            if self.is_running():
                logger.info(f"TorrServer is already running on port {self.port}")
                self._running = True
                return True

            # 1. Clean up dead child process if present to prevent zombies (<defunct>)
            if self.process:
                try:
                    self.process.poll()
                except Exception:
                    pass
                self.process = None

            # 2. Terminate any orphan projacktor-ts processes on this port
            try:
                subprocess.run(["pkill", "-9", "-f", f"projacktor-ts.*-p {self.port}"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(1.0)
            except Exception:
                pass

            # 3. Locate binary: prefer 'projacktor-ts' (isolated from lampa-deck's killall TorrServer)
            bin_path = get_bin_path("projacktor-ts")
            if not os.path.isfile(bin_path) or os.path.getsize(bin_path) < 1000000:
                # Check for TorrServer in plugin bin
                orig_ts = get_bin_path("TorrServer")
                if os.path.isfile(orig_ts) and os.path.getsize(orig_ts) > 1000000:
                    try:
                        shutil.copy2(orig_ts, bin_path)
                        os.chmod(bin_path, 0o755)
                        logger.info(f"Copied {orig_ts} to {bin_path}")
                    except Exception as e:
                        logger.warning(f"Failed to copy {orig_ts} to {bin_path}: {e}")

            if not os.path.isfile(bin_path) or os.path.getsize(bin_path) < 1000000:
                # Fallback checks on Steam Deck
                home = get_user_home()
                candidates = [
                    os.path.join(home, "homebrew", "settings", "lampa-deck", "bin", "TorrServer"),
                    os.path.join(home, "homebrew", "plugins", "lampa-deck", "bin", "TorrServer"),
                    os.path.join(home, "homebrew", "settings", "Lampa Deck", "bin", "TorrServer")
                ]
                for c in candidates:
                    if os.path.isfile(c) and os.path.getsize(c) > 1000000:
                        try:
                            os.makedirs(os.path.dirname(bin_path), exist_ok=True)
                            shutil.copy2(c, bin_path)
                            os.chmod(bin_path, 0o755)
                            logger.info(f"Copied TorrServer binary from {c} to {bin_path}")
                            break
                        except Exception as e:
                            logger.warning(f"Failed to copy TorrServer from {c}: {e}")

            if not os.path.isfile(bin_path) or os.path.getsize(bin_path) < 1000000:
                logger.error(f"TorrServer binary not found at {bin_path}!")
                return False

            try:
                os.chmod(bin_path, 0o755)
            except Exception:
                pass

            db_path = os.path.join(CONFIG_DIR, "torrserver")
            os.makedirs(db_path, exist_ok=True)
            settings_file = os.path.join(db_path, "settings.json")
            db_file = os.path.join(db_path, "config.db")
            if os.path.isfile(db_file):
                try:
                    os.remove(db_file)
                    logger.info("Cleaned legacy TorrServer config.db")
                except Exception as e:
                    logger.warning(f"Failed to remove legacy config.db: {e}")

            bt_settings = {
                "CacheSize": 268435456,        # 256MB RAM cache
                "ReaderReadAHead": 95,          # Buffer ahead percentage
                "PreloadCache": 15,             # 15% preload buffer for faster start
                "UseDisk": False,               # RAM only, zero disk writes
                "TorrentsSavePath": "",
                "RemoveCacheOnDrop": False,     # Keep cache across seeks and probe reconnects
                "ForceEncrypt": False,
                "RetrackersMode": 1,
                "TorrentDisconnectTimeout": 120, # Keep BT client connected for 2 mins between requests
                "ConnectionsLimit": 120,
                "PeersListenPort": 0,
                "DisableUPNP": True,           # Disable UPnP to avoid router NAT discovery delay
                "EnableLPD": True,
                "ResponsiveMode": True,
                "ShowFSActiveTorr": True,
                "StoreSettingsInJson": True,
                "TrackTimecode": False
            }
            default_settings = dict(bt_settings)
            default_settings["BitTorr"] = dict(bt_settings)
            try:
                with open(settings_file, "w", encoding="utf-8") as f:
                    json.dump(default_settings, f, indent=2)
            except Exception as e:
                logger.warning(f"Could not write TorrServer settings.json: {e}")

            log_path = os.path.join(CONFIG_DIR, "torrserver.log")

            env = _clean_env()
            cmd = [bin_path, "-p", str(self.port), "-d", db_path, "-l", log_path]

            try:
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    env=env,
                    start_new_session=True
                )
                logger.info(f"TorrServer started with {bin_path} on port {self.port} (PID {self.process.pid}).")
            except Exception as e:
                logger.error(f"Failed to spawn TorrServer: {e}")
                return False

            # 4. Wait for TorrServer to become responsive (up to 25 seconds)
            started = False
            for _ in range(50):
                time.sleep(0.5)
                if self.is_running():
                    started = True
                    break
                if self.process and self.process.poll() is not None:
                    logger.error(f"TorrServer process exited prematurely with code {self.process.returncode}")
                    break

            if started:
                self._running = True
                return True
            else:
                logger.error(f"TorrServer failed to respond on port {self.port} within timeout.")
                return False

    def stop(self):
        self._running = False
        if self.process:
            logger.info("Stopping TorrServer...")
            try:
                self.process.terminate()
                self.process.wait(timeout=0.8)
            except subprocess.TimeoutExpired:
                try:
                    self.process.kill()
                    self.process.wait(timeout=0.4)
                except Exception:
                    pass
            except Exception:
                pass
            self.process = None

        try:
            subprocess.run(["pkill", "-9", "-f", f"projacktor-ts.*-p {self.port}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        logger.info("TorrServer stopped.")

    def add_torrent(self, magnet_or_link, title="", poster=""):
        if not self.ensure_running():
            logger.error("TorrServer is not running and could not be started for add_torrent.")
            return None
        try:
            if magnet_or_link and magnet_or_link.startswith("magnet:?"):
                trackers = [
                    "udp://tracker.opentrackr.org:1337/announce",
                    "udp://open.stealth.si:80/announce",
                    "udp://tracker.torrent.eu.org:451/announce",
                    "udp://explodie.org:6969/announce"
                ]
                for tr in trackers:
                    if tr not in magnet_or_link:
                        magnet_or_link += f"&tr={urllib.parse.quote(tr, safe='')}"

            url = f"{self.base_url}/torrents"
            payload = {
                "action": "add",
                "link": magnet_or_link,
                "title": title,
                "poster": poster,
                "save_to_db": True
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.error(f"TorrServer add_torrent error: {e}")
            return None

    def get_torrent(self, torrent_hash):
        if not self.ensure_running() or not torrent_hash:
            return None
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "get", "hash": torrent_hash}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.error(f"TorrServer get_torrent error: {e}")
            return None

    def drop_torrent(self, torrent_hash):
        if not self.is_running() or not torrent_hash:
            return False
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "drop", "hash": torrent_hash}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                return True
        except Exception:
            return False

    def get_stream_url(self, torrent_hash, file_index=1, filename="video.mp4"):
        fn = urllib.parse.quote(filename or "video.mp4")
        return f"{self.base_url}/stream/{fn}?link={torrent_hash}&index={file_index}&play"


def extract_ts_files(t_info):
    """
    Универсальное извлечение списка файлов раздачи из TorrServer.
    Поддерживает:
    1. Классический TorrServer (ключ 'file_stats' на верхнем уровне).
    2. TorrServer MatriX (вложенный JSON 'data' -> 'TorrServer' -> 'Files').
    """
    if not t_info or not isinstance(t_info, dict):
        return []
    if t_info.get('file_stats'):
        return t_info['file_stats']
    data_str = t_info.get('data')
    if data_str and isinstance(data_str, str):
        try:
            parsed = json.loads(data_str)
            files = parsed.get('TorrServer', {}).get('Files', [])
            if files:
                return files
        except Exception:
            pass
    elif data_str and isinstance(data_str, dict):
        files = data_str.get('TorrServer', {}).get('Files', [])
        if files:
            return files
    return []

# --- HTTP Server ---
