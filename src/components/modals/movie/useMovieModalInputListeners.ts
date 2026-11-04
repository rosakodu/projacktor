import { RefObject, useEffect } from "react";
import { RawButton, subscribeControllerInput } from "../../../runtime/controllerInput";
import { getActiveDocument } from "../../../runtime/activeDoc";
import { setMovieModalActive, isPlayerActive } from "../../../runtime/homeInputBus";
import { TorrentItem } from "../../../api";

interface InputListenersProps {
  torrentsRef: RefObject<HTMLDivElement | null>;
  sortedTorrents: TorrentItem[];
  loading: boolean;
  closeModal?: () => void;
  stepSort: (delta: -1 | 1) => void;
  navigateDownToTorrents: () => void;
  navigateUpToWatchlist: () => void;
  focusEl: (el: HTMLElement) => void;
}

export function useMovieModalInputListeners({
  torrentsRef, sortedTorrents, loading, closeModal,
  stepSort, navigateDownToTorrents, navigateUpToWatchlist, focusEl,
}: InputListenersProps) {
  useEffect(() => {
    setMovieModalActive(true);
    return () => setMovieModalActive(false);
  }, []);

  useEffect(() => {
    let lastClose = 0;
    const triggerClose = () => {
      const now = Date.now();
      if (now - lastClose < 250) return;
      lastClose = now;
      if (closeModal) closeModal();
    };
    const un = subscribeControllerInput((e) => {
      if (!e.pressed || isPlayerActive()) return;
      if (e.button === RawButton.B || e.button === 1) triggerClose();
    });
    const doc = getActiveDocument(torrentsRef.current);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPlayerActive()) return;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault(); e.stopPropagation(); triggerClose(); return;
      }
      const active = doc?.activeElement as HTMLElement | null;
      if (!active) return;
      if (active.classList.contains("projacktor-sort-pill") || active.closest(".projacktor-torrent-sort-bar")) {
        if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); stepSort(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); stepSort(1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); navigateDownToTorrents(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); navigateUpToWatchlist(); }
      } else if (active.classList.contains("projacktor-watchlist-btn") || active.closest(".projacktor-watchlist-btn")) {
        if (e.key === "ArrowDown") {
          e.preventDefault(); e.stopPropagation();
          const sortBar = doc?.querySelector<HTMLElement>(".projacktor-torrent-sort-bar");
          const activePill = doc?.querySelector<HTMLElement>(".projacktor-sort-pill--active") || doc?.querySelector<HTMLElement>(".projacktor-sort-pill");
          if (sortBar && activePill && sortedTorrents.length > 1) focusEl(activePill);
          else navigateDownToTorrents();
        }
      }
    };
    if (doc) doc.addEventListener("keydown", handleKeyDown, true);
    return () => { un(); if (doc) doc.removeEventListener("keydown", handleKeyDown, true); };
  }, [closeModal, stepSort, navigateDownToTorrents, navigateUpToWatchlist, focusEl, sortedTorrents.length, torrentsRef]);

  useEffect(() => {
    const focusWatchlist = () => {
      const doc = getActiveDocument(torrentsRef.current) || document;
      const btn = doc.querySelector<HTMLElement>(".projacktor-watchlist-btn");
      if (btn) { focusEl(btn); return true; }
      return false;
    };
    if (!focusWatchlist()) {
      const t1 = setTimeout(focusWatchlist, 40);
      const t2 = setTimeout(focusWatchlist, 120);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    return undefined;
  }, [focusEl, torrentsRef]);

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      const root = torrentsRef.current;
      if (!root) return;
      const doc = getActiveDocument(root) || document;
      const active = doc.activeElement;
      if (active && (active.classList.contains("projacktor-watchlist-btn") || active.closest(".projacktor-watchlist-btn") || active.classList.contains("projacktor-sort-pill") || active.closest(".projacktor-torrent-sort-bar") || root.contains(active))) return;
      const firstAction = root.querySelector<HTMLElement>(".projacktor-torrent-actions .projacktor-icon-btn, .projacktor-icon-btn, .ds-btn--primary, button");
      if (firstAction) focusEl(firstAction);
    }, 50);
    return () => clearTimeout(timer);
  }, [loading, sortedTorrents.length, focusEl, torrentsRef]);
}
