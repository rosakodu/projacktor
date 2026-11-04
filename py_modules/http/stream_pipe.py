"""FFmpeg streaming execution, process management and CPU fallback."""

import os
import time
import select
import subprocess
import threading
from collections import deque
from typing import Set

from ..constants import FFMPEG_STDERR_MAX_LINES
from ..core.env import logger
from ..core.process import _clean_env
from ..transcoder import build_ffmpeg_stream_command

ACTIVE_STREAM_LOCK = threading.Lock()
ACTIVE_STREAM_PROCS: Set[subprocess.Popen] = set()

def stop_all_active_streams():
    """Stops all active FFmpeg transcoding processes to free hardware contexts."""
    with ACTIVE_STREAM_LOCK:
        procs, ACTIVE_STREAM_PROCS_copy = list(ACTIVE_STREAM_PROCS), set(ACTIVE_STREAM_PROCS)
        ACTIVE_STREAM_PROCS.clear()
    for p in procs:
        try:
            if getattr(p, 'stdout', None):
                p.stdout.close()
            p.terminate()
            try:
                p.wait(timeout=0.5)
            except Exception:
                p.kill()
                p.wait(timeout=0.5)
        except Exception:
            pass

def _start_proc(cmd, env):
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, bufsize=1024 * 1024)
    with ACTIVE_STREAM_LOCK:
        ACTIVE_STREAM_PROCS.add(proc)
    stderr_lines = deque(maxlen=FFMPEG_STDERR_MAX_LINES)

    def _drain():
        try:
            for line in proc.stderr:
                txt = line.decode('utf-8', errors='replace').rstrip()
                if txt:
                    stderr_lines.append(txt)
                    logger.warning(f"[FFmpeg] {txt}")
        except Exception:
            pass
    th = threading.Thread(target=_drain, daemon=True)
    th.start()
    return proc, stderr_lines, th


def _wait_first_chunk(proc, timeout, chunk_size):
    start = time.time()
    while time.time() - start < timeout:
        if proc.poll() is not None:
            break
        if select.select([proc.stdout], [], [], 0.5)[0]:
            try:
                chunk = os.read(proc.stdout.fileno(), chunk_size)
                if chunk:
                    return chunk
            except Exception:
                pass
    return b""


def _cleanup_proc(proc, th, stderr_lines):
    with ACTIVE_STREAM_LOCK:
        ACTIVE_STREAM_PROCS.discard(proc)
    if proc:
        try:
            if getattr(proc, 'stdout', None):
                proc.stdout.close()
            proc.terminate()
            try:
                proc.wait(timeout=0.8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=0.5)
            if getattr(proc, 'stderr', None):
                proc.stderr.close()
        except Exception as e:
            logger.debug(f"[Stream] Reap error: {e}")
        th.join(timeout=1.0)
        if stderr_lines:
            logger.info(f"[Stream] FFmpeg stderr summary: {'; '.join(list(stderr_lines)[-3:])}")


def stream_ffmpeg(handler, source, plan, start_time, audio_idx, is_http, is_online, stream_container, content_type):
    """Executes FFmpeg transcoding pipe with hardware acceleration and automatic CPU fallback."""
    stop_all_active_streams()
    try:
        f_start = float(start_time)
    except Exception:
        f_start = 0.0

    env = _clean_env()
    cmd = build_ffmpeg_stream_command(source=source, plan=plan, start_time=f_start, audio_idx=audio_idx, is_http=is_http, is_online=is_online)
    logger.info(f"[Stream] FFmpeg cmd: {' '.join(cmd[:6])}... source={source[:80]}")
    proc, stderr_lines, th = _start_proc(cmd, env)
    chunk_size, chunk_timeout = 128 * 1024, (95.0 if is_online else 25.0)

    try:
        first_chunk = _wait_first_chunk(proc, chunk_timeout, chunk_size)
        if (proc.poll() is not None and proc.poll() != 0) and plan.get("hw_accel") != "none":
            logger.warning(f"[Stream] Hardware transcode failed (exit={proc.poll()}). Retrying with CPU fallback...")
            _cleanup_proc(proc, th, stderr_lines)
            fb_plan = dict(plan, hw_accel="none", use_vaapi=False, video_needs_transcode=True)
            if stream_container == "webm":
                fb_plan.update(vf_filter="scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p", target_bitrate="4M", min_rate="1M", max_rate="6M")
            else:
                fb_plan.update(vf_filter="scale=w='min(iw,1280)':h='min(ih,720)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p")
            fb_cmd = build_ffmpeg_stream_command(source=source, plan=fb_plan, start_time=f_start, audio_idx=audio_idx, is_http=is_http, is_online=is_online)
            proc, stderr_lines, th = _start_proc(fb_cmd, env)
            first_chunk = _wait_first_chunk(proc, chunk_timeout, chunk_size)

        if not first_chunk:
            logger.error(f"[Stream] FFmpeg produced no output in {int(chunk_timeout)}s (exit={proc.poll()})")
            handler.send_response(504)
            handler.send_cors_headers()
            handler.send_header('Content-Type', content_type)
            handler.end_headers()
            proc.kill()
            proc.wait(timeout=1)
            return

        handler.send_response(200)
        handler.send_cors_headers()
        handler.send_header('Content-Type', content_type)
        handler.send_header('Accept-Ranges', 'none')
        handler.send_header('Cache-Control', 'no-cache')
        handler.end_headers()
        handler.wfile.write(first_chunk)
        while True:
            data = proc.stdout.read(chunk_size)
            if not data:
                break
            handler.wfile.write(data)
    except Exception:
        pass
    finally:
        _cleanup_proc(proc, th, stderr_lines)
