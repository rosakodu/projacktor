import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import threading
import subprocess

import shutil
import secrets
from .db import CONFIG_DIR, get_db, DB_LOCK, logger
from .common import get_bin_path, _clean_env, POPULAR_TRACKERS, is_executable_release
from .stream import is_header_ready

class DownloadManager:
    def __init__(self, port):
        self.port = port
        self.rpc_url = f"http://127.0.0.1:{self.port}/jsonrpc"
        self.process = None
        self._running = False
        self._sync_thread = None
        self.secret = self._init_secret()

    def _init_secret(self):
        secret_file = os.path.join(CONFIG_DIR, "aria2.secret")
        if os.path.exists(secret_file):
            try:
                with open(secret_file, "r") as f:
                    sec = f.read().strip()
                    if sec: return sec
            except Exception:
                pass
        sec = secrets.token_hex(16)
        try:
            with open(secret_file, "w") as f:
                f.write(sec)
        except Exception as e:
            logger.warning(f"Could not save aria2 secret file: {e}")
        return sec

    def is_running(self):
        try:
            res = self._rpc_call("aria2.getVersion")
            return res is not None and "version" in res
        except Exception:
            return False

    def start(self):
        if self.is_running():
            logger.info(f"Aria2c is already running and responding on port {self.port}.")
            self._running = True
            self._sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
            self._sync_thread.start()
            return True

        if self.process:
            try:
                self.process.poll()
            except Exception:
                pass
            self.process = None

        try:
            subprocess.run(["pkill", "-f", f"aria2c.*--rpc-listen-port={self.port}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.3)
        except Exception:
            pass

        aria2c_path = get_bin_path("aria2c")
        if not os.path.isfile(aria2c_path) and not shutil.which("aria2c"):
            logger.error(f"aria2c not found at {aria2c_path}!")
            return False
        
        session_file = os.path.join(CONFIG_DIR, "aria2.session")
        if not os.path.exists(session_file):
            try:
                open(session_file, 'a').close()
            except Exception as e:
                logger.error(f"Failed to touch session file: {e}")

        cmd = [
            aria2c_path,
            "--enable-rpc",
            f"--rpc-listen-port={self.port}",
            f"--rpc-secret={self.secret}",
            "--rpc-listen-all=false",
            "--seed-time=0",
            "--max-concurrent-downloads=3",
            "--daemon=false",
            f"--input-file={session_file}",
            f"--save-session={session_file}",
            "--save-session-interval=30",
            "--bt-prioritize-piece=head=50M,tail=15M",
            "--file-allocation=none",
            "--bt-save-metadata=true",
            "--bt-load-saved-metadata=true",
            "--enable-dht=true",
            "--dht-listen-port=6881",
            "--enable-peer-exchange=true",
            "--bt-enable-lpd=true",
            "--bt-max-peers=100",
            "--max-connection-per-server=16",
            f"--bt-tracker={','.join(POPULAR_TRACKERS)}"
        ]
        
        env = _clean_env()
        self.process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, start_new_session=True)
        
        # Wait for aria2c to start responding
        for _ in range(10):
            time.sleep(0.3)
            if self.is_running():
                break

        self._running = True
        self._sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self._sync_thread.start()
        logger.info(f"Aria2c started with {aria2c_path} on port {self.port}.")
        return True

    def stop(self):
        self._running = False
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=0.8)
            except subprocess.TimeoutExpired:
                try:
                    self.process.kill()
                    self.process.wait(timeout=0.4)
                except Exception:
                    pass
            except Exception:
                pass
            self.process = None

        try:
            subprocess.run(["pkill", "-9", "-f", f"aria2c.*--rpc-listen-port={self.port}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        logger.info("Aria2c stopped.")

    def _rpc_call(self, method, params=None):
        if params is None:
            params = []
        if self.secret:
            params = [f"token:{self.secret}"] + params
        payload = {
            "jsonrpc": "2.0",
            "id": "projacktor",
            "method": method,
            "params": params
        }
        try:
            req = urllib.request.Request(self.rpc_url, data=json.dumps(payload).encode('utf-8'),
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=2) as response:
                return json.loads(response.read().decode('utf-8'))['result']
        except Exception as e:
            return None

    def add_download(self, magnet, directory, options=None):
        opt = {"dir": directory}
        if options and isinstance(options, dict):
            opt.update(options)
        res = self._rpc_call("aria2.addUri", [[magnet], opt])
        return res

    def add_torrent(self, torrent_b64, directory, options=None):
        opt = {"dir": directory}
        if options and isinstance(options, dict):
            opt.update(options)
        res = self._rpc_call("aria2.addTorrent", [torrent_b64, [], opt])
        return res

    def get_status(self, gid):
        return self._rpc_call("aria2.tellStatus", [gid])

    def get_files(self, gid):
        return self._rpc_call("aria2.getFiles", [gid])

    def change_options(self, gid, options):
        return self._rpc_call("aria2.changeOption", [gid, options])

    def select_files(self, gid, file_indices):
        return self._rpc_call("aria2.changeOption", [gid, {"select-file": str(file_indices)}])
    
    def pause(self, gid):
        return self._rpc_call("aria2.pause", [gid])
        
    def resume(self, gid):
        return self._rpc_call("aria2.unpause", [gid])

    def unpause_all(self):
        return self._rpc_call("aria2.unpauseAll")

    def remove(self, gid):
        return self._rpc_call("aria2.remove", [gid])

    def tell_active(self):
        return self._rpc_call("aria2.tellActive") or []

    def tell_waiting(self, offset=0, num=100):
        return self._rpc_call("aria2.tellWaiting", [offset, num]) or []

    def tell_stopped(self, offset=0, num=100):
        return self._rpc_call("aria2.tellStopped", [offset, num]) or []

    def purge_download_result(self):
        return self._rpc_call("aria2.purgeDownloadResult")

    def get_global_stats(self):
        return self._rpc_call("aria2.getGlobalStat")

    def sync_once(self):
        if not self.is_running():
            return
        try:
            self._update_db()
        except Exception as e:
            logger.error(f"sync_once error: {e}")
        
    def _sync_loop(self):
        while self._running:
            try:
                self._update_db()
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            time.sleep(3)
            
    def _update_db(self):
        active = self._rpc_call("aria2.tellActive") or []
        waiting = self._rpc_call("aria2.tellWaiting", [0, 100]) or []
        stopped = self._rpc_call("aria2.tellStopped", [0, 100]) or []
        
        all_tasks = active + waiting + stopped
        task_map = {t["gid"]: t for t in all_tasks}
        
        with DB_LOCK:
            db = get_db()
            try:
                self._update_db_inner(db, task_map, all_tasks)
            finally:
                db.close()

    def _update_db_inner(self, db, task_map, all_tasks):
        cursor = db.cursor()
        cursor.execute("SELECT id, aria2_gid, status, download_dir, media_id, magnet_uri FROM downloads WHERE status NOT IN ('completed')")
        for row in cursor.fetchall():
            row_id = row['id']
            gid = row['aria2_gid']
            row_dir = row['download_dir']
            
            # 1. Приоритетная проверка диска: если файл уже полностью скачан (видеофайл без .aria2), отмечаем завершённым
            if row_dir and os.path.isdir(row_dir):
                video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
                has_aria2 = False
                found_videos = []
                for r_root, _, r_files in os.walk(row_dir):
                    for r_f in r_files:
                        if r_f.endswith('.aria2'):
                            has_aria2 = True
                        if os.path.splitext(r_f)[1].lower() in video_exts:
                            fp = os.path.join(r_root, r_f)
                            try:
                                sz = os.path.getsize(fp)
                                if sz > 10 * 1024 * 1024 and is_header_ready(fp):
                                    found_videos.append((fp, sz))
                            except (OSError, IOError) as e:
                                logger.debug(f"Could not get file size for {fp}: {e}")
                
                if found_videos and not has_aria2:
                    total_sz = sum(sz for _, sz in found_videos)
                    logger.info(f"Download id={row_id} confirmed complete on disk ({total_sz} bytes), updating DB")
                    cursor.execute("""
                        UPDATE downloads 
                        SET status='completed', progress=100.0, download_speed=0, upload_speed=0,
                            total_size=CASE WHEN total_size > 0 THEN total_size ELSE ? END,
                            downloaded_size=CASE WHEN total_size > 0 THEN total_size ELSE ? END,
                            completed_at=COALESCE(completed_at, CURRENT_TIMESTAMP),
                            error_message=NULL
                        WHERE id=?
                    """, (total_sz, total_sz, row_id))
                    if row['media_id']:
                        self._scan_and_add_files(cursor, row['media_id'], row_dir)
                    db.commit()
                    continue

            # 2. Поиск активной задачи в aria2c
            t = task_map.get(gid)

            # Если задача завершилась ошибкой дубликата 12 (InfoHash is already registered) — ищем реальную рабочую задачу
            if t and t.get('status') == 'error':
                err_code = str(t.get('errorCode', ''))
                err_msg = str(t.get('errorMessage', '')).lower()
                if err_code == '12' or 'already registered' in err_msg:
                    t = None

            if t:
                followed = t.get('followedBy')
                if followed and len(followed) > 0:
                    new_gid = followed[0]
                    cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                    gid = new_gid
                    t = task_map.get(gid)
            
            # Также проверяем задачи, следующие за этим gid
            if not t:
                for cand in all_tasks:
                    if cand.get('following') == gid:
                        if cand.get('status') == 'error' and str(cand.get('errorCode', '')) == '12':
                            continue
                        new_gid = cand['gid']
                        cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                        gid = new_gid
                        t = cand
                        break

            # Fallback: поиск по infoHash или директории
            if not t:
                magnet = (row['magnet_uri'] or "").lower()
                norm_dir = os.path.normpath(row_dir) if row_dir else ""
                target_hash = ""
                if "xt=urn:btih:" in magnet:
                    try:
                        target_hash = magnet.split("xt=urn:btih:")[1].split("&")[0].strip()
                    except Exception as e:
                        logger.debug(f"Failed to parse magnet target hash: {e}")
                        target_hash = ""

                for cand in all_tasks:
                    cand_hash = cand.get('infoHash', '').lower()
                    cand_dir = os.path.normpath(cand.get('dir', '')) if cand.get('dir') else ""
                    if (target_hash and cand_hash == target_hash) or (norm_dir and cand_dir == norm_dir):
                        if cand.get('status') == 'error' and str(cand.get('errorCode', '')) == '12':
                            continue
                        # Если это метаданные со ссылкой на контент — берем сразу задачу контента
                        cand_followed = cand.get('followedBy')
                        if cand_followed and len(cand_followed) > 0:
                            f_gid = cand_followed[0]
                            f_task = task_map.get(f_gid)
                            if f_task and not (f_task.get('status') == 'error' and str(f_task.get('errorCode', '')) == '12'):
                                cand = f_task
                        new_gid = cand['gid']
                        cursor.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row_id))
                        gid = new_gid
                        t = cand
                        logger.info(f"Re-linked download id={row_id} to aria2 GID={new_gid}")
                        break
            
            if not t:
                # Если задачи нет в aria2c, сбрасываем скорость и ставим на паузу
                if row['status'] == 'downloading':
                    cursor.execute("UPDATE downloads SET download_speed=0, upload_speed=0, status='paused' WHERE id=?", (row_id,))
                continue
                
            total = int(t.get('totalLength', 0))
            completed = int(t.get('completedLength', 0))
            prog = round((completed / total * 100), 1) if total > 0 else 0
            raw_status = t.get('status', 'queued')
            down_speed = int(t.get('downloadSpeed', 0))
            up_speed = int(t.get('uploadSpeed', 0))
            has_followed = bool(t.get('followedBy'))

            # Защита от вредоносных раздач (.exe): проверяем список файлов задачи
            t_files = t.get('files') or []
            real_files = [f for f in t_files if f.get('path') and not f.get('path').startswith('[METADATA]')]
            if real_files:
                video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
                has_video = any(os.path.splitext(f.get('path', ''))[1].lower() in video_exts for f in real_files)
                if not has_video:
                    has_exe = any(is_executable_release(f.get('path', '')) for f in real_files)
                    if has_exe:
                        logger.warning(f"Download id={row_id} contains only non-video/executable files! Aborting aria2 task {gid}.")
                        try:
                            self._rpc_call("aria2.forceRemove", [gid])
                            self._rpc_call("aria2.removeDownloadResult", [gid])
                        except Exception:
                            pass
                        cursor.execute("""
                            UPDATE downloads 
                            SET status='error', error_message='В раздаче не найдено видеофайлов (обнаружены нежелательные/исполняемые файлы .exe)',
                                download_speed=0, upload_speed=0
                            WHERE id=?
                        """, (row_id,))
                        db.commit()
                        continue
            
            if raw_status == 'complete':
                if has_followed:
                    # Only metadata finished, content task is in progress
                    new_status = 'downloading'
                else:
                    new_status = 'completed'
            elif raw_status == 'active':
                new_status = 'downloading'
            elif raw_status == 'paused':
                new_status = 'paused'
            elif raw_status == 'error':
                err_code = str(t.get('errorCode', ''))
                err_msg = t.get('errorMessage', '')
                # aria2 errorCode 13: "File exists, but a control file(*.aria2) does not exist."
                # Это означает, что готовый файл уже присутствует на диске целиком.
                row_dir = row['download_dir']
                is_file_ready = err_code == '13' or 'exists, but a control file' in err_msg
                if not is_file_ready and row_dir and os.path.isdir(row_dir):
                    video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
                    has_aria2 = any(f.endswith('.aria2') for _, _, fs in os.walk(row_dir) for f in fs)
                    has_video = any(os.path.splitext(f)[1].lower() in video_exts for _, _, fs in os.walk(row_dir) for f in fs)
                    if not has_aria2 and has_video:
                        is_file_ready = True
                
                if is_file_ready:
                    new_status = 'completed'
                    prog = 100.0
                    down_speed = 0
                    up_speed = 0
                    if total <= 0:
                        total = int(t.get('totalLength', 0))
                    if completed <= 0:
                        completed = total
                else:
                    new_status = 'error'
            else:
                new_status = 'queued'
                
            cursor.execute("""
                UPDATE downloads 
                SET status=?, progress=?, download_speed=?, upload_speed=?, total_size=?, downloaded_size=?
                WHERE id=?
            """, (new_status, prog, down_speed, up_speed, total, completed, row_id))
            
            if new_status == 'completed' and not has_followed and row['status'] != 'completed':
                cursor.execute("UPDATE downloads SET completed_at=CURRENT_TIMESTAMP WHERE id=?", (row_id,))
                if row['download_dir'] and row['media_id']:
                    self._scan_and_add_files(cursor, row['media_id'], row['download_dir'])
            db.commit()
        
    def _scan_and_add_files(self, cursor, media_id, ddir):
        if not os.path.isdir(ddir):
            return

        # Удаляем любые случайные исполняемые файлы из папки медиа
        for root, _, files in os.walk(ddir):
            for f in files:
                if is_executable_release(f):
                    try:
                        os.remove(os.path.join(root, f))
                        logger.warning(f"Removed dangerous executable file from download dir: {f}")
                    except Exception:
                        pass

        video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov'}
        for root, _, files in os.walk(ddir):
            for f in files:
                if os.path.splitext(f)[1].lower() in video_exts:
                    fp = os.path.join(root, f)
                    if os.path.exists(fp + ".aria2") or not is_header_ready(fp):
                        continue
                    try:
                        sz = os.path.getsize(fp)
                    except (OSError, IOError) as e:
                        logger.debug(f"Could not get file size for {fp}: {e}")
                        sz = 0
                    if sz < 10 * 1024 * 1024:
                        continue
                    cursor.execute("SELECT id FROM media_files WHERE media_id=? AND file_path=?", (media_id, fp))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO media_files (media_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)",
                                       (media_id, fp, f, sz))
        cursor.execute("UPDATE media SET status='downloaded' WHERE id=?", (media_id,))

