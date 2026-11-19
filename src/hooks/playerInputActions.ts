import type { RefObject } from "react";
import { getActiveDocument, isOverlayActiveOrRecent } from "../runtime/activeDoc";
import { triggerHaptic } from "../runtime/haptics";
import type { AudioTrack, SubtitleTrack } from "../components/player/types";

export type BoolRef = RefObject<boolean | null | undefined> | { current: boolean };

export interface PlayerInputActionContext {
  containerRef: RefObject<HTMLDivElement | null>;
  playBtnRef: RefObject<HTMLDivElement | null>;
  subtitleBtnRef: RefObject<HTMLDivElement | null>;
  audioBtnRef: RefObject<HTMLDivElement | null>;
  showControlsRef: BoolRef;
  showAudioMenuRef: BoolRef;
  showSubtitleMenuRef: BoolRef;
  setShowAudioMenu: (show: boolean) => void;
  setShowSubtitleMenu: (show: boolean) => void;
  setShowControls: (show: boolean) => void;
  closeModalRef: RefObject<(() => void) | undefined>;
  audioTracksRef: RefObject<AudioTrack[] | null | undefined> | { current: AudioTrack[] };
  subtitleTracksRef: RefObject<SubtitleTrack[] | null | undefined> | { current: SubtitleTrack[] };
  activeAudioMenuIdxRef: RefObject<number | null | undefined> | { current: number };
  activeSubMenuIdxRef: RefObject<number | null | undefined> | { current: number };
  toggleAudioMenu: () => void;
  toggleSubtitleMenu: () => void;
  selectAudioTrack: (trackIndex: number) => void;
  selectSubtitleTrack: (trackIndex: number | string | null) => void;
  resetControlsTimer: () => void;
  toggleControls?: () => void;
}

function closeMenuAndRestoreFocus(
  menuRef: BoolRef,
  setMenu: (show: boolean) => void,
  btnRef: RefObject<HTMLDivElement | null>,
  ctx: Pick<PlayerInputActionContext, "showControlsRef" | "setShowControls" | "resetControlsTimer">
): void {
  menuRef.current = false;
  setMenu(false);
  ctx.showControlsRef.current = true;
  ctx.setShowControls(true);
  ctx.resetControlsTimer();
  setTimeout(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const doc = getActiveDocument(btn) || document;
    doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
    btn.focus();
    try { (btn as unknown as { TakeFocus?: (dir: number) => void }).TakeFocus?.(0); } catch {}
    btn.classList.add("gpfocus");
  }, 50);
}

/** Shared activation handler for gamepad A and keyboard Space/Enter/K. */
export function handlePlayerActivate(ctx: PlayerInputActionContext, onTogglePlay: () => void): void {
  if (ctx.showAudioMenuRef.current) {
    const idx = ctx.activeAudioMenuIdxRef.current || 0;
    const track = ctx.audioTracksRef.current?.[idx];
    if (track) ctx.selectAudioTrack(track.index);
    else ctx.setShowAudioMenu(false);
    return;
  }

  if (ctx.showSubtitleMenuRef.current) {
    const idx = ctx.activeSubMenuIdxRef.current || 0;
    if (idx === 0) {
      ctx.selectSubtitleTrack(null);
    } else {
      const sub = ctx.subtitleTracksRef.current?.[idx - 1];
      if (sub && sub.supported !== false) ctx.selectSubtitleTrack(sub.index);
      else ctx.setShowSubtitleMenu(false);
    }
    return;
  }

  if (!ctx.showControlsRef.current) {
    onTogglePlay();
    return;
  }

  const doc = getActiveDocument(ctx.containerRef.current) || document;
  const activeEl =
    doc?.activeElement && doc.activeElement !== doc.body && ctx.containerRef.current?.contains(doc.activeElement)
      ? (doc.activeElement as HTMLElement)
      : null;
  const gpfocus = doc?.querySelector?.(".projacktor-player-fullscreen .gpfocus") as HTMLElement | null;
  const focusedEl = activeEl || gpfocus;

  if (ctx.subtitleBtnRef.current && (ctx.subtitleBtnRef.current === focusedEl || ctx.subtitleBtnRef.current.contains(focusedEl as Node))) {
    ctx.toggleSubtitleMenu();
    return;
  }

  if (ctx.audioBtnRef.current && (ctx.audioBtnRef.current === focusedEl || ctx.audioBtnRef.current.contains(focusedEl as Node))) {
    ctx.toggleAudioMenu();
    return;
  }

  // Allow native Focusable.onActivate when focus is on another interactive button.
  if (
    focusedEl &&
    focusedEl !== ctx.playBtnRef.current &&
    !ctx.playBtnRef.current?.contains(focusedEl) &&
    focusedEl !== ctx.containerRef.current &&
    focusedEl !== doc?.body &&
    !focusedEl.classList.contains("projacktor-player-fullscreen")
  ) {
    return;
  }

  onTogglePlay();
}

/** Shared back handler for gamepad B and keyboard Escape/Backspace. */
export function handlePlayerBack(ctx: PlayerInputActionContext): void {
  if (isOverlayActiveOrRecent(1200)) return;
  if (ctx.showAudioMenuRef.current) {
    closeMenuAndRestoreFocus(ctx.showAudioMenuRef, ctx.setShowAudioMenu, ctx.audioBtnRef, ctx);
  } else if (ctx.showSubtitleMenuRef.current) {
    closeMenuAndRestoreFocus(ctx.showSubtitleMenuRef, ctx.setShowSubtitleMenu, ctx.subtitleBtnRef, ctx);
  } else if (ctx.closeModalRef.current) {
    ctx.closeModalRef.current();
  }
}

/** Shared controls visibility toggle for gamepad L3 and keyboard H. */
export function handlePlayerToggleControls(ctx: PlayerInputActionContext): void {
  triggerHaptic("click", "left");
  if (ctx.toggleControls) {
    ctx.toggleControls();
  } else if (ctx.showControlsRef.current) {
    ctx.setShowControls(false);
    ctx.setShowAudioMenu(false);
    ctx.setShowSubtitleMenu(false);
  } else {
    ctx.setShowControls(true);
    ctx.resetControlsTimer();
  }
}
