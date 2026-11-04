"""
Backward-compatibility facade for py_modules.transcoder.
Re-exports transcoding functions and hardware detection from py_modules.media.transcoder and py_modules.core.
"""

import logging
from .media.transcoder import resolve_transcode_plan, build_ffmpeg_stream_command
from .core.hardware import (
    is_external_display_connected,
    detect_gpu_vendor,
    has_nvenc_support,
    has_vaapi_support,
    has_vaapi_av1_support
)
from .core.env import get_bin_path
from .core.process import _clean_env

logger = logging.getLogger("projacktor.transcoder")

__all__ = [
    "resolve_transcode_plan",
    "build_ffmpeg_stream_command",
    "is_external_display_connected",
    "detect_gpu_vendor",
    "has_nvenc_support",
    "has_vaapi_support",
    "has_vaapi_av1_support",
    "get_bin_path",
    "_clean_env",
    "logger",
]
