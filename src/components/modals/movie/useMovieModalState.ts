import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TorrentItem, PlayerMediaInfo, searchTorrents,
  rpcStartDownload, rpcPrepareStream, rpcAddToWatchlist, rpcRemoveFromWatchlist, rpcIsInWatchlist,
  isExecutableRelease, isUnsupportedMediaRelease, fetchMovieLogo, getLogoUrl, fetchAgeRating, API_BASE
} from "../../../api";
import { playNavSound } from "../../../runtime/navSound";
import { useI18n } from "../../../i18n";
import { TorrentSortMode, MovieModalProps } from "./types";
import { sortTorrentsByMode } from "./movieSortUtils";
import { prepareMediaEntry } from "./movieMediaActions";

export function useMovieModalState({ movie, closeModal, onWatchOnline, onStartMagicBlack }: MovieModalProps) {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [streamingTorrentId, setStreamingTorrentId] = useState<string | null>(null);
  const [downloadingTorrentId, setDownloadingTorrentId] = useState<string | null>(null);
  const [focusedTorrentId, setFocusedTorrentId] = useState<string | null>(null);
  const [torrentMediaIds, setTorrentMediaIds] = useState<Record<string, number>>({});

  const [sortMode, setSortMode] = useState<TorrentSortMode>(() => {
    try {
      const saved = localStorage.getItem("projacktor_torrent_sort");
      if (saved === "newest" || saved === "oldest" || saved === "seeds") return saved;
    } catch {}
    return "seeds";
  });

  const handleSortChange = useCallback((mode: TorrentSortMode) => {
    setSortMode(mode);
    try { localStorage.setItem("projacktor_torrent_sort", mode); } catch {}
  }, []);

  const title = movie.title || movie.name || t("noTitle");
  const origTitle = movie.original_title || movie.original_name || "";
  const date = movie.release_date || movie.first_air_date || "";
  const year = date ? String(date).split("-")[0] : "";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null;

  const [inWatchlist, setInWatchlist] = useState<boolean>(false);
  const [watchlistLoading, setWatchlistLoading] = useState<boolean>(false);
  const [movieLogoPath, setMovieLogoPath] = useState<string | null>(null);
  const [ageRating, setAgeRating] = useState<string | null>(movie.age_rating || null);

  useEffect(() => {
    if (movie.age_rating) setAgeRating(movie.age_rating);
    else if (movie.id) {
      fetchAgeRating(movie.id, movie.media_type).then((res) => {
        if (res) { setAgeRating(res); movie.age_rating = res; }
      }).catch(() => {});
    }
  }, [movie.id, movie.media_type, movie.age_rating]);

  useEffect(() => {
    if (movie.id) {
      rpcIsInWatchlist(movie.id).then((inList) => setInWatchlist(!!inList)).catch(() => {});
      fetchMovieLogo(movie.id, (movie.media_type as any) || "movie").then((path) => {
        if (path) { setMovieLogoPath(path); const img = new Image(); img.src = getLogoUrl(path); }
      }).catch(() => {});
    }
  }, [movie.id, movie.media_type]);

  const handleToggleWatchlist = useCallback(async () => {
    if (watchlistLoading || !movie.id) return;
    setWatchlistLoading(true);
    playNavSound();
    try {
      if (inWatchlist) {
        await rpcRemoveFromWatchlist(movie.id);
        setInWatchlist(false);
      } else {
        await rpcAddToWatchlist(JSON.stringify({
          tmdb_id: movie.id, title, original_title: origTitle, media_type: movie.media_type || "movie",
          year, overview: movie.overview || "", poster_path: movie.poster_path || "",
          backdrop_path: movie.backdrop_path || "", vote_average: movie.vote_average || 0,
        }));
        setInWatchlist(true);
      }
    } catch (err) { console.error("Failed to toggle watchlist:", err); }
    finally { setWatchlistLoading(false); }
  }, [watchlistLoading, movie, inWatchlist, title, origTitle, year]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchTorrents(title, year, movie.media_type || "movie", origTitle).then((results) => {
      if (active) {
        const safe = results.filter((r) => !isExecutableRelease(r.title, r.magnet) && !isUnsupportedMediaRelease(r.title, r.magnet) && Number(r.seeds ?? 0) > 0);
        setTorrents(safe);
        setLoading(false);
        if (safe.length > 0 && safe[0]?.magnet) {
          fetch(`${API_BASE}/torrserver/prewarm?magnet=${encodeURIComponent(safe[0].magnet)}&title=${encodeURIComponent(title)}`).catch(() => {});
        }
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [title, year, movie.media_type, origTitle]);

  const sortedTorrents = useMemo(() => sortTorrentsByMode(torrents, sortMode), [torrents, sortMode]);

  const currentMediaInfo: PlayerMediaInfo = {
    tmdbId: movie.id, title, originalTitle: origTitle, mediaType: (movie.media_type as any) || "movie",
    year, posterPath: movie.poster_path, backdropPath: movie.backdrop_path, logoPath: movieLogoPath, overview: movie.overview,
  };

  const getOrCreateMediaId = useCallback(async (torrent: TorrentItem, inLibrary: boolean): Promise<number> => {
    const tId = torrent.id || torrent.magnet;
    if (torrentMediaIds[tId]) {
      if (inLibrary) await prepareMediaEntry(torrent, movie, title, year, true);
      return torrentMediaIds[tId];
    }
    const id = await prepareMediaEntry(torrent, movie, title, year, inLibrary);
    setTorrentMediaIds((prev) => ({ ...prev, [tId]: id }));
    return id;
  }, [torrentMediaIds, movie, title, year]);

  const handleWatchOnlineMovie = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setStreamingTorrentId(tId);
    try {
      const mid = await getOrCreateMediaId(torrent, false);
      const streamRes = await rpcPrepareStream(mid, 0, true, torrent.magnet);
      if (streamRes && streamRes.success && (streamRes.stream_url || streamRes.file_path)) {
        if (closeModal) closeModal();
        if (onWatchOnline) {
          const isOnline = streamRes.online !== false && (streamRes.stream_url ? !streamRes.stream_url.includes("file=") : false);
          onWatchOnline(streamRes.stream_url || streamRes.file_path!, streamRes.title || title, streamRes.torrent_hash, isOnline,
            { ...currentMediaInfo, mediaId: mid, duration: streamRes.duration && streamRes.duration > 0 ? streamRes.duration : undefined });
        }
      } else { throw new Error(streamRes?.error || "Не удалось подготовить онлайн поток"); }
    } catch (err: any) { console.error("Ошибка онлайн просмотра:", err); }
    finally { setStreamingTorrentId(null); }
  };

  const handleDownloadTorrent = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setDownloadingTorrentId(tId);
    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcStartDownload(mid);
      if (closeModal) closeModal();
    } catch (err: any) { console.error("Ошибка загрузки:", err); }
    finally { setDownloadingTorrentId(null); }
  };

  const handleDownloadWithMagicBlack = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setDownloadingTorrentId(tId);
    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcStartDownload(mid);
      if (closeModal) closeModal();
      if (onStartMagicBlack) onStartMagicBlack();
    } catch (err: any) { console.error("Ошибка загрузки:", err); }
    finally { setDownloadingTorrentId(null); }
  };

  return {
    title, origTitle, year, rating, ageRating, inWatchlist, watchlistLoading,
    handleToggleWatchlist, torrents, loading, sortMode, setSortMode, handleSortChange,
    sortedTorrents, streamingTorrentId, downloadingTorrentId, focusedTorrentId, setFocusedTorrentId,
    currentMediaInfo, getOrCreateMediaId, handleWatchOnlineMovie, handleDownloadTorrent, handleDownloadWithMagicBlack,
  };
}
