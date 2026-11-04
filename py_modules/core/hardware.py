import os
import glob
import subprocess
from .env import get_bin_path
from .process import _clean_env

try:
    import decky
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("projacktor.hardware")

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
        logger.debug(f"[Hardware] Error checking external display: {e}")
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
        logger.debug(f"[Hardware] Error checking nvenc: {e}")
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
        res = subprocess.run(
            [ffmpeg_bin, "-hide_banner", "-hwaccels"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3,
            env=_clean_env()
        )
        if "vaapi" not in res.stdout:
            logger.info(f"[Hardware] FFmpeg at {ffmpeg_bin} lacks vaapi hwaccel, disabling VA-API")
            _VAAPI_SUPPORT_CACHE = False
            return False
    except Exception as e:
        logger.debug(f"[Hardware] Error checking vaapi hwaccel in ffmpeg: {e}")
        _VAAPI_SUPPORT_CACHE = False
        return False

    _VAAPI_SUPPORT_CACHE = True
    return True


def has_vaapi_av1_support() -> bool:
    """
    Checks if GPU driver and FFmpeg actually support hardware AV1 encoding via VA-API (av1_vaapi).
    Supported on modern AMD RDNA 3/4 (RX 7000/9000 series, Phoenix APUs) and Intel Arc / Core Ultra.
    """
    global _VAAPI_AV1_SUPPORT_CACHE
    if _VAAPI_AV1_SUPPORT_CACHE is not None:
        return _VAAPI_AV1_SUPPORT_CACHE

    if not has_vaapi_support():
        _VAAPI_AV1_SUPPORT_CACHE = False
        return False

    ffmpeg_bin = get_bin_path("ffmpeg")
    try:
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
            logger.info("[Hardware] Hardware AV1 encoding (av1_vaapi) is verified and supported on this GPU!")
    except Exception as e:
        logger.debug(f"[Hardware] Error checking av1_vaapi: {e}")
        _VAAPI_AV1_SUPPORT_CACHE = False

    return _VAAPI_AV1_SUPPORT_CACHE
