import { useState, useEffect, useCallback, useRef } from "react";
import { toaster } from "@decky/api";
import {
  LibraryItem,
  EpisodeItem,
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

export function useLibrary(onPlayVideo?: (filePath: string, title: string, isOnline: boolean) => void) {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshLibrary();
    const interval = setInterval(() => {
      refreshLibrary();
    }, 2500);
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
        toaster.toast({
          title: item.title,
          body: "Загрузка начата",
          duration: 2500,
        });
        await rpcStartDownload(item.id);
        refreshLibrary();
      } catch (err: any) {
        toaster.toast({
          title: "Ошибка",
          body: String(err?.message || "Не удалось начать загрузку"),
        });
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
        } catch {
          toaster.toast({ title: "Ошибка", body: "Не удалось получить список серий" });
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
        toaster.toast({
          title: item.title,
          body: `Загрузка: ${ep.name}`,
          duration: 3000,
        });
        await rpcDownloadEpisode(item.id, ep.index);
        refreshLibrary();
        const eps = await rpcGetEpisodes(item.id);
        if (mountedRef.current && Array.isArray(eps)) {
          setEpisodesMap((prev) => ({ ...prev, [item.id]: sortEpisodes(eps) }));
        }
      } catch (err: any) {
        toaster.toast({
          title: "Ошибка",
          body: String(err?.message || "Не удалось начать загрузку серии"),
        });
      }
    },
    [refreshLibrary]
  );

  const watchOnline = useCallback(
    async (item: LibraryItem, fileIndex?: number) => {
      setStreamLoading(item.id);
      try {
        const res = await rpcPrepareStream(item.id, fileIndex);
        if (res && res.success && res.file_path) {
          if (onPlayVideo) {
            onPlayVideo(res.file_path, res.title || item.title, true);
          }
        } else if (res && !res.success && res.error) {
          toaster.toast({
            title: "Ошибка",
            body: res.error,
            duration: 3500,
          });
        }
      } catch (err: any) {
        toaster.toast({
          title: "Ошибка запуска",
          body: String(err?.message || "Не удалось запустить онлайн просмотр"),
        });
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
