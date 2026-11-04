import re
import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, List, Dict, Any

from ..core.env import logger
from ..core.network import POPULAR_TRACKERS


def extract_hash_from_magnet(magnet: str) -> str:
    """
    Extracts 40-character lowercase hexadecimal info-hash from magnet link,
    converting 32-character base32 hashes if necessary.
    """
    if not magnet:
        return ""
    m = re.search(r'xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})', magnet, flags=re.IGNORECASE)
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


def extract_ts_files(t_info: Any) -> List[Dict]:
    """
    Universal extraction of torrent file list from TorrServer responses.
    Supports both classic TorrServer ('file_stats') and TorrServer MatriX ('data' -> 'TorrServer' -> 'Files').
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


class TorrServerClient:
    """REST API Client for TorrServer / TorrServer MatriX."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8095, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.base_url = f"http://{self.host}:{self.port}"

    def echo(self) -> bool:
        """Pings TorrServer /echo endpoint."""
        try:
            req = urllib.request.Request(f"{self.base_url}/echo")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                text = resp.read().decode('utf-8', errors='ignore')
                return "MatriX" in text or "TorrServer" in text
        except Exception:
            return False

    def is_alive(self) -> bool:
        """Alias for echo()."""
        return self.echo()

    def get_settings(self) -> Optional[Dict]:
        """Fetches TorrServer configuration settings."""
        try:
            url = f"{self.base_url}/settings"
            payload = {"action": "get"}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.debug(f"TorrServer get_settings error: {e}")
            return None

    def set_settings(self, sets_dict: Dict) -> bool:
        """Updates TorrServer configuration settings."""
        try:
            url = f"{self.base_url}/settings"
            payload = {
                "action": "set",
                "sets": sets_dict
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.status == 200
        except Exception as e:
            logger.debug(f"TorrServer set_settings error: {e}")
            return False

    def add_torrent(
        self,
        magnet_or_link: str,
        title: str = "",
        poster: str = "",
        save_to_db: bool = True
    ) -> Optional[Dict]:
        """Adds a torrent to TorrServer with popular trackers appended."""
        try:
            link = magnet_or_link
            if link and link.startswith("magnet:?"):
                for tr in POPULAR_TRACKERS:
                    if tr not in link:
                        link += f"&tr={urllib.parse.quote(tr, safe='')}"

            url = f"{self.base_url}/torrents"
            payload = {
                "action": "add",
                "link": link,
                "title": title,
                "poster": poster,
                "save_to_db": save_to_db
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.error(f"TorrServer add_torrent error: {e}")
            return None

    def get_torrent(self, torrent_hash: str) -> Optional[Dict]:
        """Fetches details for a specific torrent hash."""
        if not torrent_hash:
            return None
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "get", "hash": torrent_hash}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.error(f"TorrServer get_torrent error: {e}")
            return None

    def drop_torrent(self, torrent_hash: str) -> bool:
        """Drops active torrent cache in TorrServer without removing from DB."""
        if not torrent_hash:
            return False
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "drop", "hash": torrent_hash}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                return True
        except Exception:
            return False

    def remove_torrent(self, torrent_hash: str) -> bool:
        """Completely removes a torrent from TorrServer."""
        if not torrent_hash:
            return False
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "rem", "hash": torrent_hash}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                return True
        except Exception:
            return False

    def list_torrents(self) -> List[Dict]:
        """Lists all stored torrents in TorrServer."""
        try:
            url = f"{self.base_url}/torrents"
            payload = {"action": "list"}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                return res if isinstance(res, list) else []
        except Exception as e:
            logger.debug(f"TorrServer list_torrents error: {e}")
            return []

    def get_stream_url(self, torrent_hash: str, file_index: int = 1, filename: str = "video.mp4") -> str:
        """Constructs direct HTTP streaming URL for a torrent file."""
        fn = urllib.parse.quote(filename or "video.mp4")
        return f"{self.base_url}/stream/{fn}?link={torrent_hash}&index={file_index}&play"

    def get_torrent_status(self, torrent_hash: str) -> Optional[Dict]:
        """Returns structured progress and peer stats for active torrent stream."""
        if not torrent_hash:
            return None
        try:
            info = self.get_torrent(torrent_hash)
            if not info or not isinstance(info, dict):
                return None
            stat = info.get("stat", 0)
            stat_string = info.get("stat_string", "")
            connected_seeders = info.get("connected_seeders", 0) or 0
            active_peers = info.get("active_peers", 0) or 0
            total_peers = info.get("total_peers", 0) or 0
            download_speed = float(info.get("download_speed", 0.0) or 0.0)
            preloaded_bytes = int(info.get("preloaded_bytes", 0) or 0)
            loaded_size = int(info.get("loaded_size", 0) or 0)
            torrent_size = int(info.get("torrent_size", 0) or 0)

            preload_target = 4 * 1024 * 1024
            preloaded_pct = 0
            if preloaded_bytes > 0:
                preloaded_pct = min(100, int((preloaded_bytes / preload_target) * 100))

            return {
                "stat": stat,
                "stat_string": stat_string,
                "connected_seeders": connected_seeders,
                "active_peers": active_peers,
                "total_peers": total_peers,
                "download_speed": download_speed,
                "preloaded_bytes": preloaded_bytes,
                "preloaded_pct": preloaded_pct,
                "loaded_size": loaded_size,
                "torrent_size": torrent_size
            }
        except Exception as e:
            logger.debug(f"TorrServer get_torrent_status error: {e}")
            return None
