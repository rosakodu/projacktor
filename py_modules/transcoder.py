import os
import glob
import logging
from .common import get_bin_path

logger = logging.getLogger("projacktor.transcoder")

_GPU_VENDOR_CACHE = None
_NVENC_SUPPORT_CACHE = None
_VAAPI_SUPPORT_CACHE = None
_VAAPI_AV1_SUPPORT_CACHE = None

def is_external_display_connected() -> bool:
    """
    Checks Linux DRM sysfs connectors.
    Returns True if an external display (HDMI, DisplayPort via dock/USB-C) is connected.
    Ignores the built-in Steam Deck screen (eDP-1).
    """
    try:
        status_files = glob.glob("/sys/class/drm/card*-*/status")
        for sf in status_files:
            # Skip built-in laptop / handheld eDP panel
            if "eDP" in sf:
                continue
            try:
                with open(sf, "r", encoding="utf-8") as f:
                    if f.read().strip() == "connected":
                        return True
            except Exception:
                pass
    except Exception as e:
        logger.debug(f"[Transcoder] Error checking external display: {e}")
    return False

def detect_gpu_vendor() -> str:
    """
    Detects GPU vendor on Linux.
    Returns: 'nvidia', 'amd', 'intel', or 'unknown'.
    """
    global _GPU_VENDOR_CACHE
    if _GPU_VENDOR_CACHE is not None:
        return _GPU_VENDOR_CACHE

    # 1. Check NVIDIA driver files / devices
    if os.path.exists("/proc/driver/nvidia/version") or os.path.exists("/dev/nvidiactl") or os.path.exists("/dev/nvidia0"):
        _GPU_VENDOR_CACHE = "nvidia"
        return _GPU_VENDOR_CACHE

    # 2. Check PCI device vendors in sysfs
    try:
        for vf in glob.glob("/sys/bus/pci/devices/*/vendor"):
            try:
                with open(vf, "r", encoding="utf-8") as f:
                    v = f.read().strip().lower()
                    if v == "0x10de":
                        _GPU_VENDOR_CACHE = "nvidia"
                        return _GPU_VENDOR_CACHE
                    elif v == "0x1002":
                        _GPU_VENDOR_CACHE = "amd"
                        return _GPU_VENDOR_CACHE
                    elif v == "0x8086":
                        _GPU_VENDOR_CACHE = "intel"
                        return _GPU_VENDOR_CACHE
            except Exception:
                pass
    except Exception:
        pass

    _GPU_VENDOR_CACHE = "unknown"
    return _GPU_VENDOR_CACHE

