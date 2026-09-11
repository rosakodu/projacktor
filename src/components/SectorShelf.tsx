import { FC, useRef, useEffect, memo, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem } from "../types";
import { MovieCard } from "./MovieCard";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";


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

const SECTION_COOLDOWN_MS = 380;
let globalLastSectionChangeAt = 0;
let globalHeldDirection: "up" | "down" | null = null;

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

    const triggerPrevSection = useCallback(() => {
      if (isModalOpen()) return;
      const now = Date.now();
      if (now - globalLastSectionChangeAt < SECTION_COOLDOWN_MS) return;
      globalLastSectionChangeAt = now;

      if (!hasPrevSection) {
        // Return focus to active tab in the tabs bar when pressing UP on the top shelf
        const doc = getActiveDocument(rowRef.current);
        const activeTab = doc?.querySelector<HTMLElement>(
          '.projacktor-tab-item.active, [role="tab"][aria-selected="true"]'
        );
        if (activeTab && doc) {
          doc.querySelectorAll('.gpfocus').forEach((el) => el.classList.remove('gpfocus'));
          activeTab.focus();
          activeTab.classList.add('gpfocus');
        }
        return;
      }
      if (onPrevSection) {
        onPrevSection();
      }
    }, [hasPrevSection, onPrevSection]);

    const triggerNextSection = useCallback(() => {
      if (isModalOpen()) return;
      if (!hasNextSection || !onNextSection) return;
      const now = Date.now();
      if (now - globalLastSectionChangeAt < SECTION_COOLDOWN_MS) return;
      globalLastSectionChangeAt = now;
      onNextSection();
    }, [hasNextSection, onNextSection]);

    const stepCard = useCallback((dir: 1 | -1) => {
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
      } else {
        nextIdx = Math.max(0, Math.min(cards.length - 1, curIdx + dir));
      }

      if (nextIdx !== curIdx || curIdx === -1) {
        const target = cards[nextIdx];
        doc.querySelectorAll(".gpfocus").forEach((el) =>
          el.classList.remove("gpfocus")
        );
        target.focus();
        target.classList.add("gpfocus");
        playNavSound();
      }
    }, []);

    // Авто-фокус на первой карточке при смене раздела (но не если пользователь находится на табах)
    useEffect(() => {
      if (rowRef.current) {
        rowRef.current.scrollTo({ left: 0, behavior: "auto" });
      }
      const timer = setTimeout(() => {
        const doc = getActiveDocument(rowRef.current);
        const active = doc?.activeElement;
        const inTabs = !!(
          active &&
          (active.classList?.contains("projacktor-tab-item") ||
            doc?.querySelector(".projacktor-nav-bar")?.contains(active))
        );
        if (inTabs) return;

        const firstCard = rowRef.current?.querySelector<HTMLElement>(".projacktor-card");
        if (firstCard) {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          firstCard.focus();
          firstCard.classList.add("gpfocus");
        }
      }, 60);
      return () => clearTimeout(timer);
    }, [title]);

    // Подписка на raw-события геймпада Big Picture (SteamClient.Input)
    useEffect(() => {
      let holdTimer: any = null;
      let repeatTimer: any = null;

      const clearHoldTimers = () => {
        if (holdTimer != null) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (repeatTimer != null) {
          clearInterval(repeatTimer);
          repeatTimer = null;
        }
      };

      const un = subscribeControllerInput((e) => {
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

        if (!e.pressed) {
          if ((isUp && globalHeldDirection === "up") || (isDown && globalHeldDirection === "down")) {
            globalHeldDirection = null;
          }
          if (isLeft || isRight) {
            clearHoldTimers();
          }
          return;
        }

        if (isModalOpen()) return;

        const doc = getActiveDocument(rowRef.current);
        const active = doc?.activeElement;
        const inTabs = doc?.querySelector(".projacktor-nav-bar")?.contains(active as Node);
        if (inTabs) return;

        if (isUp) {
          if (globalHeldDirection === "up") return;
          globalHeldDirection = "up";
          triggerPrevSection();
        } else if (isDown) {
          if (globalHeldDirection === "down") return;
          globalHeldDirection = "down";
          triggerNextSection();
        } else if (isLeft) {
          clearHoldTimers();
          stepCard(-1);
          holdTimer = setTimeout(() => {
            repeatTimer = setInterval(() => {
              stepCard(-1);
            }, 120);
          }, 240);
        } else if (isRight) {
          clearHoldTimers();
          stepCard(1);
          holdTimer = setTimeout(() => {
            repeatTimer = setInterval(() => {
              stepCard(1);
            }, 120);
          }, 240);
        }
      });

      return () => {
        clearHoldTimers();
        un();
      };
    }, [triggerPrevSection, triggerNextSection, stepCard]);

    // Перехват стрелок Up/Down для надежного переключения полок
    useEffect(() => {
      const shelfEl = shelfRef.current;
      if (!shelfEl) return;
      const doc = getActiveDocument(shelfEl);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isModalOpen()) return;
        const active = doc?.activeElement || document?.activeElement;
        if (!shelfEl.contains(active as Node)) return;

        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          triggerPrevSection();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          triggerNextSection();
        }
      };

      doc?.addEventListener?.("keydown", handleKeyDown, true);
      window.addEventListener("keydown", handleKeyDown, true);
      return () => {
        doc?.removeEventListener?.("keydown", handleKeyDown, true);
        window.removeEventListener("keydown", handleKeyDown, true);
      };
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
          onKeyDown={(e: any) => {
            if (e.key === "ArrowUp") {
              e.preventDefault?.();
              e.stopPropagation?.();
              triggerPrevSection();
            } else if (e.key === "ArrowDown") {
              e.preventDefault?.();
              e.stopPropagation?.();
              triggerNextSection();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault?.();
              e.stopPropagation?.();
              stepCard(-1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault?.();
              e.stopPropagation?.();
              stepCard(1);
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
