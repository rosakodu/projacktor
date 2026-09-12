import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaTrash, FaBookmark } from "react-icons/fa";
import { MediaItem, WatchlistItem } from "../types";
import { rpcGetWatchlist, rpcRemoveFromWatchlist, getImageUrl } from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";

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
            ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
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
              ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
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
              ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
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

  // Слушатель стиков и геймпада
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
                    />
                  ) : (
                    <div className="projacktor-dl-poster-placeholder">
                      <span>{item.title}</span>
                    </div>
                  )}

                  {/* Бейдж типа медиа */}
                  <div className="projacktor-dl-badge-status queued">
                    {isTv ? "Сериал" : "Фильм"}
                  </div>

                  {/* Рейтинг */}
                  {item.vote_average && item.vote_average > 0 ? (
                    <div className="projacktor-dl-badge-quality">
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
                    title="Открыть проект"
                  >
                    <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                  </Focusable>

                  {/* Кнопка Удалить из фильмотеки */}
                  <Focusable
                    className="projacktor-dl-btn-icon danger"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handleRemove(item.tmdb_id, e)}
                    onActivate={(e: any) => handleRemove(item.tmdb_id, e)}
                    title="Удалить из фильмотеки"
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
