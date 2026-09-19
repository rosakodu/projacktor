import os
import glob
import logging
from .common import get_bin_path

logger = logging.getLogger("projacktor.transcoder")

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

def has_vaapi_support() -> bool:
    """Checks if AMD / Intel VA-API DRM render node is present and accessible."""
    dev_path = "/dev/dri/renderD128"
    return os.path.exists(dev_path) and os.access(dev_path, os.R_OK | os.W_OK)

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
    2. Smart VA-API hardware transcoding for HEVC/H.265.
    3. Auto-adapts 4K streams based on handheld Steam Deck screen (800p) vs external 4K TV.
    4. Never upscales 720p/1080p sources to higher resolutions.
    """
    vcodec = (media_info.get("vcodec") or "").lower()
    acodec = (media_info.get("acodec") or "").lower()
    width = int(media_info.get("width", 0) or 0)
    height = int(media_info.get("height", 0) or 0)

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

    audio_needs_transcode = target_acodec not in ["aac", "mp3"]
    # H.264/AVC1, VP8, VP9 can be direct copied into fragmented MP4
    video_is_compatible = vcodec in ["h264", "avc1", "vp8", "vp9"]
    
    if transcode_mode == "1":
        video_needs_transcode = True
    elif transcode_mode == "0":
        video_needs_transcode = False
    else:
        # For auto: only transcode video if codec is not directly supported in CEF HTML5 video (e.g. HEVC/H.265)
        video_needs_transcode = not video_is_compatible

    use_vaapi = video_needs_transcode and has_vaapi_support()
    is_docked = is_external_display_connected()
    pref_res = (user_max_res or "auto").lower()

    # Video profile selection
    is_source_4k = (width >= 3800 or height >= 2000)
    is_source_1080p = (width >= 1800 or height >= 1000)

    vf_filter = "scale_vaapi=format=nv12"
    target_bitrate = "15M"
    max_rate = "22M"
    profile_name = "Direct Copy"

    if video_needs_transcode:
        if pref_res == "720p":
            vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:format=nv12"
            target_bitrate = "7M"
            max_rate = "10M"
            profile_name = "720p (Energy saving)"
        elif pref_res == "1080p":
            vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
            target_bitrate = "15M"
            max_rate = "22M"
            profile_name = "1080p (Full HD)"
        elif pref_res == "4k":
            vf_filter = "scale_vaapi=format=nv12"
            target_bitrate = "28M"
            max_rate = "40M"
            profile_name = "4K Force"
        else:
            # AUTO mode: intelligent detection based on source dimensions and display
            if is_source_4k:
                if is_docked:
                    # Output native 4K to external 4K TV / Monitor
                    vf_filter = "scale_vaapi=format=nv12"
                    target_bitrate = "28M"
                    max_rate = "40M"
                    profile_name = "4K Native (External Display)"
                else:
                    # Handheld Steam Deck (800p display):
                    # Smart downscale 4K to 1080p for super-sampling sharpness, zero stutter and battery savings
                    vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
                    target_bitrate = "14M"
                    max_rate = "20M"
                    profile_name = "4K -> 1080p Adaptive (Steam Deck Handheld)"
            elif is_source_1080p:
                vf_filter = "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:format=nv12"
                target_bitrate = "14M"
                max_rate = "20M"
                profile_name = "1080p Native (No upscale)"
            else:
                vf_filter = "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:format=nv12"
                target_bitrate = "7M"
                max_rate = "10M"
                profile_name = "720p Native (No upscale)"

    return {
        "video_needs_transcode": video_needs_transcode,
        "audio_needs_transcode": audio_needs_transcode,
        "use_vaapi": use_vaapi,
        "is_docked": is_docked,
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

    if plan["use_vaapi"]:
        cmd += [
            "-hwaccel", "vaapi",
            "-hwaccel_device", "/dev/dri/renderD128",
            "-hwaccel_output_format", "vaapi"
        ]

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

    if audio_idx:
        cmd += ["-map", "0:v:0", "-map", f"0:{audio_idx}?"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0?"]

    if plan["video_needs_transcode"]:
        if plan["use_vaapi"]:
            buf_mb = int(plan["max_rate"].rstrip("M")) * 2
            cmd += [
                "-vf", plan["vf_filter"],
                "-c:v", "h264_vaapi",
                "-b:v", plan["target_bitrate"],
                "-maxrate", plan["max_rate"],
                "-bufsize", f"{buf_mb}M"
            ]
        else:
            # Software fallback if VA-API device is not accessible
            cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "23"]
    else:
        cmd += ["-c:v", "copy"]

    if plan["audio_needs_transcode"]:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ac", "2", "-af", "aresample=async=1:first_pts=0"]
    else:
        cmd += ["-c:a", "copy"]

    cmd += [
        "-sn",
        "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "2048",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4",
        "pipe:1"
    ]

    return cmd
