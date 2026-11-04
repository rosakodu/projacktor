"""Projacktor HTTP server and request dispatching package."""

from .server import ThreadedHTTPServer
from .base import BaseRequestHandler, ProjacktorRequestHandler
from .router import HttpRouter, build_default_router
from .stream_pipe import ACTIVE_STREAM_LOCK, ACTIVE_STREAM_PROCS, stop_all_active_streams


class _PluginInstanceProxy:
    """Compatibility proxy redirecting attribute access to active AppContext."""

    def __getattr__(self, name):
        from ..services.context import get_app_context
        return getattr(get_app_context(), name)

    def __bool__(self):
        from ..services.context import get_app_context
        return bool(get_app_context())

    def __repr__(self):
        from ..services.context import get_app_context
        return repr(get_app_context())


plugin_instance = _PluginInstanceProxy()

__all__ = [
    "ThreadedHTTPServer",
    "BaseRequestHandler",
    "ProjacktorRequestHandler",
    "HttpRouter",
    "build_default_router",
    "ACTIVE_STREAM_LOCK",
    "ACTIVE_STREAM_PROCS",
    "stop_all_active_streams",
    "plugin_instance",
    "_PluginInstanceProxy",
]