def has_nvenc_support() -> bool:
    """
    Checks if NVIDIA GPU and h264_nvenc encoder are available in FFmpeg.
    """
    global _NVENC_SUPPORT_CACHE
    if _NVENC_SUPPORT_CACHE is not None:
        return _NVENC_SUPPORT_CACHE

    vendor = detect_gpu_vendor()
    if vendor != "nvidia":
        _NVENC_SUPPORT_CACHE = False
        return False

    ffmpeg_bin = get_bin_path("ffmpeg")
    try:
        from .common import _clean_env
        import subprocess
        res = subprocess.run(
            [ffmpeg_bin, "-hide_banner", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3,
            env=_clean_env()
        )
        _NVENC_SUPPORT_CACHE = "h264_nvenc" in res.stdout
    except Exception as e:
        logger.debug(f"[Transcoder] Error checking nvenc: {e}")
        _NVENC_SUPPORT_CACHE = False

    return _NVENC_SUPPORT_CACHE

def has_vaapi_support() -> bool:
    """
    Checks if AMD / Intel VA-API DRM render node is present and accessible,
    and verifies that FFmpeg actually has VA-API hardware acceleration support.
    If GPU is NVIDIA, VA-API is only used if NVENC is not supported.
    """
    global _VAAPI_SUPPORT_CACHE
    if _VAAPI_SUPPORT_CACHE is not None:
        return _VAAPI_SUPPORT_CACHE

    dev_path = "/dev/dri/renderD128"
    if not (os.path.exists(dev_path) and os.access(dev_path, os.R_OK | os.W_OK)):
        _VAAPI_SUPPORT_CACHE = False
        return False

    vendor = detect_gpu_vendor()
    if vendor == "nvidia" and has_nvenc_support():
        _VAAPI_SUPPORT_CACHE = False
        return False

    ffmpeg_bin = get_bin_path("ffmpeg")
    try:
        from .common import _clean_env
        import subprocess
        res = subprocess.run(
            [ffmpeg_bin, "-hide_banner", "-hwaccels"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3,
            env=_clean_env()
        )
        if "vaapi" not in res.stdout:
            logger.info(f"[Transcoder] FFmpeg at {ffmpeg_bin} lacks vaapi hwaccel, disabling VA-API")
            _VAAPI_SUPPORT_CACHE = False
            return False
    except Exception as e:
        logger.debug(f"[Transcoder] Error checking vaapi hwaccel in ffmpeg: {e}")
        _VAAPI_SUPPORT_CACHE = False
        return False

    _VAAPI_SUPPORT_CACHE = True
    return True

def has_vaapi_av1_support() -> bool:
    """
    Checks if GPU driver and FFmpeg actually support hardware AV1 encoding via VA-API (av1_vaapi).
    Supported on modern AMD RDNA 3/4 (RX 7000/9000 series, Phoenix APUs) and Intel Arc / Core Ultra.
    Provides ~0% CPU usage and silent fans for WebM streaming on modern GPUs.
    """
    global _VAAPI_AV1_SUPPORT_CACHE
    if _VAAPI_AV1_SUPPORT_CACHE is not None:
        return _VAAPI_AV1_SUPPORT_CACHE

    if not has_vaapi_support():
        _VAAPI_AV1_SUPPORT_CACHE = False
        return False

    ffmpeg_bin = get_bin_path("ffmpeg")
    try:
        from .common import _clean_env
        import subprocess
        probe = subprocess.run(
            [
                ffmpeg_bin, "-hide_banner", "-loglevel", "error",
                "-init_hw_device", "vaapi=va:/dev/dri/renderD128",
                "-filter_hw_device", "va",
                "-f", "lavfi", "-i", "nullsrc=s=128x128:d=0.04",
                "-vf", "format=nv12,hwupload",
                "-c:v", "av1_vaapi",
                "-f", "null", "-"
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=3,
            env=_clean_env()
        )
        _VAAPI_AV1_SUPPORT_CACHE = (probe.returncode == 0)
        if _VAAPI_AV1_SUPPORT_CACHE:
            logger.info("[Transcoder] Hardware AV1 encoding (av1_vaapi) is verified and supported on this GPU!")
    except Exception as e:
        logger.debug(f"[Transcoder] Error checking av1_vaapi: {e}")
        _VAAPI_AV1_SUPPORT_CACHE = False

    return _VAAPI_AV1_SUPPORT_CACHE


def resolve_transcode_plan(
    media_info: dict,
    audio_idx: str = "",
    is_http: bool = False,
    transcode_mode: str = "auto",
    user_max_res: str = "auto"
) -> dict:
    """
    Intelligently determines video/audio transcoding requirements and optimal parameters:
    1. For Linux / SteamOS / Bazzite (VA-API / CPU): uses open WebM (VP9 + Opus).
    2. Passthrough (-c:v copy) only for native WebM streams (VP9/VP8 + Opus/Vorbis).
    3. Realtime VP9 transcoding (libvpx-vp9) with VA-API hardware decoding for non-WebM sources.
    4. Auto-adapts 4K streams based on handheld Steam Deck screen (800p) vs external 4K TV.
    5. Graceful CPU software fallback (realtime libvpx-vp9) if hardware decoding is not present.
    """
    vcodec = (media_info.get("vcodec") or "").lower()
    acodec = (media_info.get("acodec") or "").lower()
    width = int(media_info.get("width", 0) or 0)
    height = int(media_info.get("height", 0) or 0)
    pix_fmt = (media_info.get("pix_fmt") or "").lower()
    color_transfer = (media_info.get("color_transfer") or "").lower()
    profile = (media_info.get("profile") or "").lower()

    # Detect 10-bit HDR content
    is_10bit = (
        any(tag in pix_fmt for tag in ["10le", "10be", "p010", "yuv420p10", "yuv422p10", "yuv444p10"]) or
        any(tag in color_transfer for tag in ["smpte2084", "arib-std-b67"]) or
        "high 10" in profile or
        "10-bit" in profile
    )

    # Determine target audio codec
    target_acodec = acodec
    if audio_idx:
        try:
            a_id = int(audio_idx)
            for trk in media_info.get("audio_tracks", []):
                if trk.get("index") == a_id:
                    target_acodec = (trk.get("codec") or "").lower()
                    break
        except Exception:
            pass

    # Hardware acceleration detection & target container
    if has_nvenc_support():
        hw_accel = "nvenc"
        container = "mp4"
    elif has_vaapi_av1_support():
        hw_accel = "vaapi_av1"
        container = "webm"
    elif has_vaapi_support():
        hw_accel = "vaapi"
        container = "webm"
    else:
        hw_accel = "none"
        container = "webm"

    use_vaapi = (hw_accel == "vaapi")
    is_docked = is_external_display_connected()
    pref_res = (user_max_res or "auto").lower()

    is_standard_420 = (pix_fmt in ["yuv420p", "yuvj420p"]) if pix_fmt else True

    # Valve's CEF build in SteamOS and Bazzite lacks proprietary H.264/AAC licenses.
    # WebM (VP8/VP9 + Opus/Vorbis) is natively supported by Chromium on all Linux distros.
    if container == "webm":
        video_is_compatible = (vcodec in ["vp9", "vp8"]) and (not is_10bit) and is_standard_420
        audio_is_compatible = (target_acodec in ["opus", "vorbis"])
    else:
        video_is_compatible = (vcodec in ["h264", "avc1"]) and (not is_10bit) and is_standard_420
        audio_is_compatible = (target_acodec in ["aac", "mp3"])

    if transcode_mode == "1":
        video_needs_transcode = True
        audio_needs_transcode = True
    elif transcode_mode == "0":
        video_needs_transcode = False
        audio_needs_transcode = False
    else:
        video_needs_transcode = not video_is_compatible
        audio_needs_transcode = not audio_is_compatible

    # Video profile selection
    is_source_4k = (width >= 3800 or height >= 2000)
    is_source_1080p = (width >= 1800 or height >= 1000)

    target_bitrate = "4M" if container == "webm" else "15M"
    min_rate = "1M" if container == "webm" else "0M"
    max_rate = "6M" if container == "webm" else "22M"
    profile_name = "Direct Copy"
    vf_filter = ""

    if video_needs_transcode:
        if container == "webm":
            is_av1_hw = (hw_accel == "vaapi_av1")
            accel_tag = "VA-API AV1 HW" if is_av1_hw else ("VA-API Dec + VP9" if hw_accel == "vaapi" else "CPU VP9")
            if pref_res == "720p":
                vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12" if is_av1_hw else "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                target_bitrate = "4M"
                min_rate = "1M"
                max_rate = "6M"
                profile_name = f"720p ({accel_tag})"
            elif pref_res == "1080p":
                vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12" if is_av1_hw else "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                target_bitrate = "7M"
                min_rate = "2M"
                max_rate = "10M"
                profile_name = f"1080p ({accel_tag})"
            elif pref_res == "4k":
                vf_filter = "scale_vaapi=w='trunc(iw/2)*2':h='trunc(ih/2)*2':format=nv12" if is_av1_hw else "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2'"
                target_bitrate = "14M"
                min_rate = "4M"
                max_rate = "20M"
                profile_name = f"4K Force ({accel_tag})"
            else:
                # AUTO mode
                if is_source_4k:
                    if is_docked:
                        vf_filter = "scale_vaapi=w='trunc(iw/2)*2':h='trunc(ih/2)*2':format=nv12" if is_av1_hw else "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2'"
                        target_bitrate = "14M"
                        min_rate = "4M"
                        max_rate = "20M"
                        profile_name = f"4K Native External ({accel_tag})"
                    else:
                        vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12" if is_av1_hw else "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                        target_bitrate = "7M"
                        min_rate = "2M"
                        max_rate = "10M"
                        profile_name = f"4K -> 1080p Adaptive Handheld ({accel_tag})"
                elif is_source_1080p:
                    vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12" if is_av1_hw else "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                    target_bitrate = "7M"
                    min_rate = "2M"
                    max_rate = "10M"
                    profile_name = f"1080p Native ({accel_tag})"
                else:
                    vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12" if is_av1_hw else "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2"
                    target_bitrate = "4M"
                    min_rate = "1M"
                    max_rate = "6M"
                    profile_name = f"720p Native ({accel_tag})"
        else:
            accel_tag = "NVIDIA NVENC"
            if pref_res == "720p":
                vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
                target_bitrate = "7M"
                min_rate = "1M"
                max_rate = "10M"
                profile_name = f"720p ({accel_tag})"
            elif pref_res == "1080p":
                vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
                target_bitrate = "15M"
                min_rate = "2M"
                max_rate = "22M"
                profile_name = f"1080p ({accel_tag})"
            elif pref_res == "4k":
                vf_filter = "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2',format=yuv420p"
                target_bitrate = "28M"
                min_rate = "4M"
                max_rate = "40M"
                profile_name = f"4K Force ({accel_tag})"
            else:
                if is_source_4k:
                    if is_docked:
                        vf_filter = "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2',format=yuv420p"
                        target_bitrate = "28M"
                        min_rate = "4M"
                        max_rate = "40M"
                        profile_name = f"4K Native External ({accel_tag})"
                    else:
                        vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
                        target_bitrate = "14M"
                        min_rate = "2M"
                        max_rate = "20M"
                        profile_name = f"4K -> 1080p Adaptive Handheld ({accel_tag})"
                elif is_source_1080p:
                    vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
                    target_bitrate = "14M"
                    min_rate = "2M"
                    max_rate = "20M"
                    profile_name = f"1080p Native ({accel_tag})"
                else:
                    vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
                    target_bitrate = "7M"
                    min_rate = "1M"
                    max_rate = "10M"
                    profile_name = f"720p Native ({accel_tag})"

    if video_needs_transcode and not vf_filter:
        vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2"

    return {
        "video_needs_transcode": video_needs_transcode,
        "audio_needs_transcode": audio_needs_transcode,
        "hw_accel": hw_accel,
        "use_vaapi": use_vaapi,
        "container": container,
        "is_docked": is_docked,
        "is_10bit": is_10bit,
        "profile_name": profile_name,
        "vf_filter": vf_filter,
        "target_bitrate": target_bitrate,
        "min_rate": min_rate,
        "max_rate": max_rate,
        "vcodec": vcodec,
        "acodec": target_acodec
    }


def build_ffmpeg_stream_command(
    source: str,
    plan: dict,
    start_time: float = 0.0,
    audio_idx: str = "",
    is_http: bool = False,
    is_online: bool = False
) -> list:
    """Builds an optimized FFmpeg process argument list according to the resolved transcode plan."""
    ffmpeg_bin = get_bin_path("ffmpeg")
    cmd = [ffmpeg_bin, "-hide_banner", "-loglevel", "error"]

    hw_accel = plan.get("hw_accel", "none")
    container = plan.get("container", "webm")

    if hw_accel in ("vaapi", "vaapi_av1"):
        cmd += [
            "-init_hw_device", "vaapi=va:/dev/dri/renderD128",
            "-filter_hw_device", "va",
            "-hwaccel", "vaapi",
            "-hwaccel_device", "va"
        ]
        # For hardware encoding (av1_vaapi), keep frames on GPU in VA-API surface.
        # For software libvpx-vp9 (Steam Deck), omit -hwaccel_output_format vaapi so GPU decodes directly to RAM.
        if hw_accel == "vaapi_av1":
            cmd += ["-hwaccel_output_format", "vaapi"]

    has_start_offset = start_time > 0
    if has_start_offset:
        if not plan.get("video_needs_transcode", True):
            cmd += ["-noaccurate_seek"]
        cmd += ["-ss", str(start_time)]

    if is_http:
        cmd += [
            "-reconnect", "1",
            "-reconnect_at_eof", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "2"
        ]
    if is_online and not is_http:
        cmd += ["-follow", "1"]

    cmd += ["-i", source]

    # Map video and audio: use 0:V:0? so embedded cover art / thumbnails are not selected as video
    if audio_idx:
        cmd += ["-map", "0:V:0?", "-map", f"0:{audio_idx}?"]
    else:
        cmd += ["-map", "0:V:0?", "-map", "0:a:0?"]

    if plan.get("video_needs_transcode", True):
        buf_mb = int(plan["max_rate"].rstrip("M")) * 2
        if hw_accel == "vaapi_av1":
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "av1_vaapi",
                "-g", "60",
                "-b:v", plan["target_bitrate"],
                "-maxrate", plan["max_rate"],
                "-bufsize", f"{buf_mb}M"
            ]
        elif container == "webm":
            cpu_threads = str(min(4, os.cpu_count() or 4))
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "libvpx-vp9",
                "-deadline", "realtime",
                "-cpu-used", "8",
                "-row-mt", "1",
                "-threads", cpu_threads,
                "-g", "60",
                "-lag-in-frames", "0",
                "-error-resilient", "1",
                "-auto-alt-ref", "0",
                "-b:v", plan["target_bitrate"],
                "-minrate", plan.get("min_rate", "1M"),
                "-maxrate", plan["max_rate"],
                "-bufsize", f"{buf_mb}M"
            ]
        elif hw_accel == "nvenc":
            buf_mb = int(plan["max_rate"].rstrip("M")) * 2
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "h264_nvenc",
                "-g", "60",
                "-preset", "p4",
                "-tune", "ll",
                "-b:v", plan["target_bitrate"],
                "-maxrate", plan["max_rate"],
                "-bufsize", f"{buf_mb}M"
            ]
        else:
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "libx264",
                "-g", "60",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                "-crf", "23"
            ]
    else:
        cmd += ["-c:v", "copy"]

    if plan.get("audio_needs_transcode", True):
        if container == "webm":
            cmd += ["-c:a", "libopus", "-b:a", "128k", "-ac", "2", "-af", "aresample=async=1000"]
        else:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-ac", "2", "-af", "aresample=async=1000"]
    else:
        cmd += ["-c:a", "copy"]

    if container == "webm":
        cmd += [
            "-sn",
            "-avoid_negative_ts", "make_zero",
            "-max_muxing_queue_size", "2048",
            "-f", "webm",
            "pipe:1"
        ]
    else:
        cmd += [
            "-sn",
            "-avoid_negative_ts", "make_zero",
            "-max_muxing_queue_size", "2048",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-frag_duration", "1000000",
            "-f", "mp4",
            "pipe:1"
        ]

    return cmd
