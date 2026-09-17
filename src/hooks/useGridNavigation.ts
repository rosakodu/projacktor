import { RefObject, useCallback, useEffect, useRef } from "react";
import { getActiveDocument } from "../runtime/activeDoc";
import { playCardNavSound } from "../runtime/navSound";
import { isModalOpen, isPlayerActive } from "../runtime/homeInputBus";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";

const NAV_COOLDOWN_MS = 110;

export function scrollCardHorizontal(row: HTMLElement | null, card: HTMLElement | null) {
  if (!row || !card) return;
  const target = card.offsetLeft - row.clientWidth / 2 + card.offsetWidth / 2;
  const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
  const final = Math.max(0, Math.min(target, maxScroll));
  row.scrollTo({ left: final, behavior: "smooth" });
}

interface UseGridNavigationOptions<T = any> {
  rootRef: RefObject<HTMLDivElement | null>;
  rowRef: RefObject<HTMLDivElement | null>;
  items: T[];
  onCardFocus?: (item: T, cardEl: HTMLElement | null) => void;
  supportsPosterFocus?: boolean;
}

export function useGridNavigation<T = any>({
  rootRef,
  rowRef,
  items,
  onCardFocus,
  supportsPosterFocus = true,
}: UseGridNavigationOptions<T>) {
  const lastNavAtRef = useRef<number>(0);

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
        playCardNavSound();
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

      const isPoster = supportsPosterFocus && !!active.closest(".projacktor-dl-poster-btn");
      const isButton = !isPoster && !!active.closest(".projacktor-dl-card-btns");

      if (isPoster) {
        if (dir === "left") {
          const targetIndex = cardIndex > 0 ? cardIndex - 1 : cards.length - 1;
          const prevPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
          doFocus(prevPoster);
          if (items[targetIndex] && onCardFocus) onCardFocus(items[targetIndex], cards[targetIndex]);
        } else if (dir === "right") {
          const targetIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
          const nextPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
          doFocus(nextPoster);
          if (items[targetIndex] && onCardFocus) onCardFocus(items[targetIndex], cards[targetIndex]);
        } else if (dir === "down") {
          const playBtn = curCard.querySelector<HTMLElement>(
            ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
          );
          doFocus(playBtn);
        } else if (dir === "up") {
          return;
        }
      } else if (isButton || !supportsPosterFocus) {
        const cardButtons = Array.from(
          curCard.querySelectorAll<HTMLElement>(
            ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
          )
        );
        if (!cardButtons.length) return;
        const btnIndex = cardButtons.findIndex((b) => b === active || b.contains(active));

        if (dir === "up") {
          if (supportsPosterFocus) {
            const poster = curCard.querySelector<HTMLElement>(".projacktor-dl-poster-btn");
            if (poster && poster.getAttribute("tabindex") === "0") {
              doFocus(poster);
              if (items[cardIndex] && onCardFocus) onCardFocus(items[cardIndex], curCard);
            }
          }
          return;
        } else if (dir === "down") {
          return;
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
              if (items[prevCardIndex] && onCardFocus) onCardFocus(items[prevCardIndex], prevCard);
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
              if (items[nextCardIndex] && onCardFocus) onCardFocus(items[nextCardIndex], nextCard);
            }
          }
        }
      }
    },
    [items, onCardFocus, rootRef, rowRef, supportsPosterFocus]
  );

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

  useEffect(() => {
    const un = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (isModalOpen() || isPlayerActive()) return;

      const doc = getActiveDocument(rootRef.current);
      const active = doc?.activeElement;
      if (!active || !rootRef.current?.contains(active)) return;

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = getActiveDocument(root);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen() || isPlayerActive()) return;
      const active = doc?.activeElement;
      if (!active || !root.contains(active)) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        handleDirection("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        handleDirection("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        handleDirection("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        handleDirection("right");
      }
    };

    doc?.addEventListener?.("keydown", handleKeyDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      doc?.removeEventListener?.("keydown", handleKeyDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleDirection, rootRef]);

  return {
    handleDirection,
    handleGamepadDirection,
  };
}
