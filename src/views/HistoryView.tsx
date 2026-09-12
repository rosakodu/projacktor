import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaTrash, FaHistory } from "react-icons/fa";
import { WatchHistoryItem, MediaItem, PlayerMediaInfo } from "../types";
import {
  rpcGetWatchHistory,
  rpcDeleteWatchHistoryItem,
  rpcClearWatchHistory,
  getImageUrl,
} from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";

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
        ".projacktor-history-card, .projacktor-empty-lib"
      );
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          if (items.length > 0 && target.classList.contains("projacktor-history-card")) {
            handleCardFocus(items[0], target);
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

  // Навигация геймпада
  const handleGamepadDirection = useCallback(
    (evt: any) => {
      const btn = evt?.detail?.button;
      const now = Date.now();
      if (now - lastNavAtRef.current < NAV_COOLDOWN_MS) return false;

      const root = rootRef.current;
      if (!root) return undefined;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return undefined;

      const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-history-card-wrap"));
      if (!cards.length) return undefined;

      const curCard = active.closest(".projacktor-history-card-wrap") as HTMLElement | null;
      if (!curCard) return undefined;

      const curIdx = cards.indexOf(curCard);
      if (curIdx === -1) return undefined;

      const isPlayBtn = active.closest(".projacktor-hist-play-btn");
      const isDelBtn = active.closest(".projacktor-hist-del-btn");
      const isPoster = !isPlayBtn && !isDelBtn;

      if (btn === 11) {
        // DPAD_LEFT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        lastNavAtRef.current = now;

        if (isDelBtn) {
          // С кнопки удалить переходим на кнопку играть
          const playBtn = curCard.querySelector<HTMLElement>(".projacktor-hist-play-btn");
          if (playBtn) {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            playBtn.focus();
            playBtn.classList.add("gpfocus");
            playNavSound();
            return false;
          }
        }

        const prevIdx = curIdx > 0 ? curIdx - 1 : cards.length - 1;
        const target = cards[prevIdx].querySelector<HTMLElement>(".projacktor-history-card");
        if (target) {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          playNavSound();
          if (items[prevIdx]) handleCardFocus(items[prevIdx], cards[prevIdx]);
        }
        return false;
      } else if (btn === 12) {
        // DPAD_RIGHT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        lastNavAtRef.current = now;

        if (isPlayBtn) {
          // С кнопки играть переходим на кнопку удалить
          const delBtn = curCard.querySelector<HTMLElement>(".projacktor-hist-del-btn");
          if (delBtn) {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            delBtn.focus();
            delBtn.classList.add("gpfocus");
            playNavSound();
            return false;
          }
        }

        const nextIdx = curIdx < cards.length - 1 ? curIdx + 1 : 0;
        const target = cards[nextIdx].querySelector<HTMLElement>(".projacktor-history-card");
        if (target) {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          playNavSound();
          if (items[nextIdx]) handleCardFocus(items[nextIdx], cards[nextIdx]);
        }
        return false;
      } else if (btn === 10) {
        // DPAD_DOWN: переходим на кнопки действий под постером
        if (isPoster) {
          const playBtn = curCard.querySelector<HTMLElement>(".projacktor-hist-play-btn");
          if (playBtn) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            lastNavAtRef.current = now;
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            playBtn.focus();
            playBtn.classList.add("gpfocus");
            playNavSound();
            return false;
          }
        }
      } else if (btn === 9) {
        // DPAD_UP: с кнопок возвращаемся на постер
        if (!isPoster) {
          const poster = curCard.querySelector<HTMLElement>(".projacktor-history-card");
          if (poster) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            lastNavAtRef.current = now;
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            poster.focus();
            poster.classList.add("gpfocus");
            playNavSound();
            return false;
          }
        }
        // Блокируем выход в табы
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        return false;
      }
      return undefined;
    },
    [items, handleCardFocus]
  );

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
          {items.map((item) => {
            const posterUrl = item.poster_path
              ? getImageUrl(item.poster_path)
              : item.backdrop_path
              ? getImageUrl(item.backdrop_path)
              : null;
            const progressPct = Math.min(100, Math.max(0, item.progress || 0));
            const isOffline = item.is_downloaded || (!item.is_online && Boolean(item.file_path));

            return (
              <div key={item.id} className="projacktor-dl-grid-card projacktor-history-card-wrap">
                {/* Постер с прогресс-баром */}
                <Focusable
                  className="projacktor-dl-poster-btn projacktor-history-card"
                  noFocusRing
                  tabIndex={0}
                  onClick={() => handleResume(item)}
                  onActivate={() => handleResume(item)}
                  onFocus={(e: any) =>
                    handleCardFocus(item, e.currentTarget?.closest(".projacktor-dl-grid-card"))
                  }
                >
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={item.title}
                      className="projacktor-dl-poster-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="projacktor-dl-poster-placeholder">
                      <span>{item.title}</span>
                    </div>
                  )}

                  {/* Бейдж типа: ОНЛАЙН / СКАЧАНО */}
                  <span
                    className="projacktor-card-badge"
                    style={{
                      background: isOffline ? "rgba(34, 197, 94, 0.85)" : "rgba(59, 130, 246, 0.85)",
                    }}
                  >
                    {isOffline ? "✓ Скачано" : "Онлайн"}
                  </span>

                  {/* Шкала прогресса внизу постера */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: "rgba(0,0,0,0.6)",
                      zIndex: 3,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progressPct}%`,
                        background: "var(--ds-primary, #3b82f6)",
                        borderRadius: "0 2px 2px 0",
                      }}
                    />
                  </div>

                  {/* Оверлей с названием и серией */}
                  <div className="projacktor-dl-poster-overlay" style={{ bottom: 4 }}>
                    <div className="projacktor-dl-title">{item.title}</div>
                    {item.episode_name ? (
                      <div className="projacktor-dl-meta" style={{ color: "#38bdf8" }}>
                        {item.episode_name}
                      </div>
                    ) : item.year ? (
                      <div className="projacktor-dl-meta">{item.year}</div>
                    ) : null}
                    {item.duration > 0 && (
                      <div style={{ fontSize: 9.5, opacity: 0.8, marginTop: 2 }}>
                        {formatTime(item.current_time)} / {formatTime(item.duration)} ({progressPct.toFixed(0)}%)
                      </div>
                    )}
                  </div>
                </Focusable>

                {/* Нижняя панель действий */}
                <div className="projacktor-dl-card-btns">
                  <Focusable
                    className="ds-btn ds-btn--primary projacktor-dl-btn-play projacktor-hist-play-btn"
                    noFocusRing
                    tabIndex={0}
                    onClick={() => handleResume(item)}
                    onActivate={() => handleResume(item)}
                    title="Продолжить просмотр"
                    style={{ flex: 1, gap: 5, fontSize: 11, padding: "5px 8px" }}
                  >
                    <FaPlay size={9} />
                    <span>Продолжить</span>
                  </Focusable>

                  <Focusable
                    className="ds-btn projacktor-dl-btn-icon projacktor-hist-del-btn"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleDelete(item.id, e)}
                    onActivate={(e: any) => handleDelete(item.id, e)}
                    title="Удалить из истории"
                    style={{ padding: "5px 8px" }}
                  >
                    <FaTrash size={11} style={{ color: "#ef4444" }} />
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
