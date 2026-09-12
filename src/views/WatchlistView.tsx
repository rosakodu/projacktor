import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaTrash, FaBookmark, FaStar } from "react-icons/fa";
import { MediaItem, WatchlistItem } from "../types";
import { rpcGetWatchlist, rpcRemoveFromWatchlist, getImageUrl } from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";

interface WatchlistViewProps {
  onSelectMovie: (movie: MediaItem) => void;
}

const NAV_COOLDOWN_MS = 110;

function scrollCardHorizontal(row: HTMLElement | null, card: HTMLElement | null) {
  if (!row || !card) return;
  const target = card.offsetLeft - row.clientWidth / 2 + card.offsetWidth / 2;
  const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
  const final = Math.max(0, Math.min(target, maxScroll));
  row.scrollTo({ left: final, behavior: "smooth" });
}

export const WatchlistView: FC<WatchlistViewProps> = memo(({ onSelectMovie }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const lastNavAtRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

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
    const interval = setInterval(refreshList, 3000);
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
      const root = rootRef.current;
      if (!root) return false;
      const doc = getActiveDocument(root);
      const target = root.querySelector<HTMLElement>(
        ".projacktor-watchlist-card, .projacktor-empty-lib"
      );
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          if (items.length > 0 && target.classList.contains("projacktor-watchlist-card")) {
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

      const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-watchlist-card"));
      if (!cards.length) return undefined;

      const curCard = active.closest(".projacktor-watchlist-card") as HTMLElement | null;
      if (!curCard) return undefined;

      const curIdx = cards.indexOf(curCard);
      if (curIdx === -1) return undefined;

      const isDelBtn = active.closest(".projacktor-wl-del-btn");

      if (btn === 11) {
        // DPAD_LEFT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        lastNavAtRef.current = now;
        const prevIdx = curIdx > 0 ? curIdx - 1 : cards.length - 1;
        const target = cards[prevIdx];
        doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        target.focus();
        target.classList.add("gpfocus");
        playNavSound();
        if (items[prevIdx]) handleCardFocus(items[prevIdx], target);
        return false;
      } else if (btn === 12) {
        // DPAD_RIGHT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        lastNavAtRef.current = now;
        const nextIdx = curIdx < cards.length - 1 ? curIdx + 1 : 0;
        const target = cards[nextIdx];
        doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        target.focus();
        target.classList.add("gpfocus");
        playNavSound();
        if (items[nextIdx]) handleCardFocus(items[nextIdx], target);
        return false;
      } else if (btn === 10) {
        // DPAD_DOWN: переходим на кнопку удаления карточки
        if (!isDelBtn) {
          const delBtn = curCard.querySelector<HTMLElement>(".projacktor-wl-del-btn");
          if (delBtn) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            lastNavAtRef.current = now;
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            delBtn.focus();
            delBtn.classList.add("gpfocus");
            playNavSound();
            return false;
          }
        }
      } else if (btn === 9) {
        // DPAD_UP: с кнопки удаления возвращаемся на саму карточку
        if (isDelBtn) {
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          lastNavAtRef.current = now;
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          curCard.focus();
          curCard.classList.add("gpfocus");
          playNavSound();
          return false;
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
      {/* Шапка фильмотеки */}
      <div className="projacktor-section-header-row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="projacktor-section-title">Фильмотека</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {items.length > 0 ? `${items.length} ${items.length === 1 ? "проект" : "проектов"}` : "Пусто"}
          </span>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)" }}>
          Загрузка фильмотеки...
        </div>
      ) : items.length === 0 ? (
        <Focusable
          className="projacktor-empty-lib"
          tabIndex={0}
          noFocusRing
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          <FaBookmark size={36} style={{ marginBottom: 16, opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
            Фильмотека пуста
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            Добавляйте фильмы, сериалы и мультфильмы кнопкой «В фильмотеку» из каталога или поиска.
          </div>
        </Focusable>
      ) : (
        <div ref={rowRef} className="projacktor-downloads-grid">
          {items.map((item) => {
            const posterUrl = item.poster_path ? getImageUrl(item.poster_path) : null;
            const isTv = item.media_type === "tv";

            return (
              <div key={item.tmdb_id || item.id} className="projacktor-dl-grid-card">
                {/* Постер / Основная карточка */}
                <Focusable
                  className="projacktor-dl-poster-btn projacktor-watchlist-card"
                  noFocusRing
                  tabIndex={0}
                  onClick={() => handleCardClick(item)}
                  onActivate={() => handleCardClick(item)}
                  onFocus={(e: any) => handleCardFocus(item, e.currentTarget?.closest(".projacktor-dl-grid-card"))}
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

                  {/* Бейдж типа медиа */}
                  <span className="projacktor-card-badge">
                    {isTv ? "Сериал" : "Фильм"}
                  </span>

                  {/* Рейтинг */}
                  {item.vote_average && item.vote_average > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.75)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fbbf24",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <FaStar size={8} />
                      <span>{item.vote_average.toFixed(1)}</span>
                    </div>
                  ) : null}

                  {/* Название и год внизу постера */}
                  <div className="projacktor-dl-poster-overlay">
                    <div className="projacktor-dl-title">{item.title}</div>
                    {item.year && <div className="projacktor-dl-meta">{item.year}</div>}
                  </div>
                </Focusable>

                {/* Нижняя панель действий */}
                <div className="projacktor-dl-card-btns">
                  <Focusable
                    className="ds-btn projacktor-dl-btn-icon projacktor-wl-del-btn"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleRemove(item.tmdb_id, e)}
                    onActivate={(e: any) => handleRemove(item.tmdb_id, e)}
                    title="Удалить из фильмотеки"
                    style={{ width: "100%", justifyContent: "center", gap: 6, fontSize: 11 }}
                  >
                    <FaTrash size={11} style={{ color: "#ef4444" }} />
                    <span>Удалить</span>
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
