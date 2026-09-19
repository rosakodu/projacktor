import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaTrash, FaBookmark } from "react-icons/fa";
import { MediaItem, WatchlistItem } from "../types";
import { rpcGetWatchlist, rpcRemoveFromWatchlist, getImageUrl } from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";
import { isModalOpen, isUserInTabs, isPlayerActive } from "../runtime/homeInputBus";
import { useGridNavigation, scrollCardHorizontal } from "../hooks/useGridNavigation";
import { useI18n } from "../i18n";

interface WatchlistViewProps {
  onSelectMovie: (movie: MediaItem) => void;
  onNavigateToCatalog?: () => void;
}

export const WatchlistView: FC<WatchlistViewProps> = memo(({ onSelectMovie, onNavigateToCatalog }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);
  const { t } = useI18n();

  const refreshList = useCallback(async () => {
    try {
      const data = await rpcGetWatchlist();
      if (mountedRef.current && Array.isArray(data)) {
        setItems(data);
      }
    } catch (e) {
      console.error("WatchlistView refresh error:", e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshList();
    const interval = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        refreshList();
      }
    }, 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refreshList]);

  // Сброс бэкдропа при монтировании, если список пуст
  useEffect(() => {
    if (items.length === 0) {
      setBackdropMovie(null, true);
    }
  }, [items.length]);

  useEffect(() => {
    if (isModalOpen() || isUserInTabs() || isPlayerActive()) return;
    const doc = getActiveDocument(rootRef.current);
    const active = doc?.activeElement;
    const root = rootRef.current;
    if (!root) return;
    if (!active || active === doc?.body || !root.contains(active)) {
      const target = root.querySelector<HTMLElement>(".projacktor-empty-cta-btn, .projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-empty-lib");
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
        } catch {}
      }
    }
  }, [items, loading]);

  const handleRemove = useCallback(
    async (tmdbId: number, e?: any) => {
      if (e) {
        try {
          e.stopPropagation();
          e.preventDefault();
        } catch {}
      }
      playNavSound();
      try {
        await rpcRemoveFromWatchlist(tmdbId);
        setItems((prev) => prev.filter((i) => i.tmdb_id !== tmdbId));
      } catch (err) {
        console.error("Failed to remove from watchlist:", err);
      }
    },
    []
  );

  const handleCardClick = useCallback(
    (item: WatchlistItem) => {
      playNavSound();
      const mediaItem: MediaItem = {
        id: item.tmdb_id,
        title: item.title,
        original_title: item.original_title,
        release_date: item.year,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        vote_average: item.vote_average,
        overview: item.overview,
        media_type: item.media_type,
      };
      onSelectMovie(mediaItem);
    },
    [onSelectMovie]
  );

  const handleCardFocus = useCallback((item: WatchlistItem, cardEl: HTMLElement | null) => {
    const mediaItem: MediaItem = {
      id: item.tmdb_id,
      title: item.title,
      original_title: item.original_title,
      release_date: item.year,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      overview: item.overview,
      media_type: item.media_type,
    };
    setBackdropMovie(mediaItem);
    scrollCardHorizontal(rowRef.current, cardEl);
  }, []);

  // Авто-фокус на первой карточке
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
      {/* Шапка избранного */}
      <div className="projacktor-section-header-row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="projacktor-section-title">{t("watchlist")}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="projacktor-empty-lib"
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          {loading ? (
            <div style={{ padding: 40, color: "rgba(255,255,255,0.5)" }}>
              {t("loadingWatchlist")}
            </div>
          ) : (
            <>
              <FaBookmark size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
                {t("watchlistEmptyTitle")}
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
                {t("watchlistEmptyDesc")}
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
            </>
          )}
        </div>
      ) : (
        <div ref={rowRef} className="projacktor-downloads-grid">
          {items.map((item, index) => {
            const posterUrl = item.poster_path ? getImageUrl(item.poster_path) : null;
            const isTv = item.media_type === "tv";

            return (
              <div
                key={item.tmdb_id || item.id}
                className="projacktor-dl-grid-card"
                data-item-id={item.tmdb_id || item.id}
                data-card-index={index}
              >
                {/* Постер / Карточка */}
                <Focusable
                  className="projacktor-dl-poster-btn"
                  noFocusRing
                  tabIndex={0}
                  onClick={() => handleCardClick(item)}
                  onActivate={() => handleCardClick(item)}
                  onFocus={(e: any) => handleCardFocus(item, e.currentTarget?.closest(".projacktor-dl-grid-card"))}
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

                  {/* Бейдж типа медиа */}
                  <div className="projacktor-dl-badge-status queued">
                    {isTv ? t("seriesBadge") : t("movieBadge")}
                  </div>

                  {/* Рейтинг */}
                  {item.vote_average && item.vote_average > 0 ? (
                    <div className="projacktor-card-rating">
                      ★ {item.vote_average.toFixed(1)}
                    </div>
                  ) : null}
                </Focusable>

                {/* Название и год */}
                <div className="projacktor-dl-info">
                  <div className="projacktor-dl-title" title={item.title}>
                    {item.title}
                  </div>
                  {item.year ? (
                    <div className="projacktor-dl-year">{item.year}</div>
                  ) : null}
                </div>

                {/* Нижняя панель действий */}
                <div className="projacktor-dl-card-btns">
                  {/* Кнопка Открыть/Смотреть */}
                  <Focusable
                    className="projacktor-dl-btn-play success"
                    noFocusRing
                    tabIndex={0}
                    onClick={() => handleCardClick(item)}
                    onActivate={() => handleCardClick(item)}
                    title={t("openProject")}
                  >
                    <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                  </Focusable>

                  {/* Кнопка Удалить из избранного */}
                  <Focusable
                    className="projacktor-dl-btn-icon danger"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleRemove(item.tmdb_id, e)}
                    onActivate={(e: any) => handleRemove(item.tmdb_id, e)}
                    title={t("removeFromWatchlist")}
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
