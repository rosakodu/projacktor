import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable, Spinner } from "@decky/ui";
import { FaPlay, FaDownload, FaList, FaSpinner, FaMoon, FaBookmark, FaCheck } from "react-icons/fa";
import { PROJACKTOR_STYLES } from "../styles";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setMovieModalActive, isPlayerActive } from "../runtime/homeInputBus";
import {
  MediaItem,
  TorrentItem,
  EpisodeItem,
  PlayerMediaInfo,
  searchTorrents,
  rpcAddToLibrary,
  rpcStartDownload,
  rpcPrepareStream,
  rpcGetEpisodes,
  rpcDownloadEpisode,
  rpcAddToWatchlist,
  rpcRemoveFromWatchlist,
  rpcIsInWatchlist,
  formatBytes,
  sortEpisodes,
} from "../api";
import { useI18n } from "../i18n";

interface MovieModalProps {
  movie: MediaItem;
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

export const MovieModal: FC<MovieModalProps> = ({ movie, closeModal, onWatchOnline, onStartMagicBlack }) => {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // States for fixed-size action icons
  const [streamingTorrentId, setStreamingTorrentId] = useState<string | null>(null);
  const [downloadingTorrentId, setDownloadingTorrentId] = useState<string | null>(null);

  // Series inline episodes state
  const isTv = movie.media_type === "tv";
  const [expandedTorrentId, setExpandedTorrentId] = useState<string | null>(null);
  const expandedTorrentIdRef = useRef<string | null>(null);
  expandedTorrentIdRef.current = expandedTorrentId;
  const [torrentMediaIds, setTorrentMediaIds] = useState<Record<string, number>>({});
  const [episodesMap, setEpisodesMap] = useState<Record<string, EpisodeItem[]>>({});
  const [loadingEpisodesMap, setLoadingEpisodesMap] = useState<Record<string, boolean>>({});
  const [streamingEpIdx, setStreamingEpIdx] = useState<number | null>(null);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);

  const torrentsRef = useRef<HTMLDivElement>(null);
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;

  useEffect(() => {
    setMovieModalActive(true);
    return () => {
      setMovieModalActive(false);
    };
  }, []);

  // Обработка кнопки B геймпада и клавиш Escape/Backspace для выхода из модалки
  useEffect(() => {
    let lastCloseAt = 0;
    const triggerClose = () => {
      const now = Date.now();
      if (now - lastCloseAt < 250) return;
      lastCloseAt = now;
      if (closeModalRef.current) {
        closeModalRef.current();
      }
    };

    const un = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (isPlayerActive()) return;
      if (e.button === RawButton.B || e.button === 1) {
        triggerClose();
      }
    });

