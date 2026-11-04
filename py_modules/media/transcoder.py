"""
Transcoder package facade.
Re-exports transcode planning, command building, and hardware detection.
"""

import logging
from ..core.hardware import (
    is_external_display_connected,
    has_nvenc_support,
    has_vaapi_support,
    has_vaapi_av1_support,
)
from .transcoder_plan import _safe_int, resolve_transcode_plan
from .transcoder_cmd import _calculate_bufsize, build_ffmpeg_stream_command

logger = logging.getLogger("projacktor.media.transcoder")

__all__ = [
    "resolve_transcode_plan",
    "build_ffmpeg_stream_command",
    "_safe_int",
    "_calculate_bufsize",
    "is_external_display_connected",
    "has_nvenc_support",
    "has_vaapi_support",
    "has_vaapi_av1_support",
    "logger",
]
