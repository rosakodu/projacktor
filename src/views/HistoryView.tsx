import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaDownload, FaTrash, FaHistory, FaSpinner } from "react-icons/fa";
import { WatchHistoryItem, MediaItem, PlayerMediaInfo } from "../types";
import {
  rpcGetWatchHistory,
  rpcDeleteWatchHistoryItem,
  rpcClearWatchHistory,
  rpcStartHistoryDownload,
  getImageUrl,
} from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";

interface HistoryViewProps {
  onPlayVideo: (
    filePath: string,
    title: string,
    isOnline: boolean,
    torrentHash?: string,
    mediaInfo?: PlayerMediaInfo,
    initialTime?: number
  ) => void;
}

const NAV_COOLDOWN_MS = 110;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function scrollCardHorizontal(row: HTMLElement | null, card: HTMLElement | null) {
  if (!row || !card) return;
  const target = card.offsetLeft - row.clientWidth / 2 + card.offsetWidth / 2;
  const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
  const final = Math.max(0, Math.min(target, maxScroll));
  row.scrollTo({ left: final, behavior: "smooth" });
}

export const HistoryView: FC<HistoryViewProps> = memo(({ onPlayVideo }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingIds, setDownloadingIds] = useState<Record<number, boolean>>({});
  const lastNavAtRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await rpcGetWatchHistory();
      if (mountedRef.current && Array.isArray(data)) {
        setItems(data);
      }
    } catch (e) {
      console.error("HistoryView refresh error:", e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshHistory();
    const interval = setInterval(refreshHistory, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refreshHistory]);

  // Сброс бэкдропа при монтировании, если история пуста
  useEffect(() => {
    if (items.length === 0) {
      setBackdropMovie(null, true);
    }
  }, [items.length]);

  const handleResume = useCallback(
    (item: WatchHistoryItem) => {
      playNavSound();
      const isDownloaded = Boolean(item.is_downloaded && item.file_path);
      const path = isDownloaded
        ? item.file_path!
        : (item.stream_url || item.file_path || "");
      if (!path) return;

      const mediaInfo: PlayerMediaInfo = {
        mediaId: item.media_id,
        tmdbId: item.tmdb_id,
        title: item.title,
        originalTitle: item.original_title,
        mediaType: item.media_type,
        year: item.year,
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        overview: item.overview,
        episodeName: item.episode_name,
        seasonNumber: item.season_number,
        episodeNumber: item.episode_number,
      };

      const fullTitle = item.episode_name
        ? `${item.title} - ${item.episode_name}`
        : item.title;

      onPlayVideo(
        path,
        fullTitle,
        isDownloaded ? false : Boolean(item.is_online),
        item.torrent_hash,
        mediaInfo,
        item.current_time
      );
    },
    [onPlayVideo]
  );

  const handleDownload = useCallback(
    async (item: WatchHistoryItem, e?: any) => {
      if (e) {
        try {
          e.stopPropagation();
          e.preventDefault();
        } catch {}
      }
      if (downloadingIds[item.id]) return;
      playNavSound();
      setDownloadingIds((prev) => ({ ...prev, [item.id]: true }));
      try {
        const res = await rpcStartHistoryDownload(item.id);
        if (res && res.success) {
          refreshHistory();
        }
      } catch (err) {
        console.error("Failed to start download from history:", err);
      } finally {
        setTimeout(() => {
          if (mountedRef.current) {
            setDownloadingIds((prev) => ({ ...prev, [item.id]: false }));
            refreshHistory();
          }
        }, 1500);
      }
    },
    [downloadingIds, refreshHistory]
  );

  const handleDelete = useCallback(async (id: number, e?: any) => {
    if (e) {
      try {
        e.stopPropagation();
        e.preventDefault();
      } catch {}
    }
    playNavSound();
    try {
      await rpcDeleteWatchHistoryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Failed to delete watch history item:", err);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    playNavSound();
    try {
      await rpcClearWatchHistory();
      setItems([]);
      setBackdropMovie(null, true);
    } catch (err) {
      console.error("Failed to clear watch history:", err);
    }
  }, []);

  const handleCardFocus = useCallback((item: WatchHistoryItem, cardEl: HTMLElement | null) => {
    const mediaItem: MediaItem = {
      id: item.tmdb_id || item.id,
      title: item.title,
      original_title: item.original_title,
      release_date: item.year,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      overview: item.overview,
      media_type: item.media_type,
    };
    setBackdropMovie(mediaItem);
    scrollCardHorizontal(rowRef.current, cardEl);
  }, []);

  // Авто-фокус на первом элементе истории
  useEffect(() => {
    let cancelled = false;
    const focusFirst = () => {
      if (cancelled) return true;
      const root = rootRef.current;
      if (!root) return false;
      const doc = getActiveDocument(root);
      const target = root.querySelector<HTMLElement>(
        ".projacktor-dl-poster-btn, .projacktor-empty-lib"
      );
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          if (items.length > 0) {
            handleCardFocus(items[0], target.closest(".projacktor-dl-grid-card"));
          }
        } catch {}
        return true;
      }
      return false;
    };

    if (!focusFirst()) {
      const t1 = setTimeout(focusFirst, 50);
      const t2 = setTimeout(focusFirst, 150);
      const t3 = setTimeout(focusFirst, 300);
      return () => {
        cancelled = true;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [items.length, handleCardFocus]);

  // Основной 2D обработчик навигации
  const handleDirection = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      if (isModalOpen()) return;

      const now = Date.now();
      if (now - lastNavAtRef.current < NAV_COOLDOWN_MS) return;

      const root = rootRef.current;
      if (!root) return;
      const doc = getActiveDocument(root);
      if (!doc) return;

      const active = doc.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;

      const doFocus = (target: HTMLElement | null) => {
        if (!target) return;
        lastNavAtRef.current = Date.now();
        doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        target.focus();
        target.classList.add("gpfocus");
        playNavSound();
        const card = target.closest(".projacktor-dl-grid-card") as HTMLElement | null;
        scrollCardHorizontal(rowRef.current, card || target);
      };

      if (active.classList.contains("projacktor-empty-lib") || active.closest(".projacktor-empty-lib")) {
        return;
      }

      const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-dl-grid-card"));
      if (!cards.length) return;

      const curCard = active.closest(".projacktor-dl-grid-card") as HTMLElement | null;
      if (!curCard) return;

      const cardIndex = cards.indexOf(curCard);
      if (cardIndex === -1) return;

      const isPoster = !!active.closest(".projacktor-dl-poster-btn");
      const isButton = !isPoster && !!active.closest(".projacktor-dl-card-btns");

      if (isPoster) {
        if (dir === "left") {
          const targetIndex = cardIndex > 0 ? cardIndex - 1 : cards.length - 1;
          const prevPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
          doFocus(prevPoster);
          if (items[targetIndex]) handleCardFocus(items[targetIndex], cards[targetIndex]);
        } else if (dir === "right") {
          const targetIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
          const nextPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
          doFocus(nextPoster);
          if (items[targetIndex]) handleCardFocus(items[targetIndex], cards[targetIndex]);
        } else if (dir === "down") {
          const playBtn = curCard.querySelector<HTMLElement>(".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']");
          doFocus(playBtn);
        } else if (dir === "up") {
          return;
        }
      } else if (isButton) {
        const cardButtons = Array.from(
          curCard.querySelectorAll<HTMLElement>(
            ".projacktor-dl-card-btns [tabindex='0']"
          )
        );
        const btnIndex = cardButtons.findIndex((b) => b === active || b.contains(active));

        if (dir === "up") {
          const poster = curCard.querySelector<HTMLElement>(".projacktor-dl-poster-btn");
          doFocus(poster);
          if (items[cardIndex]) handleCardFocus(items[cardIndex], curCard);
        } else if (dir === "left") {
          if (btnIndex > 0) {
            doFocus(cardButtons[btnIndex - 1]);
          } else {
            const prevCardIndex = cardIndex > 0 ? cardIndex - 1 : cards.length - 1;
            const prevCard = cards[prevCardIndex];
            const prevBtns = prevCard.querySelectorAll<HTMLElement>(
              ".projacktor-dl-card-btns [tabindex='0']"
            );
            if (prevBtns.length > 0) {
              doFocus(prevBtns[prevBtns.length - 1]);
              if (items[prevCardIndex]) handleCardFocus(items[prevCardIndex], prevCard);
            }
          }
        } else if (dir === "right") {
          if (btnIndex !== -1 && btnIndex < cardButtons.length - 1) {
            doFocus(cardButtons[btnIndex + 1]);
          } else {
            const nextCardIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
            const nextCard = cards[nextCardIndex];
            const nextBtn = nextCard.querySelector<HTMLElement>(
              ".projacktor-dl-card-btns [tabindex='0']"
            );
            if (nextBtn) {
              doFocus(nextBtn);
              if (items[nextCardIndex]) handleCardFocus(items[nextCardIndex], nextCard);
            }
          }
        }
      }
    },
    [items, handleCardFocus]
  );

  // Слушатель событий Decky onGamepadDirection
  const handleGamepadDirection = useCallback(
    (evt: any) => {
      const btn = evt?.detail?.button;
      if (btn === 9) {
        try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
        handleDirection("up");
        return false;
      } else if (btn === 10) {
        try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
        handleDirection("down");
        return false;
      } else if (btn === 11) {
        try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
        handleDirection("left");
        return false;
      } else if (btn === 12) {
        try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
        handleDirection("right");
        return false;
      }
      return undefined;
    },
    [handleDirection]
  );

  // Слушатель стиков и кнопок контроллера
  useEffect(() => {
    const un = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (isModalOpen()) return;

      const isUp =
        e.button === RawButton.DPAD_UP ||
        e.button === RawButton.LEFTSTICK_UP ||
        e.button === 4 ||
        e.button === 20;

      const isDown =
        e.button === RawButton.DPAD_DOWN ||
        e.button === RawButton.LEFTSTICK_DOWN ||
        e.button === 6 ||
        e.button === 21;

      const isLeft =
        e.button === RawButton.DPAD_LEFT ||
        e.button === RawButton.LEFTSTICK_LEFT ||
        e.button === 7 ||
        e.button === 22;

      const isRight =
        e.button === RawButton.DPAD_RIGHT ||
        e.button === RawButton.LEFTSTICK_RIGHT ||
        e.button === 5 ||
        e.button === 23;

      if (isUp) handleDirection("up");
      else if (isDown) handleDirection("down");
      else if (isLeft) handleDirection("left");
      else if (isRight) handleDirection("right");
    });
    return un;
  }, [handleDirection]);

  return (
    <Focusable
      ref={rootRef}
      noFocusRing
      className="projacktor-library-content"
      onGamepadDirection={handleGamepadDirection}
    >
      {/* Шапка истории */}
      <div className="projacktor-section-header-row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="projacktor-section-title">Просмотрено</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {items.length > 0 ? `${items.length} ${items.length === 1 ? "проект" : "проектов"}` : "Пусто"}
          </span>
        </div>

        {items.length > 0 && (
          <Focusable
            className="ds-btn projacktor-clear-hist-btn"
            noFocusRing
            tabIndex={0}
            onClick={handleClearAll}
            onActivate={handleClearAll}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: 4,
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
            }}
          >
            Очистить историю
          </Focusable>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)" }}>
          Загрузка истории...
        </div>
      ) : items.length === 0 ? (
        <Focusable
          className="projacktor-empty-lib"
          tabIndex={0}
          noFocusRing
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          <FaHistory size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
            История просмотров пуста
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            Здесь будут отображаться фильмы и серии, которые вы начали смотреть онлайн или офлайн.
          </div>
        </Focusable>
      ) : (
        <div ref={rowRef} className="projacktor-downloads-grid">
          {items.map((item, index) => {
            const posterUrl = item.poster_path
              ? getImageUrl(item.poster_path)
              : item.backdrop_path
              ? getImageUrl(item.backdrop_path)
              : null;
            const progressPct = Math.min(100, Math.max(0, item.progress || 0));
            const isOffline = item.is_downloaded || (!item.is_online && Boolean(item.file_path));
            const isStartingDownload = !!downloadingIds[item.id];
            const isDownloadingOrQueued =
              item.download_status === "downloading" || item.download_status === "queued";
            const canDownload = !isOffline && !isDownloadingOrQueued;

            return (
              <div
                key={item.id}
                className="projacktor-dl-grid-card"
                data-item-id={item.id}
                data-card-index={index}
              >
                {/* Постер с бейджем и шкалой прогресса */}
                <Focusable
                  className="projacktor-dl-poster-btn"
                  noFocusRing
                  tabIndex={0}
                  onClick={() => handleResume(item)}
                  onActivate={() => handleResume(item)}
                  onFocus={(e: any) =>
                    handleCardFocus(item, e.currentTarget?.closest(".projacktor-dl-grid-card"))
                  }
                  title={item.title}
                >
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={item.title}
                      className="projacktor-dl-poster-img"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="projacktor-dl-poster-placeholder">
                      <span>{item.title}</span>
                    </div>
                  )}

                  {/* Бейдж статуса */}
                  <div
                    className={`projacktor-dl-badge-status ${isOffline ? "completed" : "downloading"}`}
                  >
                    {isOffline
                      ? "✓ Скачано"
                      : isDownloadingOrQueued
                      ? "Загрузка"
                      : "Онлайн"}
                  </div>

                  {/* Полоса прогресса внизу постера */}
                  {progressPct > 0 && (
                    <div className="projacktor-dl-bar-bg">
                      <div
                        className="projacktor-dl-bar-fill completed"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </Focusable>

                {/* Название и статус просмотра */}
                <div className="projacktor-dl-info">
                  <div className="projacktor-dl-title" title={item.title}>
                    {item.title}
                  </div>
                  <div className="projacktor-dl-year">
                    {item.episode_name
                      ? item.episode_name
                      : item.year
                      ? item.year
                      : ""}
                    {item.duration > 0 ? ` • ${formatTime(item.current_time)}` : ""}
                  </div>
                </div>

                {/* Нижняя панель действий */}
                <div className="projacktor-dl-card-btns">
                  {/* Кнопка Продолжить просмотр */}
                  <Focusable
                    className="projacktor-dl-btn-play success"
                    noFocusRing
                    tabIndex={0}
                    onClick={() => handleResume(item)}
                    onActivate={() => handleResume(item)}
                    title="Продолжить просмотр"
                  >
                    <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                  </Focusable>

                  {/* Кнопка Загрузить на устройство (если ещё не скачано и не качается) */}
                  {canDownload && (
                    <Focusable
                      className="projacktor-dl-btn-icon"
                      noFocusRing
                      tabIndex={0}
                      onClick={(e: any) => handleDownload(item, e)}
                      onActivate={(e: any) => handleDownload(item, e)}
                      title="Загрузить на устройство"
                    >
                      {isStartingDownload ? (
                        <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 9.5 }} />
                      ) : (
                        <FaDownload style={{ fontSize: 9.5 }} />
                      )}
                    </Focusable>
                  )}

                  {/* Индикатор текущей загрузки */}
                  {isDownloadingOrQueued && (
                    <div
                      className="projacktor-dl-btn-icon"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.8,
                        cursor: "default",
                      }}
                      title="Загружается (см. вкладку Загрузки)"
                    >
                      <FaSpinner
                        style={{
                          animation: "projacktor-spin 1.2s linear infinite",
                          fontSize: 10,
                          color: "#66c0f4",
                        }}
                      />
                    </div>
                  )}

                  {/* Кнопка Удалить из истории */}
                  <Focusable
                    className="projacktor-dl-btn-icon danger"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleDelete(item.id, e)}
                    onActivate={(e: any) => handleDelete(item.id, e)}
                    title="Удалить из истории"
                  >
                    <FaTrash style={{ fontSize: 9.5 }} />
                  </Focusable>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Focusable>
  );
});
