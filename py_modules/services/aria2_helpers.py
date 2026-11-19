"""Shared aria2 task and control-file helpers for Projacktor services."""

import os
from typing import Iterable, Optional

from ..db import logger
from ..torrserver import extract_hash_from_magnet


def parse_magnet_hash(magnet: str) -> str:
    """Extract lowercase info-hash from a magnet URI, or return ''."""
    if not magnet:
        return ""
    return (extract_hash_from_magnet(str(magnet)) or "").lower()


def _collect_matching_gids(dm, gid: str, norm_hash: str, norm_dirs: set[str]) -> set[str]:
    """Collect matching aria2 GIDs across active, waiting, and stopped queues."""
    gids_to_remove: set[str] = {gid} if gid else set()
    try:
        all_tasks = (
            (dm.tell_active() or [])
            + (dm.tell_waiting() or [])
            + (dm.tell_stopped() or [])
        )
        for t in all_tasks:
            t_gid = t.get("gid")
            t_hash = (t.get("infoHash") or "").lower()
            t_dir = t.get("dir") or ""
            matched = (
                (t_gid and t_gid in gids_to_remove)
                or (t.get("following") and t.get("following") in gids_to_remove)
                or (norm_hash and t_hash == norm_hash)
                or (norm_dirs and t_dir and os.path.abspath(t_dir) in norm_dirs)
            )
            if matched:
                if t_gid:
                    gids_to_remove.add(t_gid)
                for fb in (t.get("followedBy") or []):
                    if fb:
                        gids_to_remove.add(fb)
    except Exception as e:
        logger.warning(f"Error finding aria2 tasks to remove: {e}")
    return gids_to_remove


def remove_aria2_tasks(
    dm,
    gid: str = "",
    target_hash: str = "",
    target_dirs: Optional[Iterable[str]] = None,
) -> None:
    """Remove matching aria2 tasks (including followedBy) and purge results."""
    if not dm:
        return
    norm_hash = (target_hash or "").strip().lower()
    dirs_iter = (target_dirs,) if isinstance(target_dirs, str) else (target_dirs or ())
    norm_dirs = {os.path.abspath(d) for d in dirs_iter if d}
    if not gid and not norm_hash and not norm_dirs:
        return

    gids_to_remove = _collect_matching_gids(dm, gid, norm_hash, norm_dirs)
    for g in gids_to_remove:
        try:
            dm.remove(g)
        except Exception:
            pass
        try:
            dm._rpc_call("aria2.forceRemove", [g])
        except Exception:
            pass
        try:
            dm._rpc_call("aria2.removeDownloadResult", [g])
        except Exception:
            pass
    try:
        dm.purge_download_result()
    except Exception:
        pass


def remove_aria2_control_files(ddir: str) -> None:
    """Safely walk ddir and remove any *.aria2 control files."""
    if not ddir or not os.path.isdir(ddir):
        return
    try:
        for root, _, files in os.walk(ddir):
            for fname in files:
                if fname.endswith(".aria2"):
                    try:
                        os.remove(os.path.join(root, fname))
                    except Exception as e:
                        logger.debug(f"Failed to remove aria2 control file {fname}: {e}")
    except Exception as e:
        logger.warning(f"Error cleaning .aria2 files in {ddir}: {e}")
