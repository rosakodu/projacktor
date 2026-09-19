import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaTrash, FaHistory } from "react-icons/fa";
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
import { isModalOpen, isUserInTabs, isPlayerActive } from "../runtime/homeInputBus";
import { useGridNavigation, scrollCardHorizontal } from "../hooks/useGridNavigation";
import { useI18n } from "../i18n";

interface HistoryViewProps {
  onPlayVideo: (
    filePath: string,
    title: string,
    isOnline: boolean,
    torrentHash?: string,
    mediaInfo?: PlayerMediaInfo,
    initialTime?: number
  ) => void;
  onNavigateToCatalog?: () => void;
}

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

export const HistoryView: FC<HistoryViewProps> = memo(({ onPlayVideo, onNavigateToCatalog }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);
  const { t } = useI18n();

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
    const interval = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        refreshHistory();
      }
    }, 5000);
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

  useEffect(() => {
    if (isModalOpen() || isPlayerActive()) return;
    const doc = getActiveDocument(rootRef.current);
    const active = doc?.activeElement;
    const root = rootRef.current;
    if (!root) return;
    if (!active || active === doc?.body || !root.contains(active)) {
      const target = root.querySelector<HTMLElement>(".projacktor-empty-cta-btn, .projacktor-dl-poster-btn, .projacktor-empty-lib");
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => {
            if (el !== target) el.classList.remove("gpfocus");
          });
          target.focus();
          target.classList.add("gpfocus");
          target.classList.add("gpfocuswithin");
        } catch {}
      }
    }
  }, [items, loading]);

  const handleResume = useCallback(
    (item: WatchHistoryItem) => {
      playNavSound();
      const isDownloaded = Boolean(item.is_downloaded || (!item.is_online && item.file_path));
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
        duration: item.duration > 0 ? item.duration : undefined,
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
      if (isModalOpen() || isUserInTabs()) return true;
      const root = rootRef.current;
      if (!root) return false;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement;
      if (active && active !== doc?.body && root.contains(active)) {
        return true;
      }
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

  const { handleGamepadDirection } = useGridNavigation({
    rootRef,
    rowRef,
    items,
    onCardFocus: handleCardFocus,
    supportsPosterFocus: true,
  });

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
          <span className="projacktor-section-title">{t("history")}</span>
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
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {t("clearHistory")}
          </Focusable>
        )}
      </div>

      {!loading && items.length === 0 && (
        <div
          className="projacktor-empty-lib"
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          <FaHistory size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
            {t("historyEmptyTitle")}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
            {t("historyEmptyDesc")}
          </div>
          {onNavigateToCatalog && (
            <Focusable
              role="button"
              className="ds-btn ds-btn--primary projacktor-empty-cta-btn"
              onClick={onNavigateToCatalog}
              onActivate={onNavigateToCatalog}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 24px",
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {t("goToCatalog")}
            </Focusable>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div ref={rowRef} className="projacktor-downloads-grid">
          {items.map((item, index) => {
            const posterUrl = item.poster_path
              ? getImageUrl(item.poster_path)
              : item.backdrop_path
              ? getImageUrl(item.backdrop_path)
              : null;
            const progressPct = Math.min(100, Math.max(0, item.progress || 0));
            const isOffline = item.is_downloaded || (!item.is_online && Boolean(item.file_path));

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
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
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
                    {isOffline ? t("downloadedBadge") : t("onlineBadge")}
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
                <div className="projacktor-dl-card-btns projacktor-history-card-btns">
                  {/* Кнопка Удалить из истории */}
                  <Focusable
                    className="projacktor-dl-btn-icon danger"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleDelete(item.id, e)}
                    onActivate={(e: any) => handleDelete(item.id, e)}
                    title={t("delete")}
                  >
                    <FaTrash style={{ fontSize: 10, marginRight: 5 }} />
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{t("delete")}</span>
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
