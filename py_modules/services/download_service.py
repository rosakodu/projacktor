"""Download management domain service for Projacktor."""

import os
import re
import asyncio

from ..db import get_db, logger
from ..common import is_executable_release


class DownloadService:
    @staticmethod
    def cleanup_old_torrent_download(mid: int, ddir: str, old_gid: str = "", old_hash: str = "", dm=None):
        logger.info(f"Replacing torrent: cleaning old task mid={mid}, gid={old_gid}, hash={old_hash}")
        if dm:
            if old_gid:
                try:
                    dm._rpc_call("aria2.forceRemove", [old_gid])
                except Exception:
                    try:
                        dm.remove(old_gid)
                    except Exception:
                        pass
                try:
                    dm._rpc_call("aria2.removeDownloadResult", [old_gid])
                except Exception:
                    pass

            if old_hash:
                try:
                    active = dm._rpc_call("aria2.tellActive") or []
                    waiting = dm._rpc_call("aria2.tellWaiting", [0, 100]) or []
                    stopped = dm._rpc_call("aria2.tellStopped", [0, 100]) or []
                    for t in active + waiting + stopped:
                        h = (t.get('infoHash') or '').lower()
                        if h == old_hash.lower():
                            t_gid = t.get('gid')
                            try:
                                dm._rpc_call("aria2.forceRemove", [t_gid])
                            except Exception:
                                try:
                                    dm.remove(t_gid)
                                except Exception:
                                    pass
                            try:
                                dm._rpc_call("aria2.removeDownloadResult", [t_gid])
                            except Exception:
                                pass
                except Exception as e:
                    logger.warning(f"Error removing old hash {old_hash} from aria2: {e}")

        db = get_db()
        try:
            cur = db.cursor()
            old_files = cur.execute("SELECT file_path FROM media_files WHERE media_id=?", (mid,)).fetchall()
            for f in old_files:
                fp = f['file_path']
                try:
                    if os.path.exists(fp):
                        os.remove(fp)
                    if os.path.exists(fp + ".aria2"):
                        os.remove(fp + ".aria2")
                except Exception as fe:
                    logger.warning(f"Error removing old file {fp}: {fe}")
            cur.execute("DELETE FROM media_files WHERE media_id=?", (mid,))
            db.commit()
        except Exception as e:
            logger.warning(f"Error clearing media_files for media {mid}: {e}")
        finally:
            db.close()

        try:
            if ddir and os.path.isdir(ddir):
                for fn in os.listdir(ddir):
                    if fn.endswith(".aria2"):
                        try:
                            os.remove(os.path.join(ddir, fn))
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"Error cleaning .aria2 in {ddir}: {e}")

    def get_downloads_count(self) -> int:
        db = get_db()
        try:
            c = db.execute("SELECT COUNT(*) as cnt FROM downloads WHERE status IN ('downloading', 'queued')").fetchone()
            return c['cnt'] if c else 0
        finally:
            db.close()

    def get_downloads(self) -> list[dict]:
        db = get_db()
        try:
            dls = db.execute("""
                SELECT d.*, 
                       COALESCE(m.title, d.torrent_title, 'Медиа') AS title,
                       m.year,
                       m.poster_path,
                       m.backdrop_path,
                       m.media_type,
                       m.overview
                FROM downloads d
                LEFT JOIN media m ON d.media_id = m.id
                WHERE d.status IN ('downloading', 'paused', 'queued', 'seeding', 'completed', 'error')
                  AND (d.downloaded_size > 0 OR (d.aria2_gid IS NOT NULL AND d.aria2_gid != '') OR d.status != 'queued')
                ORDER BY d.id DESC
            """).fetchall()
            return [dict(row) for row in dls]
        finally:
            db.close()

    async def start_download(self, mid: int, file_indices: str = "", dm=None) -> dict:
        try:
            db = get_db()
            try:
                cursor = db.cursor()
                m = cursor.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
                if not m:
                    return {"success": False, "error": "Media not found"}
                
                magnet = m['magnet_uri']
                ddir = m['download_dir']
                if not magnet or not ddir:
                    return {"success": False, "error": "Magnet link missing"}

                if is_executable_release(m.get('torrent_title', ''), magnet):
                    logger.warning(f"start_download blocked executable release: {m.get('torrent_title')}")
                    return {"success": False, "error": "Раздачи с исполняемыми файлами (.exe) запрещены"}
                    
                os.makedirs(ddir, exist_ok=True)
                dl = cursor.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
                gid = dl['aria2_gid'] if dl else None
                
                options = {
                    "dir": ddir,
                    "file-allocation": "none",
                    "bt-prioritize-piece": "head=50M,tail=15M"
                }
                if file_indices:
                    options["select-file"] = str(file_indices)
                    
                target_hash = ""
                if "xt=urn:btih:" in (magnet or "").lower():
                    try:
                        target_hash = magnet.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                    except Exception:
                        pass

                st = None
                if gid and dm:
                    cand_st = dm.get_status(gid)
                    if cand_st and not (cand_st.get('status') == 'error' and str(cand_st.get('errorCode', '')) in ('12', '13')):
                        cand_hash = (cand_st.get('infoHash') or '').lower()
                        if cand_hash and target_hash and cand_hash != target_hash:
                            logger.info(f"start_download: Detected different torrent {cand_hash} != {target_hash}, cleaning old task")
                            self.cleanup_old_torrent_download(mid, ddir, gid, cand_hash, dm)
                            gid = None
                            cursor.execute("""
                                UPDATE downloads
                                SET aria2_gid=NULL, status='queued', progress=0, download_speed=0,
                                    downloaded_size=0, total_size=0, error_message=NULL
                                WHERE media_id=?
                            """, (mid,))
                            db.commit()
                        else:
                            st = cand_st

                if dl and not st:
                    dl_mag = dl.get('magnet_uri') or ''
                    dl_hash = ""
                    if "xt=urn:btih:" in dl_mag.lower():
                        try:
                            dl_hash = dl_mag.lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                        except Exception:
                            pass
                    if dl_hash and target_hash and dl_hash != target_hash:
                        logger.info(f"start_download: dl_hash {dl_hash} != {target_hash}, cleaning old task")
                        self.cleanup_old_torrent_download(mid, ddir, gid or '', dl_hash, dm)
                        gid = None

                if not st and target_hash and dm:
                    active = dm._rpc_call("aria2.tellActive") or []
                    waiting = dm._rpc_call("aria2.tellWaiting", [0, 100]) or []
                    stopped = dm._rpc_call("aria2.tellStopped", [0, 100]) or []
                    for cand in active + waiting + stopped:
                        if cand.get('infoHash', '').lower() == target_hash:
                            if cand.get('status') == 'error' and str(cand.get('errorCode', '')) in ('12', '13'):
                                continue
                            followed = cand.get('followedBy')
                            if followed and len(followed) > 0:
                                f_cand = dm.get_status(followed[0])
                                if f_cand and not (f_cand.get('status') == 'error' and str(f_cand.get('errorCode', '')) in ('12', '13')):
                                    st = f_cand
                                    gid = st.get('gid')
                                    break
                            st = cand
                            gid = st.get('gid')
                            break

                if st and dm:
                    followed = st.get('followedBy')
                    if followed and len(followed) > 0:
                        gid = followed[0]
                        st = dm.get_status(gid) or st
                    if file_indices:
                        dm.select_files(gid, str(file_indices))
                    dm.resume(gid)
                    if dl:
                        cursor.execute("UPDATE downloads SET aria2_gid=?, status='downloading', error_message=NULL, magnet_uri=?, torrent_title=?, quality=? WHERE id=?", 
                                       (gid, magnet, m['torrent_title'], m['quality'], dl['id']))
                    else:
                        cursor.execute("""
                            INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                            VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                        """, (mid, magnet, m['torrent_title'], ddir, gid, m['quality']))
                    cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
                    
                    if target_hash:
                        try:
                            cursor.execute("UPDATE watch_history SET torrent_hash=?, is_downloaded=0, watched_at=CURRENT_TIMESTAMP WHERE media_id=? OR tmdb_id=?", 
                                           (target_hash, mid, m['tmdb_id']))
                        except Exception as e:
                            logger.warning(f"Failed to update watch_history: {e}")
                        
                    db.commit()
                    if dm:
                        dm.sync_once()
                    return {"success": True, "gid": gid}

                new_gid = dm.add_download(magnet, ddir, options) if dm else ""
                if dl:
                    cursor.execute("UPDATE downloads SET aria2_gid=?, status='downloading', error_message=NULL, magnet_uri=?, torrent_title=?, quality=? WHERE id=?", 
                                   (new_gid, magnet, m['torrent_title'], m['quality'], dl['id']))
                else:
                    cursor.execute("""
                        INSERT INTO downloads (media_id, magnet_uri, torrent_title, download_dir, aria2_gid, status, quality)
                        VALUES (?, ?, ?, ?, ?, 'downloading', ?)
                    """, (mid, magnet, m['torrent_title'], ddir, new_gid, m['quality']))
                    
                cursor.execute("UPDATE media SET in_library=1, status='downloading' WHERE id=?", (mid,))
                
                if target_hash:
                    try:
                        cursor.execute("UPDATE watch_history SET torrent_hash=?, is_downloaded=0, watched_at=CURRENT_TIMESTAMP WHERE media_id=? OR tmdb_id=?", 
                                       (target_hash, mid, m['tmdb_id']))
                    except Exception as e:
                        logger.warning(f"Failed to update watch_history: {e}")
                    
                db.commit()
                if dm:
                    dm.sync_once()
                return {"success": True, "gid": new_gid}
            finally:
                db.close()
        except Exception as e:
            logger.error(f"DownloadService start_download error: {e}")
            return {"success": False, "error": str(e)}

    async def download_episode(self, mid: int, file_index: int, dm=None, library_service=None, ts=None) -> dict:
        idx = int(file_index) if file_index is not None else 0
        db = get_db()
        try:
            m = db.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
            if not m:
                return {"success": False, "error": "Медиа не найдено"}

            episodes = await library_service.get_episodes(mid, ts=ts, dm=dm) if library_service else []
            target_ep = next((e for e in episodes if e.get('index') == idx), None)
            if not target_ep and 1 <= idx <= len(episodes):
                target_ep = episodes[idx - 1]

            target_name = target_ep.get('name', '') if target_ep else ''
            target_season, target_ep_num, _ = library_service._episode_sort_key(target_name) if (target_name and library_service) else (1, 999999, '')

            # Check if this media already has an active task in aria2
            dl = db.execute("SELECT * FROM downloads WHERE media_id=?", (mid,)).fetchone()
            existing_gid = dl['aria2_gid'] if dl else None
            existing_st = dm.get_status(existing_gid) if (existing_gid and dm) else None

            # If fresh download, pass target file index so aria2 downloads ONLY this episode from the start
            initial_indices = ""
            if not existing_st and target_ep and target_ep.get('index'):
                initial_indices = str(target_ep['index'])

            start_res = await self.start_download(mid, initial_indices, dm)
            gid = start_res.get('gid')
            if not gid or not dm:
                return start_res

            af_list = []
            for _ in range(30):
                st = dm.get_status(gid)
                if st and st.get('followedBy') and len(st['followedBy']) > 0:
                    gid = st['followedBy'][0]
                    try:
                        db.execute("UPDATE downloads SET aria2_gid=? WHERE media_id=?", (gid, mid))
                        db.commit()
                    except Exception:
                        pass
                af_list = dm.get_files(gid) or []
                if af_list and any(af.get('path') and not af.get('path').startswith('[METADATA]') for af in af_list):
                    break
                await asyncio.sleep(0.5)

            if not af_list or not any(af.get('path') and not af.get('path').startswith('[METADATA]') for af in af_list):
                logger.info(f"download_episode: aria2 has no real file list yet for gid {gid}, proceeding in background")
                return {"success": True, "gid": gid, "note": "download_started_waiting_metadata"}

            matched_af = None
            if target_name:
                t_clean = target_name.lower().strip()
                for af in af_list:
                    p = af.get('path', '')
                    if os.path.basename(p).lower().strip() == t_clean:
                        matched_af = af
                        break

            if not matched_af and target_name:
                norm_target = re.sub(r'[^a-z0-9а-яё]', '', target_name.lower())
                for af in af_list:
                    p = af.get('path', '')
                    norm_p = re.sub(r'[^a-z0-9а-яё]', '', os.path.basename(p).lower())
                    if norm_target and norm_target == norm_p:
                        matched_af = af
                        break

            if not matched_af and target_ep_num != 999999 and library_service:
                for af in af_list:
                    p = af.get('path', '')
                    af_s, af_e, _ = library_service._episode_sort_key(p)
                    if af_e != 999999 and af_e == target_ep_num and af_s == target_season:
                        matched_af = af
                        break

            target_size = int(target_ep.get('size', 0)) if target_ep else 0
            if not matched_af and target_size > 0:
                for af in af_list:
                    try:
                        af_len = int(af.get('length', 0))
                        if abs(af_len - target_size) < 65536:
                            matched_af = af
                            break
                    except Exception:
                        pass

            if not matched_af and 1 <= idx <= len(af_list):
                video_exts = {'.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'}
                video_afs = [af for af in af_list if os.path.splitext(af.get('path', ''))[1].lower() in video_exts]
                if 1 <= idx <= len(video_afs):
                    matched_af = video_afs[idx - 1]

            if matched_af:
                target_aria2_idx = str(matched_af['index'])
                current_selected = set(str(af['index']) for af in af_list if af.get('selected') == 'true')
                
                if len(current_selected) >= len(af_list) and len(af_list) > 1:
                    current_selected = {target_aria2_idx}
                    needs_restart = True
                elif target_aria2_idx not in current_selected:
                    current_selected.add(target_aria2_idx)
                    needs_restart = True
                else:
                    needs_restart = False

                if needs_restart:
                    selected_str = ",".join(sorted(current_selected, key=int))
                    dm._rpc_call("aria2.forceRemove", [gid])
                    dm._rpc_call("aria2.removeDownloadResult", [gid])
                    
                    target_hash = ""
                    if "xt=urn:btih:" in (m.get('magnet_uri') or "").lower():
                        try:
                            target_hash = m['magnet_uri'].lower().split("xt=urn:btih:")[1].split("&")[0].strip()
                        except Exception:
                            pass

                    torrent_path = os.path.join(m['download_dir'], f"{target_hash}.torrent") if target_hash else ""
                    new_gid = None
                    if torrent_path and os.path.isfile(torrent_path):
                        try:
                            import base64
                            with open(torrent_path, "rb") as tf:
                                b64 = base64.b64encode(tf.read()).decode('utf-8')
                            opt = {
                                "dir": m['download_dir'],
                                "file-allocation": "none",
                                "bt-prioritize-piece": "head=50M,tail=15M",
                                "select-file": selected_str
                            }
                            new_gid = dm.add_torrent(b64, m['download_dir'], opt)
                            logger.info(f"download_episode: added torrent with select-file {selected_str}, new gid {new_gid}")
                        except Exception as te:
                            logger.warning(f"download_episode: failed to add_torrent: {te}")

                    if not new_gid:
                        opt = {
                            "dir": m['download_dir'],
                            "file-allocation": "none",
                            "bt-prioritize-piece": "head=50M,tail=15M",
                            "select-file": selected_str
                        }
                        new_gid = dm.add_download(m['magnet_uri'], m['download_dir'], opt)

                    db = get_db()
                    db.execute("UPDATE downloads SET aria2_gid=?, status='downloading' WHERE media_id=?", (new_gid, mid))
                    db.commit()
                    db.close()
                    gid = new_gid
                    logger.info(f"download_episode: restarted aria2 task with files {selected_str} for mid {mid}, new gid {gid}")
                else:
                    dm.resume(gid)
                return {"success": True, "gid": gid, "aria2_index": target_aria2_idx}
            else:
                logger.warning(f"download_episode: could not match aria2 file for {target_name}, keeping background download active")
                try:
                    dm.resume(gid)
                except Exception:
                    pass
                return {"success": True, "gid": gid, "note": "download_started_unmatched"}
        except Exception as e:
            logger.error(f"DownloadService download_episode error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            try:
                db.close()
            except Exception:
                pass

    async def add_download(self, data: str, library_service=None, dm=None) -> dict:
        if not library_service:
            return {"success": False, "error": "Library service unavailable"}
        res = await library_service.add_to_library(data, dm=dm, cleanup_cb=lambda mid, ddir, gid, h: self.cleanup_old_torrent_download(mid, ddir, gid, h, dm))
        if res.get("success") and res.get("id"):
            await self.start_download(res["id"], "", dm)
        return res

    def pause_download(self, did: int, dm=None) -> bool:
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid, id FROM downloads WHERE id=? OR media_id=?", (did, did)).fetchone()
            if row and row['aria2_gid'] and dm:
                try:
                    dm.pause(row['aria2_gid'])
                except Exception as e:
                    logger.warning(f"aria2 pause warning: {e}")
            if row:
                db.execute("UPDATE downloads SET status='paused', download_speed=0, upload_speed=0 WHERE id=?", (row['id'],))
            else:
                db.execute("UPDATE downloads SET status='paused', download_speed=0, upload_speed=0 WHERE media_id=?", (did,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"DownloadService pause_download error: {e}")
            return False
        finally:
            db.close()

    async def resume_download(self, did: int, dm=None) -> bool:
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid, magnet_uri, download_dir, id, media_id FROM downloads WHERE id=? OR media_id=?", (did, did)).fetchone()
            if not row:
                m = db.execute("SELECT id FROM media WHERE id=?", (did,)).fetchone()
                if m:
                    db.close()
                    res = await self.start_download(m['id'], "", dm)
                    return bool(res and res.get('success'))
                return False

            if row and dm:
                res = None
                if row['aria2_gid']:
                    try:
                        res = dm.resume(row['aria2_gid'])
                    except Exception:
                        res = None
                if not res and row.get('magnet_uri') and row.get('download_dir'):
                    try:
                        new_gid = dm.add_download(row['magnet_uri'], row['download_dir'])
                        if new_gid:
                            db.execute("UPDATE downloads SET aria2_gid=? WHERE id=?", (new_gid, row['id']))
                    except Exception as e:
                        logger.error(f"Failed to re-add torrent on resume: {e}")
            db.execute("UPDATE downloads SET status='downloading' WHERE id=?", (row['id'],))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"DownloadService resume_download error: {e}")
            return False
        finally:
            db.close()

    def resume_all_downloads(self, dm=None) -> bool:
        try:
            if dm:
                dm.unpause_all()
            db = get_db()
            try:
                cursor = db.cursor()
                rows = cursor.execute("SELECT aria2_gid FROM downloads WHERE status='paused'").fetchall()
                if dm:
                    for r in rows:
                        if r['aria2_gid']:
                            try:
                                dm.resume(r['aria2_gid'])
                            except Exception:
                                pass
                cursor.execute("UPDATE downloads SET status='downloading' WHERE status='paused'")
                db.commit()
            finally:
                db.close()
            if dm:
                dm._update_db()
            return True
        except Exception as e:
            logger.error(f"DownloadService resume_all_downloads error: {e}")
            return False

    def delete_download(self, did: int, dm=None) -> bool:
        db = get_db()
        try:
            row = db.execute("SELECT aria2_gid FROM downloads WHERE id=?", (did,)).fetchone()
            if row and row['aria2_gid'] and dm:
                try:
                    dm.remove(row['aria2_gid'])
                except Exception:
                    pass
            db.execute("DELETE FROM downloads WHERE id=?", (did,))
            db.commit()
            return True
        except Exception as e:
            logger.error(f"DownloadService delete_download error: {e}")
            return False
        finally:
            db.close()
