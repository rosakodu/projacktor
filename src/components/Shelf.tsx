import { FC, useRef, useEffect, memo, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem } from "../api";
import { MovieCard } from "./MovieCard";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";

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

const CARD_STEP_COOLDOWN_MS = 110;

export const Shelf: FC<ShelfProps> = memo(({ title, items, onSelectMovie, loading }) => {
  const shelfRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const lastCardStepAtRef = useRef(0);

  const stepCard = useCallback((dir: 1 | -1) => {
    const now = Date.now();
    if (now - lastCardStepAtRef.current < CARD_STEP_COOLDOWN_MS) return;
    lastCardStepAtRef.current = now;

    const doc = getActiveDocument(rowRef.current);
    const row = rowRef.current;
    if (!row || !doc) return;

    const cards = Array.from(row.querySelectorAll<HTMLElement>(".projacktor-card"));
    if (!cards.length) return;

    const active = doc.activeElement;
    const curIdx = cards.findIndex(
      (c) => c === active || c.contains(active as Node)
    );

    let nextIdx: number;
    if (curIdx === -1) {
      nextIdx = dir > 0 ? 0 : cards.length - 1;
    } else if (dir > 0) {
      nextIdx = curIdx < cards.length - 1 ? curIdx + 1 : 0;
    } else {
      nextIdx = curIdx > 0 ? curIdx - 1 : cards.length - 1;
    }

    if (nextIdx !== curIdx || curIdx === -1) {
      const target = cards[nextIdx];
      doc.querySelectorAll(".gpfocus").forEach((el) =>
        el.classList.remove("gpfocus")
      );
      target.focus();
      target.classList.add("gpfocus");
      playNavSound();

      const final = computeCenteredScrollLeft(
        { width: row.clientWidth, scrollWidth: row.scrollWidth },
        { left: target.offsetLeft, width: target.offsetWidth }
      );
      row.scrollTo({ left: final, behavior: "smooth" });
    }
  }, []);

  // Обработчик направлений D-Pad / Stick от GamepadUI
  const handleGamepadDirection = useCallback(
    (evt: any) => {
      const btn = evt?.detail?.button;
      if (btn === 11) {
        // DPAD_LEFT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        stepCard(-1);
        return false;
      } else if (btn === 12) {
        // DPAD_RIGHT
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        stepCard(1);
        return false;
      }
      return undefined;
    },
    [stepCard]
  );

  // Подписка на raw-события геймпада (SteamClient.Input)
  useEffect(() => {
    const un = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (isModalOpen()) return;

      const doc = getActiveDocument(rowRef.current);
      const active = doc?.activeElement;
      const inRow = !!(active && rowRef.current?.contains(active as Node));
      if (!inRow) return;

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

      if (isLeft) {
        stepCard(-1);
      } else if (isRight) {
        stepCard(1);
      }
    });

    return un;
  }, [stepCard]);

  // Перехват стрелок клавиатуры
  useEffect(() => {
    const shelfEl = shelfRef.current;
    if (!shelfEl) return;
    const doc = getActiveDocument(shelfEl);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen()) return;
      const active = doc?.activeElement || document?.activeElement;
      const inRow = !!(active && rowRef.current?.contains(active as Node));
      if (!inRow) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        stepCard(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        stepCard(1);
      }
    };

    doc?.addEventListener?.("keydown", handleKeyDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      doc?.removeEventListener?.("keydown", handleKeyDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [stepCard]);

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
        onGamepadDirection={handleGamepadDirection}
      >
        {items.map((item) => (
          <MovieCard
            key={`${item.media_type || "item"}-${item.id}`}
            movie={item}
            onActivate={onSelectMovie}
            onGamepadDirection={handleGamepadDirection}
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
