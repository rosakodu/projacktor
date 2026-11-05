import { useState, useRef, useEffect, useCallback, RefObject, MutableRefObject } from "react";
import { setPlayerActive } from "../../runtime/homeInputBus";
import { getActiveDocument } from "../../runtime/activeDoc";
import { playNavSound } from "../../runtime/navSound";
import { AudioTrack, SubtitleTrack } from "./types";
import { usePlayerFocusVolume } from "./usePlayerFocusVolume";

function useSyncedState<T>(initial: T): [T, (val: T | ((p: T) => T)) => void, MutableRefObject<T>] {
  const [state, setState] = useState<T>(initial);
  const ref = useRef<T>(state); ref.current = state;
  const setSync = useCallback((val: T | ((p: T) => T)) => {
    if (typeof val === "function") {
      setState((prev) => { const next = (val as (p: T) => T)(prev); ref.current = next; return next; });
    } else { ref.current = val; setState(val); }
  }, []);
  return [state, setSync, ref];
}

interface UsePlayerNavigationProps {
  containerRef: RefObject<HTMLDivElement | null>; videoRef: RefObject<HTMLVideoElement | null>;
  playBtnRef: RefObject<HTMLDivElement | null>; subtitleMenuRef: RefObject<HTMLDivElement | null>; audioMenuRef: RefObject<HTMLDivElement | null>;
  isPlaying?: boolean | (() => boolean);
  selectedSubtitle?: number | string | null | (() => number | string | null) | RefObject<number | string | null> | { current: number | string | null };
  selectedAudio?: number; subtitleTracks: SubtitleTrack[]; audioTracks: AudioTrack[];
}

