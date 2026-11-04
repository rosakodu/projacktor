import { useState, useRef, useEffect, useCallback, RefObject } from "react";
import { setPlayerActive } from "../../runtime/homeInputBus";
import { getActiveDocument } from "../../runtime/activeDoc";
import { playNavSound } from "../../runtime/navSound";
import { AudioTrack, SubtitleTrack } from "./types";
import { usePlayerFocusVolume } from "./usePlayerFocusVolume";

interface UsePlayerNavigationProps {
  containerRef: RefObject<HTMLDivElement | null>; videoRef: RefObject<HTMLVideoElement | null>;
  playBtnRef: RefObject<HTMLDivElement | null>; subtitleMenuRef: RefObject<HTMLDivElement | null>;
  audioMenuRef: RefObject<HTMLDivElement | null>;
  isPlaying?: boolean | (() => boolean);
  selectedSubtitle?: number | string | null | (() => number | string | null) | RefObject<number | string | null> | { current: number | string | null };
  selectedAudio?: number; subtitleTracks: SubtitleTrack[]; audioTracks: AudioTrack[];
}

export function usePlayerNavigation({
  containerRef, videoRef, playBtnRef, subtitleMenuRef, audioMenuRef,
  isPlaying, selectedSubtitle, selectedAudio, subtitleTracks, audioTracks,
}: UsePlayerNavigationProps) {
  const [showControls, setShowControls] = useState<boolean>(true);
  const showControlsRef = useRef<boolean>(showControls); showControlsRef.current = showControls;
  const controlsTimeoutRef = useRef<number | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const showAudioMenuRef = useRef(showAudioMenu); showAudioMenuRef.current = showAudioMenu;
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const showSubtitleMenuRef = useRef(showSubtitleMenu); showSubtitleMenuRef.current = showSubtitleMenu;
  const [activeSubMenuIdx, setActiveSubMenuIdx] = useState<number>(0);
  const activeSubMenuIdxRef = useRef<number>(0); activeSubMenuIdxRef.current = activeSubMenuIdx;
  const [activeAudioMenuIdx, setActiveAudioMenuIdx] = useState<number>(0);
  const activeAudioMenuIdxRef = useRef<number>(0); activeAudioMenuIdxRef.current = activeAudioMenuIdx;
  const lastMenuNavTimeRef = useRef<number>(0);

  const checkIsPlaying = useCallback(() => {
    if (typeof isPlaying === "function") return isPlaying();
    if (typeof isPlaying === "boolean") return isPlaying;
    if (videoRef.current) return !videoRef.current.paused;
    return true;
  }, [isPlaying, videoRef]);

  const getSelectedSubtitle = useCallback((): number | string | null => {
    if (typeof selectedSubtitle === "function") return (selectedSubtitle as any)();
    if (selectedSubtitle && typeof selectedSubtitle === "object" && "current" in selectedSubtitle) {
      return (selectedSubtitle as any).current;
    }
    return selectedSubtitle ?? null;
  }, [selectedSubtitle]);

  const {
    volume, volumeHudVisible, lastFocusedBtnRef, changeVolume, focusControl, restoreControlsFocus,
  } = usePlayerFocusVolume({ containerRef, videoRef, playBtnRef });

  useEffect(() => {
    setPlayerActive(true);
    const el = containerRef.current;
    if (el && typeof el.requestFullscreen === "function") el.requestFullscreen().catch(() => {});
    return () => {
      setPlayerActive(false);
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") document.exitFullscreen().catch(() => {});
    };
  }, [containerRef]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
    if (checkIsPlaying() && !showAudioMenu && !showSubtitleMenu) {
      controlsTimeoutRef.current = window.setTimeout(() => setShowControls(false), 3000);
    }
  }, [checkIsPlaying, showAudioMenu, showSubtitleMenu]);

  const hideControls = useCallback(() => {
    setShowControls(false); setShowAudioMenu(false); setShowSubtitleMenu(false);
    if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
  }, []);

  const toggleControls = useCallback(() => {
    if (showControlsRef.current) hideControls();
    else { setShowControls(true); resetControlsTimer(); }
  }, [hideControls, resetControlsTimer]);

  const handleMenuDirection = useCallback((dir: "up" | "down", menuKey: "sub" | "audio") => {
    const now = Date.now();
    if (now - lastMenuNavTimeRef.current < 200) return;
    lastMenuNavTimeRef.current = now;
    if (menuKey === "sub") {
      const total = 1 + subtitleTracks.length;
      if (total <= 0) return;
      const next = Math.max(0, Math.min(total - 1, dir === "down" ? activeSubMenuIdxRef.current + 1 : activeSubMenuIdxRef.current - 1));
      if (next !== activeSubMenuIdxRef.current) {
        setActiveSubMenuIdx(next);
        playNavSound();
        subtitleMenuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else {
      const total = audioTracks.length;
      if (total <= 0) return;
      const next = Math.max(0, Math.min(total - 1, dir === "down" ? activeAudioMenuIdxRef.current + 1 : activeAudioMenuIdxRef.current - 1));
      if (next !== activeAudioMenuIdxRef.current) {
        setActiveAudioMenuIdx(next);
        playNavSound();
        audioMenuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [subtitleTracks.length, audioTracks.length, subtitleMenuRef, audioMenuRef]);

  const lastSubToggleRef = useRef<number>(0);
  const toggleSubtitleMenu = useCallback(() => {
    if (Date.now() - lastSubToggleRef.current < 250) return;
    lastSubToggleRef.current = Date.now();
    setShowSubtitleMenu((prev) => !prev);
    setShowAudioMenu(false); setShowControls(true); resetControlsTimer();
  }, [resetControlsTimer]);

  const lastAudioToggleRef = useRef<number>(0);
  const toggleAudioMenu = useCallback(() => {
    if (Date.now() - lastAudioToggleRef.current < 250) return;
    lastAudioToggleRef.current = Date.now();
    setShowAudioMenu((prev) => !prev);
    setShowSubtitleMenu(false); setShowControls(true); resetControlsTimer();
  }, [resetControlsTimer]);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimeoutRef.current !== null) window.clearTimeout(controlsTimeoutRef.current); };
  }, [resetControlsTimer]);

  useEffect(() => {
    if (!showSubtitleMenu) return undefined;
    const curSub = getSelectedSubtitle();
    const found = curSub !== null && curSub !== undefined ? subtitleTracks.findIndex((s) => s.index === curSub) : -1;
    const idx = found !== -1 ? found + 1 : 0;
    setActiveSubMenuIdx(idx);
    const t = setTimeout(() => {
      const target = subtitleMenuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[idx] || subtitleMenuRef.current?.querySelector<HTMLElement>(".ds-btn");
      if (target) { target.focus(); target.classList.add("gpfocus"); target.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }, 40);
    return () => clearTimeout(t);
  }, [showSubtitleMenu, getSelectedSubtitle, subtitleTracks, subtitleMenuRef]);

  useEffect(() => {
    if (!showAudioMenu) return undefined;
    const found = selectedAudio !== undefined ? audioTracks.findIndex((a) => a.index === selectedAudio) : -1;
    const idx = found !== -1 ? found : 0;
    setActiveAudioMenuIdx(idx);
    const t = setTimeout(() => {
      const target = audioMenuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[idx] || audioMenuRef.current?.querySelector<HTMLElement>(".ds-btn");
      if (target) { target.focus(); target.classList.add("gpfocus"); target.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }, 40);
    return () => clearTimeout(t);
  }, [showAudioMenu, selectedAudio, audioTracks, audioMenuRef]);

  const prevShowControlsRef = useRef<boolean>(showControls);
  useEffect(() => {
    const wasHidden = !prevShowControlsRef.current;
    prevShowControlsRef.current = showControls;
    if (showControls && wasHidden && !showSubtitleMenu && !showAudioMenu) {
      const t = setTimeout(() => restoreControlsFocus(), 40);
      return () => clearTimeout(t);
    } else if (!showControls && containerRef.current) {
      const doc = getActiveDocument(containerRef.current) || document;
      doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => { if (el !== containerRef.current) el.classList.remove("gpfocus"); });
      containerRef.current.setAttribute("tabindex", "0");
      containerRef.current.focus();
      containerRef.current.classList.add("gpfocus", "gpfocuswithin");
    }
    return undefined;
  }, [showControls, showSubtitleMenu, showAudioMenu, restoreControlsFocus, containerRef]);

  return {
    showControls, setShowControls, showControlsRef, showAudioMenu, setShowAudioMenu,
    showAudioMenuRef, showSubtitleMenu, setShowSubtitleMenu, showSubtitleMenuRef,
    volume, volumeHudVisible, activeSubMenuIdx, setActiveSubMenuIdx, activeSubMenuIdxRef,
    activeAudioMenuIdx, setActiveAudioMenuIdx, activeAudioMenuIdxRef, lastFocusedBtnRef,
    resetControlsTimer, hideControls, toggleControls, changeVolume,
    focusControl, restoreControlsFocus, handleMenuDirection,
    toggleSubtitleMenu, toggleAudioMenu,
  };
}
