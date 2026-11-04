"""Backward-compatibility facade for py_modules.http."""

from .http import (
    ThreadedHTTPServer,
    ProjacktorRequestHandler,
    stop_all_active_streams,
    ACTIVE_STREAM_LOCK,
    ACTIVE_STREAM_PROCS,
    _PluginInstanceProxy,
    plugin_instance,
)
from .media.subtitles import (
    ensure_utf8_subtitles,
    finalize_vtt,
    find_external_subtitles,
    prewarm_subtitle_cache,
)


def __getattr__(name: str):
    if name == "plugin_instance":
        from .services.context import get_app_context
        return get_app_context()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    "ThreadedHTTPServer",
    "ProjacktorRequestHandler",
    "stop_all_active_streams",
    "ACTIVE_STREAM_LOCK",
    "ACTIVE_STREAM_PROCS",
    "plugin_instance",
    "_PluginInstanceProxy",
    "ensure_utf8_subtitles",
    "finalize_vtt",
    "find_external_subtitles",
    "prewarm_subtitle_cache",
]
