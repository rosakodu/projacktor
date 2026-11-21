import { useState, useRef, useCallback } from "react";
import { MediaItem, TorrentItem, EpisodeItem, PlayerMediaInfo, rpcGetEpisodes, rpcGetTorrentEpisodes, rpcDownloadEpisode, sortEpisodes } from "../../../api";

import type { MovieModalProps } from "./types";
import { buildEpisodePlaylist, preparePlaylistEpisode } from "../../../services/episodePlaylist";

interface UseEpisodeStateProps {
  movie: MediaItem;
  title: string;
  currentMediaInfo: PlayerMediaInfo;
  getOrCreateMediaId: (torrent: TorrentItem, inLibrary: boolean) => Promise<number>;
  closeModal?: () => void;
  onWatchOnline?: MovieModalProps["onWatchOnline"];
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
      const episodes = episodesMap[torrent.id || torrent.magnet] || [ep];
      const playlist = buildEpisodePlaylist(episodes, { ...currentMediaInfo, mediaId: mid }, torrent.magnet);
      const current = playlist.find((entry) => entry.episodeIndex === ep.index);
      if (!current) throw new Error("Серия не найдена");
      const [source, libraryEpisodes] = await Promise.all([
        preparePlaylistEpisode(current, true),
        rpcGetEpisodes(mid).catch(() => []),
      ]);
      if (!source) throw new Error("Не удалось подготовить серию");

      const downloaded = new Map(libraryEpisodes.filter((item) => item.downloaded).map((item) => [item.name, item]));
      for (const entry of playlist) {
        const local = downloaded.get(entry.mediaInfo?.episodeName || "");
        if (!local) continue;
        entry.downloaded = true;
        if (local.path.startsWith("/")) entry.filePath = local.path;
      }
      current.filePath = source.filePath;
      closeModal?.();
      onWatchOnline?.(source.filePath, current.title, source.torrentHash, source.isOnline, source.mediaInfo, playlist);
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
