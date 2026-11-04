import { FC, useRef, memo, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem } from "../types";
import { MovieCard } from "./MovieCard";
import { isModalOpen } from "../runtime/homeInputBus";
import { getActiveDocument } from "../runtime/activeDoc";
import { playCardNavSound } from "../runtime/navSound";
import { triggerHaptic } from "../runtime/haptics";
import { setBackdropMovie } from "../runtime/backdropBus";
import { useI18n } from "../i18n";
import { computeCenteredScrollLeft, SECTION_COOLDOWN_MS, CARD_STEP_COOLDOWN_MS } from "./shelfUtils";
import { useShelfListeners } from "./useShelfListeners";

export interface MediaShelfProps {
  title?: string;
  items: MediaItem[];
  onSelectMovie: (movie: MediaItem) => void;
  loading?: boolean;
  onNavigateUp?: () => void;
  onPrevSection?: () => void;
  onNextSection?: () => void;
  hasPrevSection?: boolean;
  hasNextSection?: boolean;
  autoFocus?: boolean;
}

export const MediaShelf: FC<MediaShelfProps> = memo(({
  title, items, onSelectMovie, loading, onNavigateUp,
  onPrevSection, onNextSection, hasPrevSection, hasNextSection, autoFocus
}) => {
  const { t } = useI18n();
  const shelfRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const lastSectionChangeAtRef = useRef(0);
  const lastCardStepAtRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const triggerPrevSection = useCallback(() => {
    if (isModalOpen()) return false;
    if (hasPrevSection && onPrevSection) {
      const now = Date.now();
      if (now - lastSectionChangeAtRef.current < SECTION_COOLDOWN_MS) return true;
      lastSectionChangeAtRef.current = now;
      triggerHaptic("medium", "both");
      playCardNavSound();
      getActiveDocument(rowRef.current)?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
      onPrevSection();
      return true;
    }
    if (onNavigateUp) {
      onNavigateUp();
      return true;
    }
    return false;
  }, [hasPrevSection, onPrevSection, onNavigateUp]);

  const triggerNextSection = useCallback(() => {
    if (isModalOpen() || !hasNextSection || !onNextSection) return;
    const now = Date.now();
    if (now - lastSectionChangeAtRef.current < SECTION_COOLDOWN_MS) return;
    lastSectionChangeAtRef.current = now;
    triggerHaptic("medium", "both");
    playCardNavSound();
    getActiveDocument(rowRef.current)?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
    onNextSection();
  }, [hasNextSection, onNextSection]);

  const stepCard = useCallback((dir: 1 | -1) => {
    const now = Date.now();
    if (now - lastCardStepAtRef.current < CARD_STEP_COOLDOWN_MS) return;
    lastCardStepAtRef.current = now;
    const row = rowRef.current;
    const doc = getActiveDocument(row);
    if (!row || !doc) return;
    const cards = Array.from(row.querySelectorAll<HTMLElement>(".projacktor-card"));
    if (!cards.length) return;
    const curIdx = cards.findIndex((c) => c === doc.activeElement || c.contains(doc.activeElement as Node));
    const nextIdx = curIdx === -1 ? (dir > 0 ? 0 : cards.length - 1) : (dir > 0 ? (curIdx < cards.length - 1 ? curIdx + 1 : 0) : (curIdx > 0 ? curIdx - 1 : cards.length - 1));
    if (nextIdx !== curIdx || curIdx === -1) {
      const target = cards[nextIdx];
      doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
      target.focus();
      target.classList.add("gpfocus");
      triggerHaptic("light", "both");
      playCardNavSound();
      if (itemsRef.current[nextIdx]) setBackdropMovie(itemsRef.current[nextIdx]);
      row.scrollTo({ left: computeCenteredScrollLeft({ width: row.clientWidth, scrollWidth: row.scrollWidth }, { left: target.offsetLeft, width: target.offsetWidth }), behavior: "smooth" });
    }
  }, []);

  const handleGamepadDirection = useCallback((evt: any) => {
    const btn = evt?.detail?.button;
    if (btn === 9) {
      if (triggerPrevSection()) { evt?.preventDefault?.(); evt?.stopPropagation?.(); return false; }
    } else if (btn === 10 && hasNextSection && onNextSection) {
      evt?.preventDefault?.(); evt?.stopPropagation?.(); triggerNextSection(); return false;
    } else if (btn === 11 || btn === 12) {
      evt?.preventDefault?.(); evt?.stopPropagation?.(); stepCard(btn === 11 ? -1 : 1); return false;
    }
    return undefined;
  }, [triggerPrevSection, triggerNextSection, stepCard, hasNextSection, onNextSection]);

  useShelfListeners({
    shelfRef, rowRef, title, items, autoFocus,
    triggerPrevSection, triggerNextSection, stepCard,
    hasNextSection, onNextSection, onPrevSection,
  });

  return (
    <div ref={shelfRef} className="projacktor-shelf">
      {title && (
        <div className="projacktor-shelf-title">
          <span>{title}</span>
          {loading && <span style={{ fontSize: 12, opacity: 0.6 }}>{t("loading")}</span>}
        </div>
      )}
      <Focusable ref={rowRef} flow-children="row" noFocusRing role="list" aria-label={title} className="projacktor-shelf-row" onGamepadDirection={handleGamepadDirection}>
        {items.map((item, idx) => (
          <MovieCard key={`${title || "media"}-${item.media_type || "item"}-${item.id}-${idx}`} movie={item} onActivate={onSelectMovie} onGamepadDirection={handleGamepadDirection} />
        ))}
        {items.length === 0 && loading && Array.from({ length: 6 }).map((_, idx) => (
          <div key={`shelf-skeleton-${idx}`} tabIndex={0} className="projacktor-card projacktor-card--skeleton" style={{ width: 140, height: 210, flexShrink: 0, background: "rgba(255, 255, 255, 0.05)", borderRadius: 4, opacity: 0.4 }} />
        ))}
        {items.length === 0 && !loading && (
          <div style={{ padding: "20px 10px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{t("noData")}</div>
        )}
        <div style={{ minWidth: 56, minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
      </Focusable>
    </div>
  );
});
