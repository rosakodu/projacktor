import os
import glob
import logging
from .common import get_bin_path

logger = logging.getLogger("projacktor.transcoder")

_GPU_VENDOR_CACHE = None
_NVENC_SUPPORT_CACHE = None
_VAAPI_SUPPORT_CACHE = None

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
    Checks if AMD / Intel VA-API DRM render node is present and accessible.
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

    _VAAPI_SUPPORT_CACHE = True
    return True

def resolve_transcode_plan(
    media_info: dict,
    audio_idx: str = "",
    is_http: bool = False,
    transcode_mode: str = "auto",
    user_max_res: str = "auto"
) -> dict:
    """
    Intelligently determines video/audio transcoding requirements and optimal parameters:
    1. Passthrough (-c:v copy) for native H.264 video streams.
    2. Smart hardware transcoding for HEVC/H.265 (VA-API on AMD/Intel, NVENC on NVIDIA).
    3. Auto-adapts 4K streams based on handheld Steam Deck screen (800p) vs external 4K TV.
    4. Never upscales 720p/1080p sources to higher resolutions.
    5. Graceful CPU software fallback (libx264) if no hardware encoder is present.
    """
    vcodec = (media_info.get("vcodec") or "").lower()
    acodec = (media_info.get("acodec") or "").lower()
    width = int(media_info.get("width", 0) or 0)
    height = int(media_info.get("height", 0) or 0)
    pix_fmt = (media_info.get("pix_fmt") or "").lower()
    color_transfer = (media_info.get("color_transfer") or "").lower()

    # Detect 10-bit HDR content that causes VA-API scale_vaapi format conversion failures.
    # AMD GPUs on Steam Deck cannot do P010→NV12 conversion inside scale_vaapi
    # when Dolby Vision / HDR10 metadata is present.
    is_10bit = any(tag in pix_fmt for tag in ["10le", "10be", "p010", "yuv420p10"]) or any(tag in color_transfer for tag in ["smpte2084", "arib-std-b67"])

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

    # Chromium HTML5 <video> in SteamOS Gamepad UI only natively supports AAC and MP3 in MP4 containers.
    # Proprietary codecs (AC3, EAC3, DTS, TrueHD, FLAC, Vorbis) or unknown/empty codecs
    # must be transcoded to AAC stereo to avoid silent video playback.
    audio_needs_transcode = (target_acodec not in ["aac", "mp3"]) or (not target_acodec) or (target_acodec == "unknown")
    # 8-bit H.264/AVC1, VP8, VP9 can be direct copied into fragmented MP4.
    # 10-bit H.264 (Hi10P) is NOT supported by Chromium HTML5 <video> and must be transcoded.
    video_is_compatible = (vcodec in ["h264", "avc1", "vp8", "vp9"]) and (not is_10bit)
    
    if transcode_mode == "1":
        video_needs_transcode = True
    elif transcode_mode == "0":
        video_needs_transcode = False
    else:
        # For auto: only transcode video if codec is not directly supported in CEF HTML5 video (e.g. HEVC/H.265)
        video_needs_transcode = not video_is_compatible

    # Determine hardware acceleration method
    hw_accel = "none"
    # Hardware decoding via VA-API / NVENC on modern GPUs only supports modern video codecs.
    # Legacy codecs (MPEG-4 / XviD / DivX, MPEG-2, VC-1, WMV) lack hardware decoding support
    # and must use CPU software transcoding (libx264) to avoid FFmpeg initialization crash.
    HW_SUPPORTED_VCODECS = {"hevc", "h265", "h264", "avc1", "vp9", "av1"}
    can_hw_accel = vcodec in HW_SUPPORTED_VCODECS

    if video_needs_transcode and can_hw_accel:
        if has_nvenc_support():
            hw_accel = "nvenc"
        elif has_vaapi_support():
            hw_accel = "vaapi"
        else:
            hw_accel = "none"

    use_vaapi = (hw_accel == "vaapi")
    is_docked = is_external_display_connected()
    pref_res = (user_max_res or "auto").lower()

    # Video profile selection
    is_source_4k = (width >= 3800 or height >= 2000)
    is_source_1080p = (width >= 1800 or height >= 1000)

    target_bitrate = "15M"
    max_rate = "22M"
    profile_name = "Direct Copy"
    vf_filter = ""

    if video_needs_transcode:
        accel_tag = "VA-API" if hw_accel == "vaapi" else ("NVIDIA NVENC" if hw_accel == "nvenc" else "CPU Software")
        
        # For 10-bit HDR content (Dolby Vision, HDR10, etc.) with VA-API:
        # AMD GPU on Steam Deck cannot convert P010→NV12 inside scale_vaapi filter.
        # Use software decode → software scale → hwupload → h264_vaapi encoder instead.
        vaapi_10bit = (hw_accel == "vaapi" and is_10bit)
        if vaapi_10bit:
            accel_tag = "VA-API 10bit"
        
        if pref_res == "720p":
            if hw_accel == "vaapi":
                if vaapi_10bit:
                    vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease,format=nv12,hwupload"
                else:
                    vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:format=nv12"
            else:
                vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease,format=yuv420p"
            target_bitrate = "7M"
            max_rate = "10M"
            profile_name = f"720p ({accel_tag})"
        elif pref_res == "1080p":
            if hw_accel == "vaapi":
                if vaapi_10bit:
                    vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=nv12,hwupload"
                else:
                    vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
            else:
                vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=yuv420p"
            target_bitrate = "15M"
            max_rate = "22M"
            profile_name = f"1080p ({accel_tag})"
        elif pref_res == "4k":
            if hw_accel == "vaapi":
                if vaapi_10bit:
                    vf_filter = "format=nv12,hwupload"
                else:
                    vf_filter = "scale_vaapi=format=nv12"
            else:
                vf_filter = "format=yuv420p"
            target_bitrate = "28M"
            max_rate = "40M"
            profile_name = f"4K Force ({accel_tag})"
        else:
            # AUTO mode: intelligent detection based on source dimensions and display
            if is_source_4k:
                if is_docked:
                    # Output native 4K to external 4K TV / Monitor
                    if hw_accel == "vaapi":
                        if vaapi_10bit:
                            vf_filter = "format=nv12,hwupload"
                        else:
                            vf_filter = "scale_vaapi=format=nv12"
                    else:
                        vf_filter = "format=yuv420p"
                    target_bitrate = "28M"
                    max_rate = "40M"
                    profile_name = f"4K Native External ({accel_tag})"
                else:
                    # Handheld Steam Deck (800p display):
                    # Smart downscale 4K to 1080p for super-sampling sharpness, zero stutter and battery savings
                    if hw_accel == "vaapi":
                        if vaapi_10bit:
                            vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=nv12,hwupload"
                        else:
                            vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
                    else:
                        vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=yuv420p"
                    target_bitrate = "14M"
                    max_rate = "20M"
                    profile_name = f"4K -> 1080p Adaptive Handheld ({accel_tag})"
            elif is_source_1080p:
                if hw_accel == "vaapi":
                    if vaapi_10bit:
                        vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=nv12,hwupload"
                    else:
                        vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
                else:
                    vf_filter = "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease,format=yuv420p"
                target_bitrate = "14M"
                max_rate = "20M"
                profile_name = f"1080p Native ({accel_tag})"
            else:
                if hw_accel == "vaapi":
                    if vaapi_10bit:
                        vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease,format=nv12,hwupload"
                    else:
                        vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:format=nv12"
                else:
                    vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease,format=yuv420p"
                target_bitrate = "7M"
                max_rate = "10M"
                profile_name = f"720p Native ({accel_tag})"

    return {
        "video_needs_transcode": video_needs_transcode,
        "audio_needs_transcode": audio_needs_transcode,
        "hw_accel": hw_accel,
        "use_vaapi": use_vaapi,
        "is_docked": is_docked,
        "is_10bit": is_10bit,
        "profile_name": profile_name,
        "vf_filter": vf_filter,
        "target_bitrate": target_bitrate,
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
    is_10bit = plan.get("is_10bit", False)
    if hw_accel == "vaapi":
        cmd += [
            "-init_hw_device", "vaapi=va:/dev/dri/renderD128",
            "-filter_hw_device", "va",
            "-hwaccel", "vaapi",
            "-hwaccel_device", "va"
        ]
        # For 10-bit HDR content (Dolby Vision, HDR10), skip -hwaccel_output_format vaapi
        # so frames are decoded to system memory where software scale+format can process them.
        # The hwupload filter in the vf chain will re-upload to GPU for h264_vaapi encoding.
        if not is_10bit:
            cmd += ["-hwaccel_output_format", "vaapi"]

    has_start_offset = start_time > 0
    if has_start_offset:
        if not plan["video_needs_transcode"]:
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

    if plan["video_needs_transcode"]:
        buf_mb = int(plan["max_rate"].rstrip("M")) * 2
        if hw_accel == "vaapi":
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "h264_vaapi",
                "-g", "60",
                "-b:v", plan["target_bitrate"],
                "-maxrate", plan["max_rate"],
                "-bufsize", f"{buf_mb}M"
            ]
        elif hw_accel == "nvenc":
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
            # Software fallback if hardware acceleration is not available
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

    if plan["audio_needs_transcode"]:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ac", "2", "-af", "aresample=async=1000"]
    else:
        cmd += ["-c:a", "copy"]

    cmd += [
        "-sn",
        "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "2048",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof+delay_moov",
        "-frag_duration", "1000000",
        "-f", "mp4",
        "pipe:1"
    ]

    return cmd
