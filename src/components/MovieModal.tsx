import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable, Spinner } from "@decky/ui";
import { FaPlay, FaDownload, FaList, FaSpinner, FaMoon } from "react-icons/fa";
import { PROJACKTOR_STYLES } from "../styles";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { getActiveDocument } from "../runtime/activeDoc";
import {
  MediaItem,
  TorrentItem,
  EpisodeItem,
  searchTorrents,
  rpcAddToLibrary,
  rpcStartDownload,
  rpcPrepareStream,
  rpcGetEpisodes,
  rpcDownloadEpisode,
  formatBytes,
  sortEpisodes,
} from "../api";

interface MovieModalProps {
  movie: MediaItem;
  closeModal?: () => void;
  onWatchOnline?: (filePath: string, title: string, torrentHash?: string) => void;
  onStartMagicBlack?: () => void;
}

export const MovieModal: FC<MovieModalProps> = ({ movie, closeModal, onWatchOnline, onStartMagicBlack }) => {
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // States for fixed-size action icons
  const [streamingTorrentId, setStreamingTorrentId] = useState<string | null>(null);
  const [downloadingTorrentId, setDownloadingTorrentId] = useState<string | null>(null);

  // Series inline episodes state
  const isTv = movie.media_type === "tv";
  const [expandedTorrentId, setExpandedTorrentId] = useState<string | null>(null);
  const [torrentMediaIds, setTorrentMediaIds] = useState<Record<string, number>>({});
  const [episodesMap, setEpisodesMap] = useState<Record<string, EpisodeItem[]>>({});
  const [loadingEpisodesMap, setLoadingEpisodesMap] = useState<Record<string, boolean>>({});
  const [streamingEpIdx, setStreamingEpIdx] = useState<number | null>(null);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);

  const torrentsRef = useRef<HTMLDivElement>(null);
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;

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
      if (e.button === RawButton.B || e.button === 1) {
        triggerClose();
      }
    });

    const doc = getActiveDocument(torrentsRef.current);
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Автоматический фокус на первом доступном действии при завершении загрузки раздач
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const root = torrentsRef.current;
      const firstInteractive = root?.querySelector<HTMLElement>(
        "button, .ds-btn, [tabindex='0'], .projacktor-torrent-card, .projacktor-torrent-item"
      );
      if (firstInteractive) {
        firstInteractive.focus();
        firstInteractive.classList.add("gpfocus");
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [loading, torrents.length]);

  // Helper: Prepare media entry in SQLite without adding to library
  const getOrCreateMediaId = async (torrent: TorrentItem, inLibrary: boolean): Promise<number> => {
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
  };

  // 1. Online stream for movies (does not add to library or write to disk)
  const handleWatchOnlineMovie = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    if (streamingTorrentId || downloadingTorrentId) return;
    setStreamingTorrentId(tId);

    try {
      const mid = await getOrCreateMediaId(torrent, false);
      const streamRes = await rpcPrepareStream(mid);
      if (streamRes && streamRes.success && (streamRes.stream_url || streamRes.file_path)) {
        if (closeModal) closeModal();
        if (onWatchOnline) {
          onWatchOnline(
            streamRes.stream_url || streamRes.file_path!,
            streamRes.title || title,
            streamRes.torrent_hash
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
  const handleToggleEpisodes = async (torrent: TorrentItem) => {
    const tId = torrent.id || torrent.magnet;
    const isCurrentlyOpen = expandedTorrentId === tId;

    if (isCurrentlyOpen) {
      setExpandedTorrentId(null);
      return;
    }

    setExpandedTorrentId(tId);

    if (!episodesMap[tId] || episodesMap[tId].length === 0) {
      setLoadingEpisodesMap((prev) => ({ ...prev, [tId]: true }));
      try {
        const mid = await getOrCreateMediaId(torrent, false);
        const eps = await rpcGetEpisodes(mid);
        if (Array.isArray(eps)) {
          setEpisodesMap((prev) => ({ ...prev, [tId]: sortEpisodes(eps) }));
        }
      } catch (err: any) {
        console.error("Ошибка получения серий:", err);
      } finally {
        setLoadingEpisodesMap((prev) => ({ ...prev, [tId]: false }));
      }
    }
  };

  // 4. Watch single episode online (Requirement 1a & 4: does NOT appear in library)
  const handleWatchEpisodeOnline = async (torrent: TorrentItem, ep: EpisodeItem) => {
    if (streamingEpIdx !== null || downloadingEpIdx !== null) return;
    setStreamingEpIdx(ep.index);
    try {
      const mid = await getOrCreateMediaId(torrent, false);
      const res = await rpcPrepareStream(mid, ep.index);
      if (res && res.success && (res.stream_url || res.file_path)) {
        if (closeModal) closeModal();
        if (onWatchOnline) {
          onWatchOnline(
            res.stream_url || res.file_path!,
            res.title || `${title} - ${ep.name}`,
            res.torrent_hash
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
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 28,
                  gap: 8,
                }}
              >
                <Spinner />
                <span style={{ fontSize: 12, opacity: 0.6 }}>Поиск лучших раздач...</span>
              </div>
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
                    {year && parseInt(year, 10) >= 2025
                      ? "Раздач пока нет в сети"
                      : "Раздач не найдено"}
                  </div>
                  <div>
                    {year && parseInt(year, 10) >= 2025
                      ? `Релиз (${year}) ещё не вышел в цифровом качестве.`
                      : "Для данного релиза не найдено подходящих раздач на трекерах."}
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

                  return (
                    <div key={tId || `${tor.tracker}-${idx}`} className="projacktor-torrent-card">
                      <div className="projacktor-torrent-header-row">
                        <div className="projacktor-torrent-info">
                          <div className="projacktor-torrent-title" title={tor.title}>
                            {tor.title}
                          </div>
                          <div className="projacktor-torrent-meta">
                            {tor.quality && <span className="projacktor-badge-quality">{tor.quality}</span>}
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
                              title="Смотреть онлайн"
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
                            title="Загрузить в библиотеку"
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
                            <div style={{ padding: "8px 4px", fontSize: 11, color: "var(--ds-text-dim)" }}>
                              Получение списка серий из раздачи...
                            </div>
                          ) : episodes.length === 0 ? (
                            <div style={{ padding: "8px 4px", fontSize: 11, color: "var(--ds-text-dim)" }}>
                              Серии загружаются. Подождите пару секунд и нажмите снова.
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
