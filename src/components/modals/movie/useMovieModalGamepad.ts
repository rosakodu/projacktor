import { RefObject, useCallback, useRef } from "react";
import { TorrentItem } from "../../../api";
import { getActiveDocument } from "../../../runtime/activeDoc";
import { TorrentSortMode } from "./types";
import { isEvtUp, isEvtDown, isEvtLeft, isEvtRight, scrollContainerToElement } from "./gamepadHelpers";
import { useMovieModalInputListeners } from "./useMovieModalInputListeners";

interface UseMovieModalGamepadProps {
  torrentsRef: RefObject<HTMLDivElement | null>;
  sortedTorrents: TorrentItem[];
  sortMode: TorrentSortMode;
  setSortMode: (m: TorrentSortMode) => void;
  loading: boolean;
  closeModal?: () => void;
}

const SORT_MODES: TorrentSortMode[] = ["seeds", "newest", "oldest"];

export function useMovieModalGamepad({
  torrentsRef, sortedTorrents, sortMode, setSortMode, loading, closeModal,
}: UseMovieModalGamepadProps) {
  const sortedTorrentsRef = useRef(sortedTorrents);
  sortedTorrentsRef.current = sortedTorrents;
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;

  const focusEl = useCallback((el: HTMLElement) => {
    const doc = getActiveDocument(el) || document;
    doc.querySelectorAll(".gpfocus").forEach((item) => item.classList.remove("gpfocus"));
    el.focus();
    el.classList.add("gpfocus", "gpfocuswithin");
    try { (el as any).TakeFocus?.(0); } catch {}
  }, []);

  const lastStepRef = useRef(0);
  const stepSort = useCallback((delta: -1 | 1) => {
    const now = Date.now();
    if (now - lastStepRef.current < 160) return;
    lastStepRef.current = now;
    const curIdx = SORT_MODES.indexOf(sortModeRef.current);
    const nextIdx = Math.max(0, Math.min(SORT_MODES.length - 1, curIdx + delta));
    const nextMode = SORT_MODES[nextIdx];
    if (nextMode !== sortModeRef.current) {
      setSortMode(nextMode);
      try { localStorage.setItem("projacktor_torrent_sort", nextMode); } catch {}
    }
    const doc = getActiveDocument(torrentsRef.current) || document;
    const pills = Array.from(doc.querySelectorAll<HTMLElement>(".projacktor-sort-pill"));
    if (pills[nextIdx]) focusEl(pills[nextIdx]);
  }, [focusEl, setSortMode, torrentsRef]);

  const navigateToCard = useCallback((cardIdx: number, targetType: "first" | "last" = "first") => {
    const root = torrentsRef.current;
    if (!root) return false;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-torrent-card"));
    const targetCard = cards[cardIdx];
    if (!targetCard) return false;
    let targetBtn: HTMLElement | null = null;
    if (targetType === "last") {
      const epRows = targetCard.querySelectorAll<HTMLElement>(".projacktor-torrent-ep-row");
      targetBtn = epRows.length > 0 ? (epRows[epRows.length - 1].querySelector<HTMLElement>(".projacktor-icon-btn") || epRows[epRows.length - 1]) : targetCard.querySelector<HTMLElement>(".projacktor-torrent-retry-btn, .projacktor-torrent-episodes .ds-btn");
    }
    if (!targetBtn) targetBtn = targetCard.querySelector<HTMLElement>(".projacktor-torrent-actions .projacktor-icon-btn");
    if (targetBtn) {
      focusEl(targetBtn);
      scrollContainerToElement(root, targetCard);
      return true;
    }
    return false;
  }, [focusEl, torrentsRef]);

  const navigateToEpisode = useCallback((cardIdx: number, epIdx: number) => {
    const root = torrentsRef.current;
    if (!root) return false;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-torrent-card"));
    const card = cards[cardIdx];
    if (!card) return false;
    const epRows = Array.from(card.querySelectorAll<HTMLElement>(".projacktor-torrent-ep-row"));
    const epRow = epRows[epIdx];
    if (!epRow) return false;
    const btn = epRow.querySelector<HTMLElement>(".projacktor-icon-btn") || epRow;
    if (btn) {
      focusEl(btn);
      scrollContainerToElement(root, epRow);
      return true;
    }
    return false;
  }, [focusEl, torrentsRef]);

  const navigateDownToTorrents = useCallback(() => { navigateToCard(0, "first"); }, [navigateToCard]);

  const navigateUpToWatchlist = useCallback(() => {
    const doc = getActiveDocument(torrentsRef.current) || document;
    const wBtn = doc.querySelector<HTMLElement>(".projacktor-watchlist-btn");
    if (wBtn) focusEl(wBtn);
  }, [focusEl, torrentsRef]);

  const navigateUpToSortBar = useCallback(() => {
    const doc = getActiveDocument(torrentsRef.current) || document;
    const sortBar = doc.querySelector<HTMLElement>(".projacktor-torrent-sort-bar");
    const activePill = doc.querySelector<HTMLElement>(".projacktor-sort-pill--active") || doc.querySelector<HTMLElement>(".projacktor-sort-pill");
    if (sortBar && activePill && sortedTorrentsRef.current.length > 1) focusEl(activePill);
    else navigateUpToWatchlist();
  }, [focusEl, navigateUpToWatchlist, torrentsRef]);

  const handleSortPillGamepad = useCallback((evt: any) => {
    if (isEvtLeft(evt)) { evt?.preventDefault?.(); evt?.stopPropagation?.(); stepSort(-1); return false; }
    if (isEvtRight(evt)) { evt?.preventDefault?.(); evt?.stopPropagation?.(); stepSort(1); return false; }
    if (isEvtDown(evt)) { evt?.preventDefault?.(); evt?.stopPropagation?.(); navigateDownToTorrents(); return false; }
    if (isEvtUp(evt)) { evt?.preventDefault?.(); evt?.stopPropagation?.(); navigateUpToWatchlist(); return false; }
    return undefined;
  }, [stepSort, navigateDownToTorrents, navigateUpToWatchlist]);

  const handleCardGamepad = useCallback((cardIdx: number, isExpanded: boolean, epCount: number, evt: any) => {
    if (isEvtUp(evt)) {
      evt?.preventDefault?.(); evt?.stopPropagation?.();
      if (cardIdx === 0) navigateUpToSortBar();
      else navigateToCard(cardIdx - 1, "last");
      return false;
    }
    if (isEvtDown(evt)) {
      evt?.preventDefault?.(); evt?.stopPropagation?.();
      if (isExpanded) {
        if (epCount > 0) { navigateToEpisode(cardIdx, 0); return false; }
        const card = torrentsRef.current?.querySelectorAll<HTMLElement>(".projacktor-torrent-card")?.[cardIdx];
        const retryBtn = card?.querySelector<HTMLElement>(".projacktor-torrent-retry-btn, .projacktor-torrent-episodes .ds-btn");
        if (retryBtn) { focusEl(retryBtn); return false; }
      }
      if (cardIdx < sortedTorrentsRef.current.length - 1) navigateToCard(cardIdx + 1, "first");
      return false;
    }
    return undefined;
  }, [navigateUpToSortBar, navigateToCard, navigateToEpisode, focusEl, torrentsRef]);

  const handleEpisodeGamepad = useCallback((cardIdx: number, epIdx: number, totalEps: number, evt: any) => {
    if (isEvtUp(evt)) {
      evt?.preventDefault?.(); evt?.stopPropagation?.();
      if (epIdx === 0) navigateToCard(cardIdx, "first");
      else navigateToEpisode(cardIdx, epIdx - 1);
      return false;
    }
    if (isEvtDown(evt)) {
      evt?.preventDefault?.(); evt?.stopPropagation?.();
      if (epIdx < totalEps - 1) navigateToEpisode(cardIdx, epIdx + 1);
      else if (cardIdx < sortedTorrentsRef.current.length - 1) navigateToCard(cardIdx + 1, "first");
      return false;
    }
    return undefined;
  }, [navigateToCard, navigateToEpisode]);

  const handleTorrentFocus = useCallback((e: FocusEvent) => {
    const item = (e.target as HTMLElement)?.closest?.(".projacktor-torrent-card, .projacktor-torrent-item") as HTMLElement | null;
    const container = torrentsRef.current;
    if (item && container) scrollContainerToElement(container, item);
  }, [torrentsRef]);

  useMovieModalInputListeners({
    torrentsRef, sortedTorrents, loading, closeModal,
    stepSort, navigateDownToTorrents, navigateUpToWatchlist, focusEl,
  });

  return {
    focusEl, stepSort, navigateToCard, navigateToEpisode,
    navigateDownToTorrents, navigateUpToWatchlist, navigateUpToSortBar,
    handleSortPillGamepad, handleCardGamepad, handleEpisodeGamepad, handleTorrentFocus,
  };
}
