"""Remove files associated with a media item without deleting its parent directories."""

import os

from ..db import logger
from ..common import load_settings
from .library_scanner import LibraryScanner


def aria2_file_paths(dm, gid: str, download_dir: str) -> set[str]:
    """Read the files belonging to a recorded task before cancelling it."""
    if not dm or not gid or not download_dir or not os.path.isabs(download_dir):
        return set()
    root = os.path.realpath(download_dir)
    try:
        status = dm.get_status(gid) or {}
        gids = [gid, *(status.get("followedBy") or [])]
        paths = set()
        for task in gids:
            for entry in dm.get_files(task) or []:
                path = entry.get("path") or ""
                if path and os.path.isabs(path) and os.path.commonpath((root, os.path.realpath(path))) == root:
                    paths.add(path)
        return paths
    except Exception as error:
        logger.warning(f"Unable to read aria2 files for {gid}: {error}")
        return set()


def indexed_file_paths(db, media_id: int | None) -> set[str]:
    if media_id is None:
        return set()
    return {
        row[0] for row in db.execute("SELECT file_path FROM media_files WHERE media_id=?", (media_id,))
        if row[0]
    }


def episode_file_paths(db, media_id: int, directory: str, name: str, *paths: str) -> set[str]:
    indexed = indexed_file_paths(db, media_id)
    result = {path for path in indexed if name and os.path.basename(path).casefold() == name.casefold()}
    if directory and os.path.isabs(directory):
        root = os.path.realpath(directory)
        for path in paths:
            if path:
                candidate = os.path.join(root, path)
                if os.path.commonpath((root, os.path.realpath(candidate))) == root:
                    result.add(candidate)
    return result


def remove_media_files(db, media_id: int | None, paths: set[str]) -> None:
    if not paths:
        return
    roots = LibraryScanner().get_search_roots(load_settings().get("download_path"))
    other_files = {
        os.path.realpath(row[0])
        for row in db.execute(
            "SELECT file_path FROM media_files WHERE media_id IS NOT ?",
            (media_id,),
        )
        if row[0]
    }
    for path in paths:
        if not os.path.isabs(path):
            continue
        for candidate in (path, path + ".aria2"):
            real_path = os.path.realpath(candidate)
            if (
                real_path in other_files
                or os.path.realpath(path) in other_files
                or not any(os.path.commonpath((root, real_path)) == root for root in roots)
            ):
                continue
            if os.path.isfile(candidate) and not os.path.islink(candidate):
                try:
                    os.unlink(candidate)
                except FileNotFoundError:
                    pass
