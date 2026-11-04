import { useState, useRef, useEffect, useCallback, RefObject } from "react";
import { getActiveDocument } from "../../runtime/activeDoc";
import { triggerHaptic } from "../../runtime/haptics";

interface FocusVolumeProps {
  containerRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  playBtnRef: RefObject<HTMLDivElement | null>;
}

export function usePlayerFocusVolume({
  containerRef, videoRef, playBtnRef,
}: FocusVolumeProps) {
  const [volume, setVolume] = useState<number>(1);
  const [volumeHudVisible, setVolumeHudVisible] = useState<boolean>(false);
  const volumeHudTimerRef = useRef<number | null>(null);
  const lastFocusedBtnRef = useRef<HTMLElement | null>(null);

  const changeVolume = useCallback((delta: number) => {
    setVolume((prev) => {
      const next = Math.max(0, Math.min(1, Math.round((prev + delta) * 20) / 20));
      if (videoRef.current) videoRef.current.volume = next;
      triggerHaptic(next === 0 || next === 1 ? "medium" : "light", "both");
      return next;
    });
    setVolumeHudVisible(true);
    if (volumeHudTimerRef.current !== null) window.clearTimeout(volumeHudTimerRef.current);
    volumeHudTimerRef.current = window.setTimeout(() => setVolumeHudVisible(false), 1200);
  }, [videoRef]);

  const focusControl = useCallback((el: HTMLElement) => {
    try {
      const doc = getActiveDocument(el) || document;
      doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((item) => {
        if (item !== el) item.classList.remove("gpfocus");
      });
      el.focus();
      el.classList.add("gpfocus", "gpfocuswithin");
      try { (el as any).TakeFocus?.(0); } catch {}
      lastFocusedBtnRef.current = el;
    } catch {}
  }, []);

  const restoreControlsFocus = useCallback(() => {
    const targetEl = (lastFocusedBtnRef.current && containerRef.current?.contains(lastFocusedBtnRef.current) && lastFocusedBtnRef.current.isConnected)
      ? lastFocusedBtnRef.current : playBtnRef.current;
    if (targetEl) focusControl(targetEl);
  }, [focusControl, containerRef, playBtnRef]);

  useEffect(() => {
    const focusPlayBtn = () => {
      if (playBtnRef.current) { focusControl(playBtnRef.current); return true; }
      return false;
    };
    if (!focusPlayBtn()) {
      const t1 = setTimeout(focusPlayBtn, 50);
      const t2 = setTimeout(focusPlayBtn, 150);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    return undefined;
  }, [focusControl, playBtnRef]);

  return {
    volume, volumeHudVisible, lastFocusedBtnRef,
    changeVolume, focusControl, restoreControlsFocus,
  };
}
