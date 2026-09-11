import { FC, useRef, useEffect, memo } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem } from "../api";
import { MovieCard } from "./MovieCard";

interface ShelfProps {
  title?: string;
  items: MediaItem[];
  onSelectMovie: (movie: MediaItem) => void;
  loading?: boolean;
}

function computeCenteredScrollLeft(
  container: { width: number; scrollWidth: number },
  item: { left: number; width: number }
): number {
  const target = item.left - container.width / 2 + item.width / 2;
  const maxScroll = Math.max(0, container.scrollWidth - container.width);
  return Math.max(0, Math.min(target, maxScroll));
}

export const Shelf: FC<ShelfProps> = memo(({ title, items, onSelectMovie, loading }) => {
  const shelfRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rowEl = rowRef.current;
    const shelfEl = shelfRef.current;
    if (!rowEl || !shelfEl) return;

    let rafId: number | null = null;
    const handleScroll = (card: HTMLElement) => {
      if (!rowEl || !card) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const final = computeCenteredScrollLeft(
          { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
          { left: card.offsetLeft, width: card.offsetWidth }
        );
        rowEl.scrollTo({ left: final, behavior: "smooth" });
        rafId = null;
      });
    };

    const handleShelfVerticalFocus = () => {
      const parentScroll = shelfEl.closest(".projacktor-content-scroll") as HTMLElement | null;
      if (!parentScroll) return;

      const targetScroll = Math.max(0, shelfEl.offsetTop - 14);

      if (Math.abs(parentScroll.scrollTop - targetScroll) > 6) {
        parentScroll.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      }
    };

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.(".projacktor-card") as HTMLElement | null;
      if (card && rowEl.contains(card)) {
        handleScroll(card);
        handleShelfVerticalFocus();
      }
    };

    rowEl.addEventListener("focusin", onCardFocus);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rowEl.removeEventListener("focusin", onCardFocus);
    };
  }, []);

  return (
    <div ref={shelfRef} className="projacktor-shelf">
      {title ? (
        <div className="projacktor-shelf-title">
          <span>{title}</span>
          {loading && <span style={{ fontSize: 12, opacity: 0.6 }}>Загрузка...</span>}
        </div>
      ) : null}
      <Focusable
        ref={rowRef}
        flow-children="horizontal"
        noFocusRing
        role="list"
        aria-label={title || "Полка"}
        className="projacktor-shelf-row"
      >
        {items.map((item) => (
          <MovieCard
            key={`${item.media_type || "item"}-${item.id}`}
            movie={item}
            onActivate={onSelectMovie}
          />
        ))}
        {items.length === 0 && !loading && (
          <div style={{ padding: "20px 10px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Нет данных
          </div>
        )}
        <div style={{ minWidth: 56, minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
      </Focusable>
    </div>
  );
});
