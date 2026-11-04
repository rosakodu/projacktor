import json
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any, Union

from ..core.env import logger


class Aria2Client:
    """Client for aria2c JSON-RPC 2.0 interface."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 6800,
        secret: str = "",
        timeout: float = 2.0
    ):
        self.host = host
        self.port = port
        self.secret = secret
        self.timeout = timeout
        self.rpc_url = f"http://{self.host}:{self.port}/jsonrpc"

    def call(self, method: str, params: Optional[list] = None) -> Any:
        """Executes a JSON-RPC 2.0 call with secret authentication token."""
        if params is None:
            params = []
        if self.secret:
            params = [f"token:{self.secret}"] + params
        payload = {
            "jsonrpc": "2.0",
            "id": "projacktor",
            "method": method,
            "params": params
        }
        try:
            req = urllib.request.Request(
                self.rpc_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if "error" in res_data:
                    logger.debug(f"Aria2 RPC error for {method}: {res_data['error']}")
                    return None
                return res_data.get('result')
        except Exception as e:
            logger.debug(f"Aria2 RPC exception for {method}: {e}")
            return None

    def get_version(self) -> Optional[Dict]:
        """Queries aria2.getVersion."""
        return self.call("aria2.getVersion")

    def is_alive(self) -> bool:
        """Checks if aria2 daemon is responsive."""
        res = self.get_version()
        return res is not None and "version" in res

    def add_uri(self, uris: List[str], options: Optional[Dict] = None) -> Optional[str]:
        """Adds URIs (magnet / HTTP / FTP) with optional download options."""
        opt = {
            "allow-overwrite": "true",
            "auto-file-renaming": "false",
        }
        if options and isinstance(options, dict):
            opt.update(options)
        return self.call("aria2.addUri", [uris, opt])

    def add_torrent(
        self,
        torrent_b64: str,
        uris: Optional[List[str]] = None,
        options: Optional[Dict] = None
    ) -> Optional[str]:
        """Adds base64-encoded torrent with optional peer URIs and options."""
        opt = {
            "allow-overwrite": "true",
            "auto-file-renaming": "false",
        }
        if options and isinstance(options, dict):
            opt.update(options)
        return self.call("aria2.addTorrent", [torrent_b64, uris or [], opt])

    def tell_status(self, gid: str, keys: Optional[List[str]] = None) -> Optional[Dict]:
        """Retrieves status for a specific download GID."""
        params = [gid] if not keys else [gid, keys]
        return self.call("aria2.tellStatus", params)

    def get_files(self, gid: str) -> Optional[List[Dict]]:
        """Retrieves file listing for download GID."""
        return self.call("aria2.getFiles", [gid])

    def change_option(self, gid: str, options: Dict) -> Optional[str]:
        """Updates options for active/paused download."""
        return self.call("aria2.changeOption", [gid, options])

    def select_files(self, gid: str, file_indices: Union[str, List[int]]) -> Optional[str]:
        """Selects specific file indices to download (1-based, comma separated or list)."""
        if isinstance(file_indices, (list, tuple)):
            indices_str = ",".join(str(i) for i in file_indices)
        else:
            indices_str = str(file_indices)
        return self.change_option(gid, {"select-file": indices_str})

    def pause(self, gid: str) -> Optional[str]:
        """Pauses download by GID."""
        return self.call("aria2.pause", [gid])

    def unpause(self, gid: str) -> Optional[str]:
        """Resumes paused download by GID."""
        return self.call("aria2.unpause", [gid])

    def unpause_all(self) -> Optional[str]:
        """Resumes all paused downloads."""
        return self.call("aria2.unpauseAll")

    def remove(self, gid: str) -> Optional[str]:
        """Removes download by GID."""
        return self.call("aria2.remove", [gid])

    def force_remove(self, gid: str) -> Optional[str]:
        """Forcefully removes download by GID."""
        return self.call("aria2.forceRemove", [gid])

    def remove_download_result(self, gid: str) -> Optional[str]:
        """Removes completed/error download result from memory."""
        return self.call("aria2.removeDownloadResult", [gid])

    def purge_download_result(self) -> Optional[str]:
        """Purges all completed/error/removed download results."""
        return self.call("aria2.purgeDownloadResult")

    def save_session(self) -> Optional[str]:
        """Forces aria2c to write current session to file."""
        return self.call("aria2.saveSession")

    def tell_active(self, keys: Optional[List[str]] = None) -> List[Dict]:
        """Returns list of active downloads."""
        res = self.call("aria2.tellActive", [keys] if keys else [])
        return res if isinstance(res, list) else []

    def tell_waiting(self, offset: int = 0, num: int = 100, keys: Optional[List[str]] = None) -> List[Dict]:
        """Returns list of queued/waiting downloads."""
        params = [offset, num] if not keys else [offset, num, keys]
        res = self.call("aria2.tellWaiting", params)
        return res if isinstance(res, list) else []

    def tell_stopped(self, offset: int = 0, num: int = 100, keys: Optional[List[str]] = None) -> List[Dict]:
        """Returns list of stopped/completed/error downloads."""
        params = [offset, num] if not keys else [offset, num, keys]
        res = self.call("aria2.tellStopped", params)
        return res if isinstance(res, list) else []

    def get_global_stat(self) -> Optional[Dict]:
        """Returns global download/upload statistics."""
        return self.call("aria2.getGlobalStat")
