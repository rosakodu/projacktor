import { useState, useRef, useCallback } from "react";
import { MediaItem, TorrentItem, EpisodeItem, PlayerMediaInfo, rpcGetTorrentEpisodes, rpcDownloadEpisode, rpcPrepareStream, sortEpisodes } from "../../../api";

interface UseEpisodeStateProps {
  movie: MediaItem;
  title: string;
  currentMediaInfo: PlayerMediaInfo;
  getOrCreateMediaId: (torrent: TorrentItem, inLibrary: boolean) => Promise<number>;
  closeModal?: () => void;
  onWatchOnline?: (
    filePath: string,
    title: string,
    torrentHash?: string,
    isOnline?: boolean,
    mediaInfo?: PlayerMediaInfo
  ) => void;
  onStartMagicBlack?: () => void;
}

export function useEpisodeState({
  movie, title, currentMediaInfo, getOrCreateMediaId, closeModal, onWatchOnline, onStartMagicBlack,
}: UseEpisodeStateProps) {
  const [expandedTorrentId, setExpandedTorrentId] = useState<string | null>(null);
  const expandedTorrentIdRef = useRef<string | null>(null);
  expandedTorrentIdRef.current = expandedTorrentId;
  const [episodesMap, setEpisodesMap] = useState<Record<string, EpisodeItem[]>>({});
  const [loadingEpisodesMap, setLoadingEpisodesMap] = useState<Record<string, boolean>>({});
  const [streamingEpIdx, setStreamingEpIdx] = useState<number | null>(null);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);
  const lastEpisodesToggleTimeRef = useRef<number>(0);

  const fetchEpisodesForTorrent = useCallback(
    async (torrent: TorrentItem) => {
      const tId = torrent.id || torrent.magnet;
      setLoadingEpisodesMap((prev) => ({ ...prev, [tId]: true }));
      try {
        const eps = await rpcGetTorrentEpisodes(torrent.magnet, torrent.title || title, movie.poster_path || "");
        if (Array.isArray(eps) && eps.length > 0) {
          setEpisodesMap((prev) => ({ ...prev, [tId]: sortEpisodes(eps) }));
        } else if ((torrent.seeds || 0) > 0) {
          setTimeout(async () => {
            if (expandedTorrentIdRef.current === tId) {
              try {
                const retryEps = await rpcGetTorrentEpisodes(torrent.magnet, torrent.title || title, movie.poster_path || "");
                if (Array.isArray(retryEps) && retryEps.length > 0) {
                  setEpisodesMap((prev) => ({ ...prev, [tId]: sortEpisodes(retryEps) }));
                }
              } catch {}
            }
          }, 3500);
        }
      } catch (err: any) {
        console.error("Ошибка получения серий:", err);
      } finally {
        setLoadingEpisodesMap((prev) => ({ ...prev, [tId]: false }));
      }
    },
    [title, movie.poster_path]
  );

  const handleToggleEpisodes = async (torrent: TorrentItem) => {
    lastEpisodesToggleTimeRef.current = Date.now();
    const tId = torrent.id || torrent.magnet;
    if (expandedTorrentId === tId) {
      setExpandedTorrentId(null);
      return;
    }
    setExpandedTorrentId(tId);
    if (!episodesMap[tId] || episodesMap[tId].length === 0) {
      fetchEpisodesForTorrent(torrent);
    }
  };

  const handleWatchEpisodeOnline = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (Date.now() - lastEpisodesToggleTimeRef.current < 450 || streamingEpIdx !== null || downloadingEpIdx !== null) return;
    setStreamingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, false);
      const res = await rpcPrepareStream(mid, ep.index, true, torrent.magnet);
      if (res && res.success && (res.stream_url || res.file_path)) {
        if (closeModal) closeModal();
        if (onWatchOnline) {
          const isOnline = res.online !== false && (res.stream_url ? !res.stream_url.includes("file=") : false);
          onWatchOnline(res.stream_url || res.file_path!, res.title || `${title} - ${ep.name}`, res.torrent_hash, isOnline, {
            ...currentMediaInfo, mediaId: mid, episodeName: ep.name, episodeNumber: ep.index,
            duration: res.duration && res.duration > 0 ? res.duration : undefined,
          });
        }
      } else { throw new Error(res?.error || "Не удалось подготовить серию"); }
    } catch (err: any) {
      console.error("Ошибка просмотра серии:", err);
    } finally {
      setStreamingEpIdx(null);
    }
  };

  const handleDownloadEpisode = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (Date.now() - lastEpisodesToggleTimeRef.current < 450 || downloadingEpIdx !== null) return;
    setDownloadingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcDownloadEpisode(mid, ep.index);
      if (closeModal) closeModal();
    } catch (err: any) {
      console.error("Ошибка загрузки серии:", err);
    } finally {
      setDownloadingEpIdx(null);
    }
  };

  const handleDownloadEpisodeWithMagicBlack = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (Date.now() - lastEpisodesToggleTimeRef.current < 450 || downloadingEpIdx !== null) return;
    setDownloadingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcDownloadEpisode(mid, ep.index);
      if (closeModal) closeModal();
      if (onStartMagicBlack) onStartMagicBlack();
    } catch (err: any) {
      console.error("Ошибка загрузки серии:", err);
    } finally {
      setDownloadingEpIdx(null);
    }
  };

  return {
    expandedTorrentId, episodesMap, loadingEpisodesMap,
    streamingEpIdx, downloadingEpIdx, fetchEpisodesForTorrent,
    handleToggleEpisodes, handleWatchEpisodeOnline, handleDownloadEpisode,
    handleDownloadEpisodeWithMagicBlack,
  };
}
