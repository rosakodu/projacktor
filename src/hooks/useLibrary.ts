import { useState, useEffect, useCallback, useRef } from "react";
import {
  LibraryItem,
  EpisodeItem,
  PlayerMediaInfo,
  rpcGetLibrary,
  rpcPauseDownload,
  rpcResumeDownload,
  rpcResumeAllDownloads,
  rpcDeleteLibraryItem,
  rpcStartDownload,
  rpcGetEpisodes,
  rpcDownloadEpisode,
  rpcPrepareStream,
  sortEpisodes,
} from "../api";

export function useLibrary(
  onPlayVideo?: (
    filePath: string,
    title: string,
    isOnline: boolean,
    torrentHash?: string,
    mediaInfo?: PlayerMediaInfo,
    initialTime?: number
  ) => void
) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});
  const [episodesMap, setEpisodesMap] = useState<Record<number, EpisodeItem[]>>({});
  const [episodesLoading, setEpisodesLoading] = useState<Record<number, boolean>>({});
  const [streamLoading, setStreamLoading] = useState<number | null>(null);

  const mountedRef = useRef<boolean>(true);

  const refreshLibrary = useCallback(() => {
    rpcGetLibrary()
      .then((lib) => {
        if (mountedRef.current && Array.isArray(lib)) {
          setLibrary(lib);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) {
          setIsInitialLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshLibrary();
    const interval = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        refreshLibrary();
      }
    }, 1500);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refreshLibrary]);

  const pauseDownload = useCallback(
    async (id: number) => {
      await rpcPauseDownload(id);
      refreshLibrary();
    },
    [refreshLibrary]
  );

  const resumeDownload = useCallback(
    async (id: number) => {
      await rpcResumeDownload(id);
      refreshLibrary();
    },
    [refreshLibrary]
  );

  const resumeAllDownloads = useCallback(
    async () => {
      await rpcResumeAllDownloads();
      refreshLibrary();
    },
    [refreshLibrary]
  );

  const deleteItem = useCallback(
    async (id: number) => {
      await rpcDeleteLibraryItem(id);
      refreshLibrary();
    },
    [refreshLibrary]
  );

  const startDownload = useCallback(
    async (item: LibraryItem) => {
      try {
        await rpcStartDownload(item.id);
        refreshLibrary();
      } catch (err: any) {
        console.error("Не удалось начать загрузку:", err);
      }
    },
    [refreshLibrary]
  );

  const toggleEpisodes = useCallback(
    async (item: LibraryItem) => {
      const isCurrentlyOpen = !!expandedEpisodes[item.id];
      setExpandedEpisodes((prev) => ({ ...prev, [item.id]: !isCurrentlyOpen }));

      if (!isCurrentlyOpen && (!episodesMap[item.id] || episodesMap[item.id].length === 0)) {
        setEpisodesLoading((prev) => ({ ...prev, [item.id]: true }));
        try {
          const eps = await rpcGetEpisodes(item.id);
          if (mountedRef.current) {
            setEpisodesMap((prev) => ({ ...prev, [item.id]: sortEpisodes(eps) }));
          }
        } catch (err) {
          console.error("Не удалось получить список серий:", err);
        } finally {
          if (mountedRef.current) {
            setEpisodesLoading((prev) => ({ ...prev, [item.id]: false }));
          }
        }
      }
    },
    [expandedEpisodes, episodesMap]
  );

  const downloadEpisode = useCallback(
    async (item: LibraryItem, ep: EpisodeItem) => {
      try {
        await rpcDownloadEpisode(item.id, ep.index);
        refreshLibrary();
        const eps = await rpcGetEpisodes(item.id);
        if (mountedRef.current && Array.isArray(eps)) {
          setEpisodesMap((prev) => ({ ...prev, [item.id]: sortEpisodes(eps) }));
        }
      } catch (err: any) {
        console.error("Не удалось начать загрузку серии:", err);
      }
    },
    [refreshLibrary]
  );

  const watchOnline = useCallback(
    async (item: LibraryItem, fileIndex?: number) => {
      setStreamLoading(item.id);
      try {
        const res = await rpcPrepareStream(item.id, fileIndex);
        if (res && res.success && (res.stream_url || res.file_path)) {
          if (onPlayVideo) {
            const isOnlineStream = res.online !== false && (res.stream_url ? !res.stream_url.includes("file=") : false);
            const mediaInfo: PlayerMediaInfo = {
              tmdbId: item.tmdb_id,
              title: item.title,
              mediaType: (item.media_type as any) || "movie",
              year: item.year,
              posterPath: item.poster_path,
              backdropPath: item.backdrop_path,
              overview: item.overview,
            };
            onPlayVideo(res.stream_url || res.file_path!, res.title || item.title, isOnlineStream, res.torrent_hash, mediaInfo);
          }
        } else if (res && !res.success && res.error) {
          console.error("Ошибка подготовки онлайн потока:", res.error);
        }
      } catch (err: any) {
        console.error("Не удалось запустить онлайн просмотр:", err);
      } finally {
        if (mountedRef.current) {
          setStreamLoading(null);
        }
      }
    },
    [onPlayVideo]
  );

  return {
    library,
    isInitialLoading,
    expandedEpisodes,
    episodesMap,
    episodesLoading,
    streamLoading,
    refreshLibrary,
    pauseDownload,
    resumeDownload,
    resumeAllDownloads,
    deleteItem,
    startDownload,
    toggleEpisodes,
    downloadEpisode,
    watchOnline,
  };
}