export function usePlayerNavigation({
  containerRef, videoRef, playBtnRef, subtitleMenuRef, audioMenuRef,
  isPlaying, selectedSubtitle, selectedAudio, subtitleTracks, audioTracks,
}: UsePlayerNavigationProps) {
  const [showControls, setControlsVisible, showControlsRef] = useSyncedState<boolean>(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  const [showAudioMenu, setAudioMenuVisible, showAudioMenuRef] = useSyncedState<boolean>(false);
  const [showSubtitleMenu, setSubtitleMenuVisible, showSubtitleMenuRef] = useSyncedState<boolean>(false);
  const [activeSubMenuIdx, setActiveSubMenuIdx] = useState<number>(0);
  const activeSubMenuIdxRef = useRef<number>(0); activeSubMenuIdxRef.current = activeSubMenuIdx;
  const [activeAudioMenuIdx, setActiveAudioMenuIdx] = useState<number>(0);
  const activeAudioMenuIdxRef = useRef<number>(0); activeAudioMenuIdxRef.current = activeAudioMenuIdx;
  const lastMenuNavTimeRef = useRef<number>(0); const isPlayingRef = useRef(isPlaying); isPlayingRef.current = isPlaying;

  const checkIsPlaying = useCallback(() => {
    const val = isPlayingRef.current;
    if (typeof val === "function") return val();
    if (typeof val === "boolean") return val;
    return videoRef.current ? (!videoRef.current.paused && !videoRef.current.ended) : false;
  }, [videoRef]);

  const getSelectedSubtitle = useCallback((): number | string | null => {
    if (typeof selectedSubtitle === "function") return (selectedSubtitle as any)();
    return selectedSubtitle && typeof selectedSubtitle === "object" && "current" in selectedSubtitle
      ? (selectedSubtitle as any).current : (selectedSubtitle ?? null);
  }, [selectedSubtitle]);

  const { volume, volumeHudVisible, lastFocusedBtnRef, changeVolume, focusControl, restoreControlsFocus } =
    usePlayerFocusVolume({ containerRef, videoRef, playBtnRef });

  useEffect(() => {
    setPlayerActive(true); containerRef.current?.requestFullscreen?.().catch(() => {});
    return () => { setPlayerActive(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, [containerRef]);

  const clearControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current !== null) { window.clearTimeout(controlsTimeoutRef.current); controlsTimeoutRef.current = null; }
  }, []);

  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true); clearControlsTimeout();
    if (checkIsPlaying() && !showAudioMenuRef.current && !showSubtitleMenuRef.current) {
      controlsTimeoutRef.current = window.setTimeout(() => setControlsVisible(false), 5000);
    }
  }, [checkIsPlaying, clearControlsTimeout, setControlsVisible]);

  const hideControls = useCallback(() => {
    setControlsVisible(false); setAudioMenuVisible(false); setSubtitleMenuVisible(false);
    clearControlsTimeout();
  }, [clearControlsTimeout, setControlsVisible, setAudioMenuVisible, setSubtitleMenuVisible]);

  const toggleControls = useCallback(() => {
    if (showControlsRef.current) hideControls();
    else resetControlsTimer();
  }, [hideControls, resetControlsTimer]);

  const handleMenuDirection = useCallback((dir: "up" | "down", menuKey: "sub" | "audio") => {
    const now = Date.now();
    if (now - lastMenuNavTimeRef.current < 200) return;
    lastMenuNavTimeRef.current = now;
    const isSub = menuKey === "sub"; const total = isSub ? 1 + subtitleTracks.length : audioTracks.length;
    if (total <= 0) return;
    const curRef = isSub ? activeSubMenuIdxRef : activeAudioMenuIdxRef;
    const next = Math.max(0, Math.min(total - 1, dir === "down" ? curRef.current + 1 : curRef.current - 1));
    if (next !== curRef.current) {
      (isSub ? setActiveSubMenuIdx : setActiveAudioMenuIdx)(next); playNavSound();
      (isSub ? subtitleMenuRef : audioMenuRef).current?.querySelectorAll<HTMLElement>(".ds-btn")?.[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [subtitleTracks.length, audioTracks.length, subtitleMenuRef, audioMenuRef]);

  const lastSubToggleRef = useRef<number>(0);
  const toggleSubtitleMenu = useCallback(() => {
    if (Date.now() - lastSubToggleRef.current < 250) return;
    lastSubToggleRef.current = Date.now();
    setControlsVisible(true);
    setSubtitleMenuVisible((prev) => !prev);
    setAudioMenuVisible(false);
  }, [setControlsVisible, setSubtitleMenuVisible, setAudioMenuVisible]);
  const lastAudioToggleRef = useRef<number>(0);
  const toggleAudioMenu = useCallback(() => {
    if (Date.now() - lastAudioToggleRef.current < 250) return;
    lastAudioToggleRef.current = Date.now();
    setControlsVisible(true);
    setAudioMenuVisible((prev) => !prev);
    setSubtitleMenuVisible(false);
  }, [setControlsVisible, setAudioMenuVisible, setSubtitleMenuVisible]);

  useEffect(() => {
    if (showAudioMenu || showSubtitleMenu) clearControlsTimeout();
    else resetControlsTimer();
    return () => clearControlsTimeout();
  }, [showAudioMenu, showSubtitleMenu, resetControlsTimer, clearControlsTimeout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return clearControlsTimeout;
    const onPlay = () => { if (showControlsRef.current) resetControlsTimer(); };
    const onPause = () => {
      if (!video.seeking) setControlsVisible(true);
      clearControlsTimeout();
    };
    video.addEventListener("play", onPlay); video.addEventListener("pause", onPause);
    if (!video.paused) resetControlsTimer();
    return () => {
      video.removeEventListener("play", onPlay); video.removeEventListener("pause", onPause);
      clearControlsTimeout();
    };
  }, [videoRef, resetControlsTimer, clearControlsTimeout, setControlsVisible]);

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
    showControls, setShowControls: setControlsVisible, showControlsRef,
    showAudioMenu, setShowAudioMenu: setAudioMenuVisible, showAudioMenuRef,
    showSubtitleMenu, setShowSubtitleMenu: setSubtitleMenuVisible, showSubtitleMenuRef,
    volume, volumeHudVisible, activeSubMenuIdx, setActiveSubMenuIdx, activeSubMenuIdxRef,
    activeAudioMenuIdx, setActiveAudioMenuIdx, activeAudioMenuIdxRef, lastFocusedBtnRef,
    resetControlsTimer, hideControls, toggleControls, changeVolume,
    focusControl, restoreControlsFocus, handleMenuDirection,
    toggleSubtitleMenu, toggleAudioMenu,
  };
}
