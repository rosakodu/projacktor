import { FC, useRef, useEffect, memo, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem } from "../types";
import { MovieCard } from "./MovieCard";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import {
  DeckyButton,
  subscribeHomeButton,
  dispatchHomeButtonDown,
  dispatchHomeDirection,
  isModalOpen,
} from "../runtime/homeInputBus";

interface SectorShelfProps {
  title: string;
  items: MediaItem[];
  onSelectMovie: (movie: MediaItem) => void;
  loading?: boolean;
  onPrevSection?: () => void;
  onNextSection?: () => void;
  hasPrevSection?: boolean;
  hasNextSection?: boolean;
}

function computeCenteredScrollLeft(
  container: { width: number; scrollWidth: number },
  item: { left: number; width: number }
): number {
  const target = item.left - container.width / 2 + item.width / 2;
  const maxScroll = Math.max(0, container.scrollWidth - container.width);
  return Math.max(0, Math.min(target, maxScroll));
}

const SECTION_COOLDOWN_MS = 200;

export const SectorShelf: FC<SectorShelfProps> = memo(
  ({
    title,
    items,
    onSelectMovie,
    loading,
    onPrevSection,
    onNextSection,
    hasPrevSection,
    hasNextSection,
  }) => {
    const shelfRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const lastSectionChangeAtRef = useRef<number>(0);

    const triggerPrevSection = useCallback(() => {
      if (isModalOpen()) return;
      if (!hasPrevSection || !onPrevSection) return;
      const now = Date.now();
      if (now - lastSectionChangeAtRef.current < SECTION_COOLDOWN_MS) return;
      lastSectionChangeAtRef.current = now;
      onPrevSection();
    }, [hasPrevSection, onPrevSection]);

    const triggerNextSection = useCallback(() => {
      if (isModalOpen()) return;
      if (!hasNextSection || !onNextSection) return;
      const now = Date.now();
      if (now - lastSectionChangeAtRef.current < SECTION_COOLDOWN_MS) return;
      lastSectionChangeAtRef.current = now;
      onNextSection();
    }, [hasNextSection, onNextSection]);

    // Авто-фокус на первой карточке при смене раздела или монтировании
    useEffect(() => {
      const timer = setTimeout(() => {
        const firstCard = rowRef.current?.querySelector<HTMLElement>(".projacktor-card");
        if (firstCard) {
          firstCard.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }, [title]);

    // Подписка на raw-события геймпада Big Picture (SteamClient.Input)
    useEffect(() => {
      const un = subscribeControllerInput((e) => {
        if (!e.pressed) return;
        if (e.button === RawButton.DPAD_UP) {
          triggerPrevSection();
        } else if (e.button === RawButton.DPAD_DOWN) {
          triggerNextSection();
        }
      });
      return un;
    }, [triggerPrevSection, triggerNextSection]);

    // Подписка на шину Focusable Decky
    useEffect(() => {
      const un = subscribeHomeButton((e) => {
        if (e.button === DeckyButton.DPAD_UP || e.button === 9 || e.button === 12) {
          triggerPrevSection();
        } else if (e.button === DeckyButton.DPAD_DOWN || e.button === 10 || e.button === 13) {
          triggerNextSection();
        }
      });
      return un;
    }, [triggerPrevSection, triggerNextSection]);

    // Центрирование карточки по горизонтали и фиксация вертикального скролла
    useEffect(() => {
      const rowEl = rowRef.current;
      const shelfEl = shelfRef.current;
      if (!rowEl || !shelfEl) return;

      let rafId: number | null = null;

      const handleHorizontalScroll = (card: HTMLElement) => {
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

      const handleVerticalAlign = () => {
        const parentScroll = shelfEl.closest(".projacktor-content-scroll") as HTMLElement | null;
        if (parentScroll && parentScroll.scrollTop !== 0) {
          parentScroll.scrollTop = 0;
        }
      };

      const onCardFocus = (e: FocusEvent) => {
        const card = (e.target as HTMLElement)?.closest(".projacktor-card") as HTMLElement | null;
        if (card && rowEl.contains(card)) {
          handleHorizontalScroll(card);
          handleVerticalAlign();
        }
      };

      rowEl.addEventListener("focusin", onCardFocus);
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rowEl.removeEventListener("focusin", onCardFocus);
      };
    }, []);

    const absorb = (evt: any) => {
      try {
        evt?.preventDefault?.();
      } catch {}
      try {
        evt?.stopPropagation?.();
      } catch {}
      try {
        evt?.stopImmediatePropagation?.();
      } catch {}
      try {
        evt?.detail?.event?.preventDefault?.();
      } catch {}
      try {
        evt?.detail?.event?.stopPropagation?.();
      } catch {}
    };

    return (
      <div ref={shelfRef} className="projacktor-shelf">
        <div className="projacktor-shelf-title">
          <span>{title}</span>
          {loading && <span style={{ fontSize: 12, opacity: 0.6 }}>Загрузка...</span>}
        </div>

        <Focusable
          ref={rowRef}
          flow-children="horizontal"
          noFocusRing
          role="list"
          aria-label={title}
          className="projacktor-shelf-row"
          onGamepadDirection={(evt: any) => {
            dispatchHomeDirection(evt);
            const dir = evt?.detail?.button;
            if (dir === DeckyButton.DPAD_UP || dir === 9 || dir === 12) {
              if (hasPrevSection) {
                absorb(evt);
                triggerPrevSection();
              }
            } else if (dir === DeckyButton.DPAD_DOWN || dir === 10 || dir === 13) {
              if (hasNextSection) {
                absorb(evt);
                triggerNextSection();
              }
            }
          }}
          onButtonDown={(evt: any) => {
            dispatchHomeButtonDown(evt);
            const btn = evt?.detail?.button;
            if (btn === DeckyButton.DPAD_UP || btn === 9 || btn === 12) {
              if (hasPrevSection) {
                absorb(evt);
                triggerPrevSection();
              }
            } else if (btn === DeckyButton.DPAD_DOWN || btn === 10 || btn === 13) {
              if (hasNextSection) {
                absorb(evt);
                triggerNextSection();
              }
            }
          }}
          onKeyDown={(e: any) => {
            if (e.key === "ArrowUp") {
              e.preventDefault?.();
              e.stopPropagation?.();
              triggerPrevSection();
            } else if (e.key === "ArrowDown") {
              e.preventDefault?.();
              e.stopPropagation?.();
              triggerNextSection();
            }
          }}
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

          <div
            style={{ minWidth: 56, minHeight: 1, flexShrink: 0, pointerEvents: "none" }}
            aria-hidden="true"
          />
        </Focusable>
      </div>
    );
  }
);
