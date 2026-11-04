"""
FFmpeg command construction for media streaming pipes.
"""

import os
import re
import logging
from ..core.env import get_bin_path

logger = logging.getLogger("projacktor.media.transcoder_cmd")


def _calculate_bufsize(max_rate, multiplier: float = 2.0, default: str = "12M") -> str:
    if not max_rate:
        return default
    m = re.match(r"^([0-9.]+)\s*([a-zA-Z]*)$", str(max_rate).strip())
    if not m:
        return default
    try:
        val, unit = float(m.group(1)), m.group(2).lower()
        mul = 1_000_000 if "g" in unit else (1000 if "m" in unit else (1 if "k" in unit else (1000 if val < 100 or val >= 100_000 else 1)))
        buf_kbps = int(round(val * mul * multiplier))
        return default if buf_kbps <= 0 else (f"{buf_kbps // 1000}M" if buf_kbps % 1000 == 0 else f"{buf_kbps}k")
    except (ValueError, TypeError):
        return default


def build_ffmpeg_stream_command(
    source: str, plan: dict, start_time: float = 0.0,
    audio_idx: str = "", is_http: bool = False, is_online: bool = False
) -> list:
    cmd = [get_bin_path("ffmpeg"), "-hide_banner", "-loglevel", "error"]
    hw_accel, container = plan.get("hw_accel", "none"), plan.get("container", "webm")
    if hw_accel in ("vaapi", "vaapi_av1"):
        cmd += ["-init_hw_device", "vaapi=va:/dev/dri/renderD128", "-filter_hw_device", "va",
                "-hwaccel", "vaapi", "-hwaccel_device", "va"]
        if hw_accel == "vaapi_av1":
            cmd += ["-hwaccel_output_format", "vaapi"]

    try:
        st = float(start_time or 0.0)
    except (ValueError, TypeError):
        st = 0.0
    if st > 0:
        if not plan.get("video_needs_transcode", True):
            cmd += ["-noaccurate_seek"]
        cmd += ["-ss", str(st)]

    if is_http:
        cmd += [
            "-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_streamed", "1",
            "-reconnect_delay_max", "2", "-reconnect_on_network_error", "1",
            "-reconnect_on_http_error", "4xx,5xx"
        ]
    if is_online and not is_http:
        cmd += ["-follow", "1"]

    cmd += ["-i", source, "-map", "0:V:0?", "-map", f"0:{audio_idx}?" if audio_idx else "0:a:0?"]

    if plan.get("video_needs_transcode", True):
        bufsize = _calculate_bufsize(plan.get("max_rate", "6M"))
        vf = plan.get("vf_filter", "")
        if hw_accel == "vaapi_av1":
            cmd += ["-vf", vf, "-c:v", "av1_vaapi", "-g", "60", "-b:v", plan.get("target_bitrate", "14M"),
                    "-maxrate", plan.get("max_rate", "20M"), "-bufsize", bufsize]
        elif container == "webm":
            threads = str(min(4, os.cpu_count() or 4))
            cmd += [
                "-vf", vf, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-deadline", "realtime",
                "-cpu-used", "8", "-row-mt", "1", "-threads", threads, "-g", "60",
                "-lag-in-frames", "0", "-error-resilient", "1", "-auto-alt-ref", "0",
                "-b:v", plan.get("target_bitrate", "4M"), "-minrate", plan.get("min_rate", "1M"),
                "-maxrate", plan.get("max_rate", "6M"), "-bufsize", bufsize
            ]
        elif hw_accel == "nvenc":
            cmd += ["-vf", vf, "-c:v", "h264_nvenc", "-g", "60", "-preset", "p4", "-tune", "ll",
                    "-b:v", plan.get("target_bitrate", "7M"), "-maxrate", plan.get("max_rate", "10M"),
                    "-bufsize", bufsize]
        else:
            cmd += ["-vf", vf, "-c:v", "libx264", "-g", "60", "-preset", "ultrafast",
                    "-tune", "zerolatency", "-crf", "23"]
    else:
        cmd += ["-c:v", "copy"]

    if plan.get("audio_needs_transcode", True):
        ac = ["-c:a", "libopus", "-b:a", "128k"] if container == "webm" else ["-c:a", "aac", "-b:a", "192k"]
        cmd += ac + ["-ac", "2", "-af", "aresample=async=1000"]
    else:
        cmd += ["-c:a", "copy"]

    common_end = ["-sn", "-avoid_negative_ts", "make_zero", "-max_muxing_queue_size", "2048"]
    if container == "webm":
        cmd += common_end + ["-f", "webm", "pipe:1"]
    else:
        cmd += common_end + ["-movflags", "frag_keyframe+empty_moov+default_base_moof",
                             "-frag_duration", "1000000", "-f", "mp4", "pipe:1"]
    return cmd
