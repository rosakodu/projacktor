"""
Backward-compatibility facade for py_modules.stream.
Re-exports media probing from py_modules.media.probe.
"""

from .db import logger
from .common import get_bin_path, _clean_env
from .constants import PROBE_CACHE_MAX_SIZE
from .media.probe import (
    is_header_ready,
    unwrap_stream_source,
    _parse_ffprobe_data,
    parse_ffprobe_data,
    _normalize_probe_key,
    probe_media_file,
    PROBE_CACHE,
    _PROBE_LOCK,
    _PROBE_IN_FLIGHT
)

__all__ = [
    "is_header_ready",
    "unwrap_stream_source",
    "_parse_ffprobe_data",
    "parse_ffprobe_data",
    "_normalize_probe_key",
    "probe_media_file",
    "PROBE_CACHE",
    "_PROBE_LOCK",
    "_PROBE_IN_FLIGHT",
    "logger",
    "get_bin_path",
    "_clean_env",
    "PROBE_CACHE_MAX_SIZE",
]
