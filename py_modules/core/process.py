import os
import signal
import subprocess
import time
from typing import Optional

try:
    import decky
    logger = decky.logger
except ImportError:
    import logging
    logger = logging.getLogger("projacktor.process")


def _clean_env() -> dict:
    """Returns a clean copy of os.environ without container/Decky override variables."""
    env = os.environ.copy()
    for key in (
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "APPDIR",
        "APPIMAGE",
        "GST_PLUGIN_PATH",
        "GST_PLUGIN_SYSTEM_PATH",
        "PYTHONHOME",
        "PYTHONPATH"
    ):
        env.pop(key, None)
    return env


def _build_gui_env() -> dict:
    """Constructs environment for launching GUI media player processes."""
    env = _clean_env()
    env["DISPLAY"] = ":0"
    env["XDG_RUNTIME_DIR"] = "/run/user/1000"
    return env


def write_pid_file(pid_file: str, pid: int) -> None:
    """Safely saves process PID to a pidfile."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(pid_file)), exist_ok=True)
        with open(pid_file, "w", encoding="utf-8") as f:
            f.write(str(pid))
    except Exception as e:
        logger.warning(f"Failed to write pid file {pid_file}: {e}")


def read_pid_file(pid_file: str) -> Optional[int]:
    """Reads PID from a pidfile if present and valid."""
    if not pid_file or not os.path.isfile(pid_file):
        return None
    try:
        with open(pid_file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content.isdigit():
                return int(content)
    except Exception as e:
        logger.debug(f"Failed to read pid file {pid_file}: {e}")
    return None


def is_process_alive(pid: int) -> bool:
    """Checks if a process with given PID is currently alive."""
    if not pid or pid <= 0:
        return False

    # 1. Утилизация завершившихся дочерних процессов (reap zombie)
    try:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            return False
        if wpid == 0:
            return True
    except (ChildProcessError, OSError):
        pass

    # 2. Проверка сигналом 0 и обработка привилегий root
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except (ProcessLookupError, OSError):
        return False

    # 3. Проверка состояния зомби для не-дочерних процессов в Linux
    try:
        status_path = f"/proc/{pid}/status"
        if os.path.isfile(status_path):
            with open(status_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("State:"):
                        state = line.split()[1] if len(line.split()) > 1 else ""
                        if state in ("Z", "X"):
                            return False
                        break
    except (FileNotFoundError, ProcessLookupError):
        return False
    except Exception:
        pass

    return True


def terminate_process(proc=None, pid=None, pid_file=None, timeout: float = 1.5, pattern=None) -> None:
    """
    Gracefully stops a daemon process using SIGTERM with timeout, falling back to SIGKILL.
    Supports tracking via subprocess.Popen instance, PID number, and pid_file path.
    Only falls back to pattern pkill as an absolute last resort if process was not found.
    """
    target_pid = None
    if proc and hasattr(proc, "pid"):
        target_pid = proc.pid
    elif pid:
        target_pid = pid
    elif pid_file:
        target_pid = read_pid_file(pid_file)

    # 1. Try terminating via Popen object first
    if proc:
        try:
            proc.terminate()
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
                proc.wait(timeout=0.5)
            except Exception:
                pass
        except Exception:
            pass

    # 2. If target_pid is known and still alive, send SIGTERM then SIGKILL
    if target_pid and is_process_alive(target_pid):
        try:
            os.kill(target_pid, signal.SIGTERM)
            deadline = time.time() + timeout
            while time.time() < deadline:
                time.sleep(0.1)
                if not is_process_alive(target_pid):
                    break
            else:
                try:
                    os.kill(target_pid, signal.SIGKILL)
                except OSError:
                    pass
        except OSError:
            pass

    if pid_file and os.path.isfile(pid_file):
        try:
            os.remove(pid_file)
        except Exception:
            pass

    # 3. Optional pattern fallback for untracked orphan processes
    if pattern:
        try:
            subprocess.run(["pkill", "-15", "-f", pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.2)
            subprocess.run(["pkill", "-9", "-f", pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
