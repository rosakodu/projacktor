"""Base HTTP request handler with CORS, Range, JSON and router dispatch."""

import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

from ..core.env import logger

_ALLOWED_ORIGIN_HOSTS = {'127.0.0.1', 'localhost', 'steamloopback.host', '::1'}

_GLOBAL_ROUTER = None


def _get_router():
    global _GLOBAL_ROUTER
    if _GLOBAL_ROUTER is None:
        from .router import build_default_router
        _GLOBAL_ROUTER = build_default_router()
    return _GLOBAL_ROUTER


class BaseRequestHandler(BaseHTTPRequestHandler):
    """Base request handler providing CORS security, JSON utilities and route dispatching."""

    @property
    def app_context(self):
        from ..services.context import get_app_context
        return getattr(self.server, 'app_context', None) or get_app_context()

    def _is_origin_allowed(self):
        origin = self.headers.get('Origin', '')
        if not origin or origin == 'null':
            return True
        if origin.startswith('steam://'):
            return True
        try:
            parsed = urllib.parse.urlparse(origin)
            return parsed.scheme in ('http', 'https') and (parsed.hostname or '').lower() in _ALLOWED_ORIGIN_HOSTS
        except Exception:
            return False

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

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    _send_json = send_json

    def get_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return {}
            return json.loads(self.rfile.read(length))
        except Exception as e:
            logger.warning(f"Error parsing request body: {e}")
            return {}

    _get_body = get_body

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
            self.send_cors_headers()
            self.end_headers()
            return
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', 'video/webm')
        self.send_header('Accept-Ranges', 'none')
        self.end_headers()

    def do_GET(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        _get_router().dispatch(self, "GET")

    def do_POST(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        _get_router().dispatch(self, "POST")

    def do_PATCH(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        _get_router().dispatch(self, "PATCH")

    def do_PUT(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        _get_router().dispatch(self, "PUT")

    def do_DELETE(self):
        if not self._is_origin_allowed():
            self.send_response(403)
            self.end_headers()
            return
        _get_router().dispatch(self, "DELETE")


class ProjacktorRequestHandler(BaseRequestHandler):
    """Main Projacktor Decky HTTP request handler with compatibility hooks."""
    tmdb_cache = {}
