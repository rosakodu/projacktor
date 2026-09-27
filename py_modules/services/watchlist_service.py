"""Watchlist domain service for Projacktor."""

import json
from ..db import get_db, logger


class WatchlistService:
    def get_watchlist(self) -> list[dict]:
        db = get_db()
        try:
            rows = db.execute("SELECT * FROM watchlist ORDER BY id DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            db.close()

    def add_to_watchlist(self, data) -> dict:
        try:
            body = json.loads(data) if isinstance(data, str) else (data or {})
            tmdb_id = body.get('tmdb_id') or body.get('id')
            if not tmdb_id:
                return {"success": False, "error": "tmdb_id is required"}
            title = body.get('title') or body.get('name') or "Без названия"
            original_title = body.get('original_title') or body.get('original_name') or ""
            media_type = body.get('media_type') or "movie"
            year = str(body.get('year') or body.get('release_date') or body.get('first_air_date') or "")[:4]
            overview = body.get('overview') or ""
            poster_path = body.get('poster_path') or ""
            backdrop_path = body.get('backdrop_path') or ""
            vote_average = float(body.get('vote_average') or 0)

            db = get_db()
            try:
                db.execute("""
                    INSERT INTO watchlist (tmdb_id, media_type, title, original_title, year, overview, poster_path, backdrop_path, vote_average)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(tmdb_id) DO UPDATE SET
                        title=excluded.title,
                        original_title=excluded.original_title,
                        media_type=excluded.media_type,
                        year=excluded.year,
                        overview=excluded.overview,
                        poster_path=excluded.poster_path,
                        backdrop_path=excluded.backdrop_path,
                        vote_average=excluded.vote_average
                """, (tmdb_id, media_type, title, original_title, year, overview, poster_path, backdrop_path, vote_average))
                db.commit()
                return {"success": True}
            finally:
                db.close()
        except Exception as e:
            logger.error(f"WatchlistService add_to_watchlist error: {e}")
            return {"success": False, "error": str(e)}

    def remove_from_watchlist(self, tmdb_id: int) -> bool:
        try:
            db = get_db()
            try:
                db.execute("DELETE FROM watchlist WHERE tmdb_id=?", (tmdb_id,))
                db.commit()
                return True
            finally:
                db.close()
        except Exception as e:
            logger.error(f"WatchlistService remove_from_watchlist error: {e}")
            return False

    def is_in_watchlist(self, tmdb_id: int) -> bool:
        try:
            db = get_db()
            try:
                row = db.execute("SELECT id FROM watchlist WHERE tmdb_id=?", (tmdb_id,)).fetchone()
                return bool(row)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"WatchlistService is_in_watchlist error: {e}")
            return False
