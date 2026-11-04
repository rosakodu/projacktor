import { RefObject, useEffect, useRef } from "react";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen, isPlayerActive } from "../runtime/homeInputBus";
import { getActiveDocument } from "../runtime/activeDoc";
import { setBackdropMovie } from "../runtime/backdropBus";
import { MediaItem } from "../types";
import { computeCenteredScrollLeft } from "./shelfUtils";

interface ShelfListenersOptions {
  shelfRef: RefObject<HTMLDivElement | null>;
  rowRef: RefObject<HTMLDivElement | null>;
  title?: string;
  items: MediaItem[];
  autoFocus?: boolean;
  triggerPrevSection: () => boolean;
  triggerNextSection: () => void;
  stepCard: (dir: 1 | -1) => void;
  hasNextSection?: boolean;
  hasPrevSection?: boolean;
  onNextSection?: () => void;
  onPrevSection?: () => void;
}

export function useShelfListeners({
  shelfRef, rowRef, title, items, autoFocus,
  triggerPrevSection, triggerNextSection, stepCard,
  hasNextSection, onNextSection, onPrevSection,
}: ShelfListenersOptions) {
  const lastTitleRef = useRef(title);
  useEffect(() => {
    const isNew = lastTitleRef.current !== title;
    lastTitleRef.current = title;
    const shouldAutoFocus = autoFocus ?? !!(onPrevSection || onNextSection);
    const doc = getActiveDocument(rowRef.current);
    const inShelf = !!(doc?.activeElement && rowRef.current?.contains(doc.activeElement));
    if (isNew && !inShelf && rowRef.current) rowRef.current.scrollTo({ left: 0, behavior: "auto" });
    if (!shouldAutoFocus || inShelf) return;
    const focusFirst = () => {
      if (isModalOpen()) return;
      const first = rowRef.current?.querySelector<HTMLElement>(".projacktor-card");
      if (first) {
        getActiveDocument(rowRef.current)?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        first.focus();
        first.classList.add("gpfocus");
        if (items[0]) setBackdropMovie(items[0]);
      }
    };
    focusFirst();
    const t1 = setTimeout(focusFirst, 50);
    return () => clearTimeout(t1);
  }, [title, items, autoFocus, onPrevSection, onNextSection, rowRef]);

  useEffect(() => {
    return subscribeControllerInput((e) => {
      if (!e.pressed || isModalOpen() || isPlayerActive()) return;
      const active = getActiveDocument(rowRef.current)?.activeElement;
      if (!rowRef.current?.contains(active as Node) && active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).closest?.(".projacktor-modal-root"))) return;
      if (e.button === RawButton.DPAD_UP || e.button === RawButton.LEFTSTICK_UP || e.button === 4 || e.button === 20) triggerPrevSection();
      else if (e.button === RawButton.DPAD_DOWN || e.button === RawButton.LEFTSTICK_DOWN || e.button === 6 || e.button === 21) triggerNextSection();
      else if (e.button === RawButton.DPAD_LEFT || e.button === RawButton.LEFTSTICK_LEFT || e.button === 7 || e.button === 22) stepCard(-1);
      else if (e.button === RawButton.DPAD_RIGHT || e.button === RawButton.LEFTSTICK_RIGHT || e.button === 5 || e.button === 23) stepCard(1);
    });
  }, [triggerPrevSection, triggerNextSection, stepCard, rowRef]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isModalOpen() || isPlayerActive()) return;
      const doc = getActiveDocument(shelfRef.current);
      const active = doc?.activeElement || document?.activeElement;
      if (!rowRef.current?.contains(active as Node) || active?.classList?.contains("projacktor-tab-item")) return;
      if (e.key === "ArrowUp") { if (triggerPrevSection()) { e.preventDefault(); e.stopPropagation(); } }
      else if (e.key === "ArrowDown" && hasNextSection && onNextSection) { e.preventDefault(); e.stopPropagation(); triggerNextSection(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); stepCard(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); stepCard(1); }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [triggerPrevSection, triggerNextSection, stepCard, hasNextSection, onNextSection, shelfRef, rowRef]);

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
        parentScroll.scrollTo({ top: targetScroll, behavior: "smooth" });
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
  }, [shelfRef, rowRef]);
}
