"""HTTP request router and dispatch table."""

import urllib.parse
from typing import Callable, Dict, List, Tuple


class HttpRouter:
    """Matches request methods and paths to registered handlers."""

    def __init__(self):
        self.routes: Dict[str, List[Tuple[str, bool, Callable]]] = {
            "GET": [], "POST": [], "PATCH": [], "PUT": [], "DELETE": []
        }

    def register(self, method: str, path: str, handler: Callable, prefix: bool = False):
        self.routes.setdefault(method.upper(), []).append((path, prefix, handler))

    def dispatch(self, handler, method: str):
        parsed = urllib.parse.urlparse(handler.path)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)

        for route_path, is_prefix, route_handler in self.routes.get(method.upper(), []):
            if (is_prefix and path.startswith(route_path)) or (not is_prefix and path == route_path):
                route_handler(handler, path, query)
                return

        handler.send_response(404)
        if method.upper() == "GET":
            handler.send_cors_headers()
        handler.end_headers()


def build_default_router() -> HttpRouter:
    """Constructs and registers all standard Projacktor HTTP routes."""
    from .stream import handle_stream, handle_stream_stop, handle_stream_probe, handle_stream_torrent_status
    from .subtitles import handle_stream_subtitles
    from .image import handle_image_proxy
    from .proxy import handle_tmdb, handle_jacred_search, handle_jacred_status, handle_torrserver_prewarm
    from .api import (
        handle_downloads_list, handle_downloads_stats, handle_downloads_add, handle_downloads_resume_all,
        handle_downloads_patch, handle_downloads_delete, handle_library_list, handle_library_details,
        handle_library_patch, handle_library_delete, handle_settings_get, handle_settings_put,
        handle_status, handle_disk
    )

    r = HttpRouter()
    # GET routes
    r.register("GET", "/api/tmdb/", handle_tmdb, prefix=True)
    r.register("GET", "/api/jacred/search", handle_jacred_search, prefix=True)
    r.register("GET", "/api/jacred/status", handle_jacred_status)
    r.register("GET", "/api/image", handle_image_proxy)
    r.register("GET", "/api/downloads/stats", handle_downloads_stats)
    r.register("GET", "/api/downloads", handle_downloads_list)
    r.register("GET", "/api/library/", handle_library_details, prefix=True)
    r.register("GET", "/api/library", handle_library_list)
    r.register("GET", "/api/stream/stop", handle_stream_stop)
    r.register("GET", "/api/stream/probe", handle_stream_probe)
    r.register("GET", "/api/stream/torrent_status", handle_stream_torrent_status)
    r.register("GET", "/api/stream/subtitles", handle_stream_subtitles)
    r.register("GET", "/api/stream", handle_stream)
    r.register("GET", "/api/torrserver/prewarm", handle_torrserver_prewarm)
    r.register("GET", "/api/settings", handle_settings_get)
    r.register("GET", "/api/status", handle_status)
    r.register("GET", "/api/disk", handle_disk)

    # POST routes
    r.register("POST", "/api/downloads/resume_all", handle_downloads_resume_all)
    r.register("POST", "/api/downloads", handle_downloads_add)

    # PATCH routes
    r.register("PATCH", "/api/downloads/", handle_downloads_patch, prefix=True)
    r.register("PATCH", "/api/library/", handle_library_patch, prefix=True)

    # PUT routes
    r.register("PUT", "/api/settings", handle_settings_put)

    # DELETE routes
    r.register("DELETE", "/api/downloads/", handle_downloads_delete, prefix=True)
    r.register("DELETE", "/api/library/", handle_library_delete, prefix=True)

    return r
