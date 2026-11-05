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
  const lastMenuNavTimeRef = useRef<number>(0); const isPlayingRef = useRef(isPlaying); isPlayingRef.current = isPlaying;

  const checkIsPlaying = useCallback(() => {
    const val = isPlayingRef.current;
    if (typeof val === "function") return val();
    if (typeof val === "boolean") return val;
    if (videoRef.current) return !videoRef.current.paused;
    return true;
  }, [videoRef]);

  const getSelectedSubtitle = useCallback((): number | string | null => {
    if (typeof selectedSubtitle === "function") return (selectedSubtitle as any)();
    if (selectedSubtitle && typeof selectedSubtitle === "object" && "current" in selectedSubtitle) return (selectedSubtitle as any).current;
    return selectedSubtitle ?? null;
  }, [selectedSubtitle]);

  const { volume, volumeHudVisible, lastFocusedBtnRef, changeVolume, focusControl, restoreControlsFocus } =
    usePlayerFocusVolume({ containerRef, videoRef, playBtnRef });

  useEffect(() => {
    setPlayerActive(true);
    containerRef.current?.requestFullscreen?.().catch(() => {});
    return () => {
      setPlayerActive(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [containerRef]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
    if (checkIsPlaying() && !showAudioMenuRef.current && !showSubtitleMenuRef.current) {
      controlsTimeoutRef.current = window.setTimeout(() => setShowControls(false), 5000);
    }
  }, [checkIsPlaying]);

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
    const isSub = menuKey === "sub";
    const total = isSub ? 1 + subtitleTracks.length : audioTracks.length;
    if (total <= 0) return;
    const curRef = isSub ? activeSubMenuIdxRef : activeAudioMenuIdxRef;
    const setIdx = isSub ? setActiveSubMenuIdx : setActiveAudioMenuIdx;
    const menuRef = isSub ? subtitleMenuRef : audioMenuRef;
    const next = Math.max(0, Math.min(total - 1, dir === "down" ? curRef.current + 1 : curRef.current - 1));
    if (next !== curRef.current) {
      setIdx(next); playNavSound();
      menuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [subtitleTracks.length, audioTracks.length, subtitleMenuRef, audioMenuRef]);

  const lastSubToggleRef = useRef<number>(0);
  const toggleSubtitleMenu = useCallback(() => {
    if (Date.now() - lastSubToggleRef.current < 250) return;
    lastSubToggleRef.current = Date.now();
    setShowSubtitleMenu((prev) => !prev); setShowAudioMenu(false); setShowControls(true);
  }, []);

  const lastAudioToggleRef = useRef<number>(0);
  const toggleAudioMenu = useCallback(() => {
    if (Date.now() - lastAudioToggleRef.current < 250) return;
    lastAudioToggleRef.current = Date.now();
    setShowAudioMenu((prev) => !prev); setShowSubtitleMenu(false); setShowControls(true);
  }, []);

  useEffect(() => {
    if (showAudioMenu || showSubtitleMenu) {
      if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
    } else resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
    };
  }, [showAudioMenu, showSubtitleMenu, resetControlsTimer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return () => { if (controlsTimeoutRef.current !== null) window.clearTimeout(controlsTimeoutRef.current); };
    const onPlay = () => {
      if (!showControlsRef.current) return;
      if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
      if (checkIsPlaying() && !showAudioMenuRef.current && !showSubtitleMenuRef.current) controlsTimeoutRef.current = window.setTimeout(() => setShowControls(false), 5000);
    };
    const onPause = () => {
      if (video.currentTime > 0 && !video.seeking) {
        setShowControls(true);
        if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
      }
    };
    video.addEventListener("play", onPlay); video.addEventListener("pause", onPause);
    if (!video.paused) resetControlsTimer();
    return () => {
      video.removeEventListener("play", onPlay); video.removeEventListener("pause", onPause);
      if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
    };
  }, [videoRef, checkIsPlaying, resetControlsTimer]);

  useEffect(() => {
    if (!showSubtitleMenu && !showAudioMenu) return undefined;
    const isSub = showSubtitleMenu; const cur = isSub ? getSelectedSubtitle() : selectedAudio;
    const tracks = isSub ? subtitleTracks : audioTracks;
    const found = cur !== null && cur !== undefined ? tracks.findIndex((t: any) => t.index === cur) : -1;
    const idx = isSub ? found + 1 : (found !== -1 ? found : 0);
    if (isSub) setActiveSubMenuIdx(idx); else setActiveAudioMenuIdx(idx);
    const menuRef = isSub ? subtitleMenuRef : audioMenuRef;
    const t = setTimeout(() => {
      const el = menuRef.current?.querySelectorAll<HTMLElement>(".ds-btn")?.[idx] || menuRef.current?.querySelector<HTMLElement>(".ds-btn");
      if (el) { el.focus(); el.classList.add("gpfocus"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }, 40);
    return () => clearTimeout(t);
  }, [showSubtitleMenu, showAudioMenu, getSelectedSubtitle, selectedAudio, subtitleTracks, audioTracks, subtitleMenuRef, audioMenuRef]);

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
      containerRef.current.setAttribute("tabindex", "0"); containerRef.current.focus(); containerRef.current.classList.add("gpfocus", "gpfocuswithin");
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