    const doc = getActiveDocument(torrentsRef.current);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPlayerActive()) return;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        triggerClose();
      }
    };

    if (doc) {
      doc.addEventListener("keydown", handleKeyDown, true);
    }

    return () => {
      un();
      if (doc) {
        doc.removeEventListener("keydown", handleKeyDown, true);
      }
    };
  }, []);

  const handleTorrentFocus = useCallback((e: FocusEvent) => {
    const item = (e.target as HTMLElement)?.closest?.(".projacktor-torrent-card, .projacktor-torrent-item") as HTMLElement | null;
    const container = torrentsRef.current;
    if (item && container) {
      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      if (itemRect.top < containerRect.top) {
        container.scrollTop -= (containerRect.top - itemRect.top + 6);
      } else if (itemRect.bottom > containerRect.bottom) {
        container.scrollTop += (itemRect.bottom - containerRect.bottom + 6);
      }
    }
  }, []);

  const title = movie.title || movie.name || "Без названия";
  const origTitle = movie.original_title || movie.original_name || "";
  const date = movie.release_date || movie.first_air_date || "";
  const year = date ? String(date).split("-")[0] : "";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null;

  const [inWatchlist, setInWatchlist] = useState<boolean>(false);
  const [watchlistLoading, setWatchlistLoading] = useState<boolean>(false);

  useEffect(() => {
    if (movie.id) {
      rpcIsInWatchlist(movie.id).then((inList) => setInWatchlist(!!inList)).catch(() => {});
    }
  }, [movie.id]);

  const handleToggleWatchlist = useCallback(async () => {
    if (watchlistLoading || !movie.id) return;
    setWatchlistLoading(true);
    playNavSound();
    try {
      if (inWatchlist) {
        await rpcRemoveFromWatchlist(movie.id);
        setInWatchlist(false);
      } else {
        await rpcAddToWatchlist(
          JSON.stringify({
            tmdb_id: movie.id,
            title,
            original_title: origTitle,
            media_type: movie.media_type || "movie",
            year,
            overview: movie.overview || "",
            poster_path: movie.poster_path || "",
            backdrop_path: movie.backdrop_path || "",
            vote_average: movie.vote_average || 0,
          })
        );
        setInWatchlist(true);
      }
    } catch (err) {
      console.error("Failed to toggle watchlist:", err);
    } finally {
      setWatchlistLoading(false);
    }
  }, [watchlistLoading, movie, inWatchlist, title, origTitle, year]);

  const currentMediaInfo: PlayerMediaInfo = {
    tmdbId: movie.id,
    title,
    originalTitle: origTitle,
    mediaType: (movie.media_type as any) || "movie",
    year,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    overview: movie.overview,
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchTorrents(title, year, movie.media_type || "movie", origTitle)
      .then((results) => {
        if (active) {
          setTorrents(results);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [title, year, movie.media_type, origTitle]);

  // Автоматический фокус на кнопке «В избранное» при открытии модального окна
  useEffect(() => {
    const focusWatchlistBtn = () => {
      const doc = getActiveDocument(torrentsRef.current) || document;
      const btn = doc.querySelector<HTMLElement>(".projacktor-watchlist-btn");
      if (btn) {
        doc.querySelectorAll(".gpfocus").forEach((el) => {
          if (el !== btn) el.classList.remove("gpfocus");
        });
        btn.focus();
        btn.classList.add("gpfocus");
        btn.classList.add("gpfocuswithin");
        try {
          (btn as any).TakeFocus?.(0);
        } catch {}
        return true;
      }
      return false;
    };

    let cancelled = false;
    let timerId: any = null;
    const delays = [40, 120];
    let idx = 0;

    const scheduleNext = () => {
      if (cancelled || idx >= delays.length) return;
      const delay = delays[idx++];
      timerId = setTimeout(() => {
        if (cancelled) return;
        const focused = focusWatchlistBtn();
        if (!focused) scheduleNext();
      }, delay);
    };

    if (!focusWatchlistBtn()) {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId as any);
    };
  }, []);

  // Фокус на первом доступном действии раздач только если фокус был потерян
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const root = torrentsRef.current;
      if (!root) return;
      const doc = getActiveDocument(root) || document;
      const active = doc.activeElement;
      // Если фокус уже на кнопке «В избранное» или внутри модального окна — не перебиваем его
      if (active && (active.classList.contains("projacktor-watchlist-btn") || active.closest(".projacktor-watchlist-btn") || root.contains(active))) {
        return;
      }
      const firstAction = root.querySelector<HTMLElement>(
        ".projacktor-torrent-actions .projacktor-icon-btn, .projacktor-icon-btn, .projacktor-torrent-ep-row, .ds-btn--primary, .ds-btn, button, [tabindex='0']"
      );
      if (firstAction) {
        doc.querySelectorAll(".gpfocus").forEach((el) => {
          if (el !== firstAction) el.classList.remove("gpfocus");
        });
        firstAction.focus();
        firstAction.classList.add("gpfocus");
        firstAction.classList.add("gpfocuswithin");
        try {
          (firstAction as any).TakeFocus?.(0);
        } catch {}
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [loading, torrents.length]);

  // Helper: Prepare media entry in SQLite without adding to library
  const getOrCreateMediaId = useCallback(
    async (torrent: TorrentItem, inLibrary: boolean): Promise<number> => {
      const tId = torrent.id || torrent.magnet;
      if (torrentMediaIds[tId]) {
        if (inLibrary) {
          // Upgrade to in_library = true
          await rpcAddToLibrary(
            JSON.stringify({
              magnet: torrent.magnet,
              tmdb_id: movie.id,
              title,
              year,
              media_type: movie.media_type || "movie",
              quality: torrent.quality || "",
              torrent_title: torrent.title || `${title} (${torrent.quality || ""})`.trim(),
              poster_path: movie.poster_path || "",
              backdrop_path: movie.backdrop_path || "",
              overview: movie.overview || "",
              in_library: true,
            })
          );
        }
        return torrentMediaIds[tId];
      }

      const payload = {
        magnet: torrent.magnet,
        tmdb_id: movie.id,
        title,
        year,
        media_type: movie.media_type || "movie",
        quality: torrent.quality || "",
        torrent_title: torrent.title || `${title} (${torrent.quality || ""})`.trim(),
        poster_path: movie.poster_path || "",
        backdrop_path: movie.backdrop_path || "",
        overview: movie.overview || "",
        in_library: inLibrary,
      };

      const res = await rpcAddToLibrary(JSON.stringify(payload));
      if (!res || !res.success || !res.id) {
        throw new Error(res?.error || "Не удалось инициализировать медиа");
      }
      setTorrentMediaIds((prev) => ({ ...prev, [tId]: res.id! }));
      return res.id!;
    },
    [torrentMediaIds, movie, title, year]
  );

  // 1. Online stream for movies (does not add to library or write to disk)
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
          onWatchOnline(
            streamRes.stream_url || streamRes.file_path!,
            streamRes.title || title,
            streamRes.torrent_hash,
            isOnline,
            { ...currentMediaInfo, mediaId: mid, duration: streamRes.duration && streamRes.duration > 0 ? streamRes.duration : undefined }
          );
        }
      } else {
        throw new Error(streamRes?.error || "Не удалось подготовить онлайн поток");
      }
    } catch (err: any) {
      console.error("Ошибка онлайн просмотра:", err);
    } finally {
      setStreamingTorrentId(null);
    }
  };

  // 2. Download torrent (appears in library and starts downloading immediately)
  const handleDownloadTorrent = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setDownloadingTorrentId(tId);

    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcStartDownload(mid);
      if (closeModal) closeModal();
    } catch (err: any) {
      console.error("Ошибка загрузки:", err);
    } finally {
      setDownloadingTorrentId(null);
    }
  };

  // 3. Toggle episodes inline for TV series (Requirement 1a)
  const fetchEpisodesForTorrent = useCallback(
    async (torrent: TorrentItem) => {
      const tId = torrent.id || torrent.magnet;
      setLoadingEpisodesMap((prev) => ({ ...prev, [tId]: true }));
      try {
        const mid = await getOrCreateMediaId(torrent, false);
        const eps = await rpcGetEpisodes(mid);
        if (Array.isArray(eps) && eps.length > 0) {
          setEpisodesMap((prev) => ({ ...prev, [tId]: sortEpisodes(eps) }));
        } else if ((torrent.seeds || 0) > 0) {
          // Фоновый авто-повтор через 3.5 сек, только если у раздачи есть сиды
          setTimeout(async () => {
            if (expandedTorrentIdRef.current === tId) {
              try {
                const retryEps = await rpcGetEpisodes(mid);
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
    [getOrCreateMediaId]
  );

  const handleToggleEpisodes = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    const isCurrentlyOpen = expandedTorrentId === tId;

    if (isCurrentlyOpen) {
      setExpandedTorrentId(null);
      return;
    }

    setExpandedTorrentId(tId);

    if (!episodesMap[tId] || episodesMap[tId].length === 0) {
      fetchEpisodesForTorrent(torrent);
    }
  };

  // 4. Watch single episode online (Requirement 1a & 4: does NOT appear in library)
  const handleWatchEpisodeOnline = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (streamingEpIdx !== null || downloadingEpIdx !== null) return;
    setStreamingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, false);
      const res = await rpcPrepareStream(mid, ep.index, true, torrent.magnet);
      if (res && res.success && (res.stream_url || res.file_path)) {
        if (closeModal) closeModal();
        if (onWatchOnline) {
          const isOnline = res.online !== false && (res.stream_url ? !res.stream_url.includes("file=") : false);
          onWatchOnline(
            res.stream_url || res.file_path!,
            res.title || `${title} - ${ep.name}`,
            res.torrent_hash,
            isOnline,
            {
              ...currentMediaInfo,
              mediaId: mid,
              episodeName: ep.name,
              episodeNumber: ep.index,
              duration: res.duration && res.duration > 0 ? res.duration : undefined,
            }
          );
        }
      } else {
        throw new Error(res?.error || "Не удалось подготовить серию");
      }
    } catch (err: any) {
      console.error("Ошибка просмотра серии:", err);
    } finally {
      setStreamingEpIdx(null);
    }
  };

  // 2b. Download torrent with MagicBlack OLED screen-off mode
  const handleDownloadWithMagicBlack = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setDownloadingTorrentId(tId);

    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcStartDownload(mid);
      if (closeModal) closeModal();
      if (onStartMagicBlack) {
        onStartMagicBlack();
      }
    } catch (err: any) {
      console.error("Ошибка загрузки:", err);
    } finally {
      setDownloadingTorrentId(null);
    }
  };

  // 5. Download single episode (appears in library and begins downloading)
  const handleDownloadEpisode = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (downloadingEpIdx !== null) return;
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

  // 5b. Download single episode with MagicBlack OLED screen-off mode
  const handleDownloadEpisodeWithMagicBlack = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (downloadingEpIdx !== null) return;
    setDownloadingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, true);
      await rpcDownloadEpisode(mid, ep.index);
      if (closeModal) closeModal();
      if (onStartMagicBlack) {
        onStartMagicBlack();
      }
    } catch (err: any) {
      console.error("Ошибка загрузки серии:", err);
    } finally {
      setDownloadingEpIdx(null);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal} bAllowFullSize={false} bHideCloseIcon={true}>
      <Focusable
        className="projacktor-modal-root"
        style={{ margin: "auto", alignSelf: "center" }}
        onCancelButton={closeModal}
      >
        <style>{PROJACKTOR_STYLES}</style>
        {/* Clean Info Header without poster or backdrop */}
        <div
          style={{
            padding: "8px 12px 6px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 10.5,
                opacity: 0.85,
                alignItems: "center",
              }}
            >
              {year && <span>{year}</span>}
              {rating && <span style={{ color: "#fbbf24", fontWeight: 700 }}>★ {rating}</span>}
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: 9,
                  padding: "1px 4px",
                  background: "rgba(255,255,255,0.1)",
                  fontWeight: 600,
                  letterSpacing: 0.4,
                }}
              >
                {movie.media_type === "tv" ? "Сериал" : "Фильм"}
              </span>
            </div>

            {/* Compact 2-line description */}
            {movie.overview && (
              <div
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.25,
                  color: "rgba(255,255,255,0.7)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  maxHeight: 28,
                }}
              >
                {movie.overview}
              </div>
            )}
          </div>

          {/* Кнопка добавления в избранное */}
          <Focusable
            className={`ds-btn projacktor-watchlist-btn ${inWatchlist ? "active" : ""}`}
            noFocusRing
            tabIndex={0}
            onClick={handleToggleWatchlist}
            onActivate={handleToggleWatchlist}
            onGamepadDirection={(evt: any) => {
              const btn = evt?.detail?.button;
              if (btn === 10 || evt?.detail?.dir === "down") {
                const root = torrentsRef.current;
                const firstAction = root?.querySelector<HTMLElement>(
                  ".projacktor-torrent-actions .projacktor-icon-btn, .projacktor-icon-btn, .projacktor-torrent-ep-row, .ds-btn--primary, .ds-btn, button, [tabindex='0']"
                );
                if (firstAction) {
                  try {
                    evt?.preventDefault?.();
                    evt?.stopPropagation?.();
                  } catch {}
                  const doc = getActiveDocument(firstAction) || document;
                  doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                  firstAction.focus();
                  firstAction.classList.add("gpfocus");
                  firstAction.classList.add("gpfocuswithin");
                  return false;
                }
              }
              return undefined;
            }}
            title={inWatchlist ? t("removeFromWatchlist") : t("addToWatchlist")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
              alignSelf: "flex-start",
              background: inWatchlist ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.08)",
              border: inWatchlist ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
              color: inWatchlist ? "#4ade80" : "#fff",
              transition: "all 0.15s ease",
            }}
          >
            {inWatchlist ? <FaCheck size={10} /> : <FaBookmark size={10} />}
            <span>{inWatchlist ? t("inWatchlist") : t("addToWatchlist")}</span>
          </Focusable>
        </div>

        {/* Torrents Section */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 120,
            overflow: "hidden",
            padding: "4px 12px 8px 12px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#fff",
            }}
          >
            <span>Раздачи</span>
            {torrents.length > 0 && (
              <span style={{ fontSize: 10, opacity: 0.5 }}>Найдено: {torrents.length}</span>
            )}
          </div>

          <div ref={torrentsRef} onFocusCapture={handleTorrentFocus as any} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: "2px 6px" }}>
            {loading ? (
              <Focusable
                noFocusRing
                className="projacktor-torrents-loading-box"
                tabIndex={0}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 28,
                  gap: 8,
                  outline: "none",
                }}
              >
                <Spinner />
                <span style={{ fontSize: 12, opacity: 0.6 }}>Поиск лучших раздач...</span>
              </Focusable>
            ) : torrents.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 16px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 12,
                  lineHeight: "1.4",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 3 }}>
                    Раздач пока нет в сети
                  </div>
                  <div style={{ color: "rgba(255, 255, 255, 0.6)" }}>
                    Для данного релиза не найдено подходящих раздач на трекерах (включая TS и цифровые релизы).
                  </div>
                </div>
                {closeModal && (
                  <Focusable
                    className="ds-btn ds-btn--primary"
                    onClick={closeModal}
                    onActivate={closeModal}
                    style={{ padding: "6px 20px", fontSize: 12 }}
                  >
                    Закрыть
                  </Focusable>
                )}
              </div>
            ) : (
              <Focusable noFocusRing className="projacktor-torrents-list">
                {torrents.map((tor, idx) => {
                  const tId = tor.id || tor.magnet;
                  const isCurrentStream = streamingTorrentId === tId;
                  const isCurrentDl = downloadingTorrentId === tId;
                  const isExpanded = expandedTorrentId === tId;
                  const episodes = episodesMap[tId] || [];
                  const isEpLoading = !!loadingEpisodesMap[tId];
                  const primaryTracker = tor.tracker ? tor.tracker.split(",")[0].trim() : "";
                  const isScreener =
                    tor.quality &&
                    (tor.quality.startsWith("TS") ||
                      tor.quality.startsWith("CAM") ||
                      tor.quality.startsWith("TC"));

                  return (
                    <div key={tId || `${tor.tracker}-${idx}`} className="projacktor-torrent-card">
                      <div className="projacktor-torrent-header-row">
                        <div className="projacktor-torrent-info">
                          <div className="projacktor-torrent-title" title={tor.title}>
                            {tor.title}
                          </div>
                          <div className="projacktor-torrent-meta">
                            {tor.quality && (
                              <span
                                className={`projacktor-badge-quality ${
                                  isScreener ? "projacktor-badge-quality--screener" : ""
                                }`}
                              >
                                {tor.quality}
                              </span>
                            )}
                            {tor.size && <span style={{ fontWeight: 600, color: "#fff" }}>{tor.size}</span>}
                            <span className="projacktor-torrent-seeds">↑ {tor.seeds}</span>
                            <span className="projacktor-torrent-peers">↓ {tor.peers}</span>
                            {primaryTracker && (
                              <span
                                style={{
                                  opacity: 0.6,
                                  maxWidth: 110,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {primaryTracker}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Strict Fixed-Size Action Buttons (Requirement 1 & 1b) */}
                        <Focusable flow-children="horizontal" noFocusRing className="projacktor-torrent-actions">
                          {isTv ? (
                            /* TV Series: Toggle Episodes button */
                            <Focusable
                              className={`projacktor-icon-btn ${isExpanded ? "projacktor-icon-btn--primary" : ""}`}
                              noFocusRing
                              onActivate={() => handleToggleEpisodes(tor)}
                              onClick={() => handleToggleEpisodes(tor)}
                              title={isExpanded ? "Скрыть серии" : "Выбор серии"}
                            >
                              {isEpLoading ? (
                                <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                              ) : (
                                <FaList />
                              )}
                            </Focusable>
                          ) : (
                            /* Movies: Direct Watch Online button */
                            <Focusable
                              className="projacktor-icon-btn projacktor-icon-btn--primary"
                              noFocusRing
                              onActivate={() => handleWatchOnlineMovie(tor)}
                              onClick={() => handleWatchOnlineMovie(tor)}
                              title={t("watchOnline")}
                            >
                              {isCurrentStream ? (
                                <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                              ) : (
                                <FaPlay style={{ marginLeft: 1 }} />
                              )}
                            </Focusable>
                          )}

                          {/* Universal Download Button (Strict fixed 30x30, no text) */}
                          <Focusable
                            className="projacktor-icon-btn"
                            noFocusRing
                            onActivate={() => handleDownloadTorrent(tor)}
                            onClick={() => handleDownloadTorrent(tor)}
                            title={t("download")}
                          >
                            {isCurrentDl ? (
                              <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                            ) : (
                              <FaDownload />
                            )}
                          </Focusable>

                          {/* Download with screen-off (OLED background) */}
                          <Focusable
                            className="projacktor-icon-btn projacktor-magicblack-btn"
                            noFocusRing
                            onActivate={() => handleDownloadWithMagicBlack(tor)}
                            onClick={() => handleDownloadWithMagicBlack(tor)}
                            title="Скачать с выключенным экраном"
                          >
                            <FaMoon style={{ fontSize: 11 }} />
                          </Focusable>
                        </Focusable>
                      </div>

                      {/* Inline Episode Selection for TV Series (Requirement 1a) */}
                      {isTv && isExpanded && (
                        <div className="projacktor-torrent-episodes">
                          {isEpLoading ? (
                            <div style={{ padding: "8px 4px", fontSize: 11, color: "var(--ds-text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
                              <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                              <span>Подключение к сидерам и загрузка серий...</span>
                            </div>
                          ) : episodes.length === 0 ? (
                            <div style={{ padding: "8px 4px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                              {(tor.seeds || 0) === 0 ? (
                                <span style={{ color: "#ff7875" }}>
                                  Раздача недоступна: 0 сидеров в сети (↑). Выберите раздачу с сидами.
                                </span>
                              ) : (
                                <>
                                  <span style={{ color: "var(--ds-text-dim)" }}>
                                    Не удалось получить список серий (таймаут ответа сидеров).
                                  </span>
                                  <Focusable
                                    className="ds-btn ds-btn--compact ds-btn--primary"
                                    noFocusRing
                                    onActivate={() => fetchEpisodesForTorrent(tor)}
                                    onClick={() => fetchEpisodesForTorrent(tor)}
                                    style={{ padding: "3px 12px", fontSize: 10, flexShrink: 0 }}
                                  >
                                    Повторить
                                  </Focusable>
                                </>
                              )}
                            </div>
                          ) : (
                            episodes.map((ep) => {
                              const isEpStreaming = streamingEpIdx === ep.index;
                              const isEpDownloading = downloadingEpIdx === ep.index;
                              return (
                                <div key={ep.index} className="projacktor-torrent-ep-row">
                                  <div className="projacktor-torrent-ep-title" title={ep.name}>
                                    {ep.name}
                                  </div>
                                  <Focusable flow-children="horizontal" noFocusRing style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, color: "var(--ds-text-dim)", marginRight: 2 }}>
                                      {formatBytes(ep.size)}
                                    </span>
                                    {/* Watch episode online (Fixed 26x26) */}
                                    <Focusable
                                      className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-icon-btn--primary"
                                      noFocusRing
                                      onActivate={() => handleWatchEpisodeOnline(tor, ep)}
                                      onClick={() => handleWatchEpisodeOnline(tor, ep)}
                                      title="Смотреть серию онлайн"
                                    >
                                      {isEpStreaming ? (
                                        <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                                      ) : (
                                        <FaPlay style={{ fontSize: 9, marginLeft: 1 }} />
                                      )}
                                    </Focusable>
                                    {/* Download episode (Fixed 26x26) */}
                                    <Focusable
                                      className="projacktor-icon-btn projacktor-icon-btn--compact"
                                      noFocusRing
                                      onActivate={() => handleDownloadEpisode(tor, ep)}
                                      onClick={() => handleDownloadEpisode(tor, ep)}
                                      title="Загрузить серию"
                                    >
                                      {isEpDownloading ? (
                                        <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
                                      ) : (
                                        <FaDownload style={{ fontSize: 9 }} />
                                      )}
                                    </Focusable>
                                    {/* Download episode with screen-off */}
                                    <Focusable
                                      className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-magicblack-btn"
                                      noFocusRing
                                      onActivate={() => handleDownloadEpisodeWithMagicBlack(tor, ep)}
                                      onClick={() => handleDownloadEpisodeWithMagicBlack(tor, ep)}
                                      title="Скачать серию с выключенным экраном"
                                    >
                                      <FaMoon style={{ fontSize: 9 }} />
                                    </Focusable>
                                  </Focusable>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Focusable>
            )}
          </div>
        </div>
      </Focusable>
    </ModalRoot>
  );
};
