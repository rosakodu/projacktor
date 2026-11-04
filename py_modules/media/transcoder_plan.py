"""
Transcoding plan resolution for Linux, SteamOS, and AMD VanGogh (Steam Deck).
"""

import sys
import logging
from ..core import hardware

logger = logging.getLogger("projacktor.media.transcoder_plan")


def _get_hardware():
    return sys.modules.get("py_modules.media.transcoder", hardware)


def _safe_int(val, default: int = 0) -> int:
    try:
        v = float(str(val).strip())
        return int(v) if v == v and abs(v) != float("inf") else default
    except (ValueError, TypeError, OverflowError):
        return default


def resolve_transcode_plan(
    media_info: dict, audio_idx: str = "", is_http: bool = False,
    transcode_mode: str = "auto", user_max_res: str = "auto"
) -> dict:
    if not isinstance(media_info, dict):
        media_info = {}
    vcodec = (media_info.get("vcodec") or "").lower()
    acodec = (media_info.get("acodec") or "").lower()
    width, height = max(0, _safe_int(media_info.get("width"))), max(0, _safe_int(media_info.get("height")))
    pix_fmt = (media_info.get("pix_fmt") or "").lower()
    color_transfer = (media_info.get("color_transfer") or "").lower()
    profile = (media_info.get("profile") or "").lower()

    is_10bit = (
        any(t in pix_fmt for t in ["10le", "10be", "p010", "yuv420p10", "yuv422p10", "yuv444p10"]) or
        any(t in color_transfer for t in ["smpte2084", "arib-std-b67"]) or
        "high 10" in profile or "10-bit" in profile
    )
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

    hw = _get_hardware()
    if hw.has_nvenc_support():
        hw_accel, container = "nvenc", "mp4"
    elif hw.has_vaapi_av1_support():
        hw_accel, container = "vaapi_av1", "webm"
    elif hw.has_vaapi_support():
        hw_accel, container = "vaapi", "webm"
    else:
        hw_accel, container = "none", "webm"

    use_vaapi = (hw_accel == "vaapi")
    is_docked = hw.is_external_display_connected()
    pref_res = (user_max_res or "auto").lower()
    is_std_420 = (pix_fmt in ["yuv420p", "yuvj420p"]) if pix_fmt else True

    if container == "webm":
        compat_v = (vcodec in ["vp9", "vp8"]) and (not is_10bit) and is_std_420
        compat_a = (target_acodec in ["opus", "vorbis"])
    else:
        compat_v = (vcodec in ["h264", "avc1"]) and (not is_10bit) and is_std_420
        compat_a = (target_acodec in ["aac", "mp3"])

    if transcode_mode == "1":
        need_v, need_a = True, True
    elif transcode_mode == "0":
        need_v, need_a = False, False
    else:
        need_v, need_a = not compat_v, not compat_a

    is_src_4k, is_src_1080p = (width >= 3800 or height >= 2000), (width >= 1800 or height >= 1000)
    target_br, min_r, max_r = ("4M" if container == "webm" else "15M"), ("1M" if container == "webm" else "0M"), ("6M" if container == "webm" else "22M")
    profile_name, vf_filter = "Direct Copy", ""

    if need_v:
        if pref_res in ("720p", "1080p"):
            target_res, mode_name = pref_res, pref_res
        elif pref_res == "4k":
            target_res, mode_name = "4k", "4K Force"
        elif is_src_4k:
            target_res, mode_name = ("4k", "4K Native External") if is_docked else ("1080p", "4K -> 1080p Adaptive Handheld")
        elif is_src_1080p:
            target_res, mode_name = "1080p", "1080p Native"
        else:
            target_res, mode_name = "720p", "720p Native"

        if container == "webm":
            accel_tag = "VA-API AV1 HW" if hw_accel == "vaapi_av1" else ("VA-API Dec + VP9" if hw_accel == "vaapi" else "CPU VP9")
            target_br, min_r, max_r = {"720p": ("4M", "1M", "6M"), "1080p": ("7M", "2M", "10M"), "4k": ("14M", "4M", "20M")}[target_res]
            if hw_accel == "vaapi_av1":
                vf_filter = {
                    "720p": "scale_vaapi=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12",
                    "1080p": "scale_vaapi=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2:format=nv12",
                    "4k": "scale_vaapi=w='trunc(iw/2)*2':h='trunc(ih/2)*2':format=nv12"
                }[target_res]
            else:
                vf_filter = {
                    "720p": "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
                    "1080p": "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
                    "4k": "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2',format=yuv420p"
                }[target_res]
        else:
            accel_tag = "NVIDIA NVENC"
            rates_map = {
                "720p": ("7M", "1M", "10M"),
                "1080p": ("14M", "2M", "20M") if ("Adaptive" in mode_name or "Native" in mode_name) else ("15M", "2M", "22M"),
                "4k": ("28M", "4M", "40M")
            }
            target_br, min_r, max_r = rates_map[target_res]
            vf_filter = {
                "720p": "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
                "1080p": "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
                "4k": "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2',format=yuv420p"
            }[target_res]
        profile_name = f"{mode_name} ({accel_tag})"

    if need_v and not vf_filter:
        vf_filter = "scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"

    return {
        "video_needs_transcode": need_v, "audio_needs_transcode": need_a, "hw_accel": hw_accel,
        "use_vaapi": use_vaapi, "container": container, "is_docked": is_docked, "is_10bit": is_10bit,
        "profile_name": profile_name, "vf_filter": vf_filter, "target_bitrate": target_br,
        "min_rate": min_r, "max_rate": max_r, "vcodec": vcodec, "acodec": target_acodec
    }
