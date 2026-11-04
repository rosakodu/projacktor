"""FFmpeg embedded subtitle track extraction for WebVTT."""

import time
import subprocess
import threading

from ..core.env import get_bin_path
from ..core.process import _clean_env
from ..media.subtitles import finalize_vtt


def extract_embedded_vtt(source: str, track_idx: str, start_sec: float, is_http: bool) -> tuple[bytes | None, bool]:
    """Extracts embedded subtitle track from media file into WebVTT via FFmpeg pipe."""
    sub_source = source + '&play' if (is_http and '&play' not in source and ('link=' in source or 'torrent' in source)) else source
    cmd = [get_bin_path("ffmpeg"), "-hide_banner", "-loglevel", "error"]
    if start_sec > 0:
        cmd += ["-ss", str(start_sec), "-copyts"]
    cmd += ["-vn", "-an"]
    if is_http:
        cmd += ["-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_delay_max", "2"]
    cmd += ["-i", sub_source, "-map", f"0:{track_idx}" if track_idx else "0:s:0?"]
    cmd += ["-c:s", "webvtt", "-flush_packets", "1", "-f", "webvtt", "pipe:1"]

    chunks, completed_full = [], False
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=_clean_env())

    def _reader():
        try:
            while True:
                c = proc.stdout.read1(4096) if hasattr(proc.stdout, 'read1') else proc.stdout.read(512)
                if not c:
                    break
                chunks.append(c)
        except Exception:
            pass

    th = threading.Thread(target=_reader, daemon=True)
    th.start()
    t0 = time.time()
    max_wait = 20.0 if is_http else 10.0
    while time.time() - t0 < max_wait:
        th.join(timeout=0.2)
        if not th.is_alive():
            completed_full = True
            break
        clen = sum(len(x) for x in chunks)
        if (time.time() - t0 > 2.0 and clen > 150 and b"".join(chunks).count(b"-->") >= 3) or (clen > 32768 and b"".join(chunks).count(b"-->") >= 30):
            break

    if proc.poll() is None:
        try:
            proc.kill()
            proc.wait(timeout=0.5)
        except Exception:
            pass

    raw_vtt = b"".join(chunks)
    if raw_vtt and b"-->" in raw_vtt:
        return finalize_vtt(raw_vtt), completed_full
    return (raw_vtt if (raw_vtt and b"WEBVTT" in raw_vtt[:30]) else None), completed_full
