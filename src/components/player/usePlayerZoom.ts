import { useState, useRef, useCallback, useEffect, RefObject } from "react";
import { triggerHaptic } from "../../runtime/haptics";

export interface UsePlayerZoomReturn {
  zoom: number;
  zoomRef: React.MutableRefObject<number>;
  zoomHudVisible: boolean;
  zoomHudTimerRef: React.MutableRefObject<number | null>;
  zoomHudTextRef: React.RefObject<HTMLSpanElement | null>;
  zoomHudBarRef: React.RefObject<HTMLDivElement | null>;
  l2HeldRef: React.MutableRefObject<boolean>;
  r2HeldRef: React.MutableRefObject<boolean>;
  l2PressStartRef: React.MutableRefObject<number>;
  r2PressStartRef: React.MutableRefObject<number>;
  zoomAnimFrameRef: React.MutableRefObject<number | null>;
  applyZoomStep: (step: number) => void;
  resetZoom: () => void;
  startZoomLoop: () => void;
  stopZoomLoop: () => void;
  showZoomHud: () => void;
}

export function usePlayerZoom(
  videoRef: RefObject<HTMLVideoElement | null>
): UsePlayerZoomReturn {
  const [zoom, setZoom] = useState<number>(1);
  const zoomRef = useRef<number>(1);
  const [zoomHudVisible, setZoomHudVisible] = useState<boolean>(false);
  const zoomHudTimerRef = useRef<number | null>(null);
  const zoomHudTextRef = useRef<HTMLSpanElement>(null);
  const zoomHudBarRef = useRef<HTMLDivElement>(null);
  const l2HeldRef = useRef<boolean>(false);
  const r2HeldRef = useRef<boolean>(false);
  const l2PressStartRef = useRef<number>(0);
  const r2PressStartRef = useRef<number>(0);
  const zoomAnimFrameRef = useRef<number | null>(null);

  const showZoomHud = useCallback(() => {
    setZoomHudVisible(true);
    if (zoomHudTimerRef.current !== null) {
      window.clearTimeout(zoomHudTimerRef.current);
    }
    zoomHudTimerRef.current = window.setTimeout(() => {
      setZoomHudVisible(false);
      zoomHudTimerRef.current = null;
    }, 1200);
  }, []);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1.0;
    setZoom(1.0);
    triggerHaptic("click", "both", true);
    if (videoRef.current) {
      videoRef.current.style.transform = "scale(1)";
    }
    if (zoomHudTextRef.current) {
      zoomHudTextRef.current.textContent = "100%";
    }
    if (zoomHudBarRef.current) {
      zoomHudBarRef.current.style.width = "20%";
      zoomHudBarRef.current.style.background = "var(--ds-accent)";
    }
    showZoomHud();
  }, [videoRef, showZoomHud]);

  // Одиночный дискретный шаг масштаба (ровно 1% за нажатие)
  const applyZoomStep = useCallback(
    (step: number) => {
      const nextZoom = Math.max(
        0.5,
        Math.min(3.0, Math.round((zoomRef.current + step) * 100) / 100)
      );
      if (nextZoom === 1.0) {
        triggerHaptic("click", "both", true);
      } else {
        triggerHaptic("light", "both");
      }

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      if (videoRef.current) {
        videoRef.current.style.transform = `scale(${nextZoom.toFixed(3)})`;
      }

      if (zoomHudTextRef.current) {
        zoomHudTextRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
      }
      if (zoomHudBarRef.current) {
        const pct = Math.round(((nextZoom - 0.5) / 2.5) * 100);
        zoomHudBarRef.current.style.width = `${pct}%`;
        zoomHudBarRef.current.style.background =
          nextZoom === 1.0
            ? "var(--ds-accent)"
            : nextZoom > 1.0
            ? "#38bdf8"
            : "#a855f7";
      }

      showZoomHud();
    },
    [videoRef, showZoomHud]
  );

  const stopZoomLoop = useCallback(() => {
    l2HeldRef.current = false;
    r2HeldRef.current = false;
    if (zoomAnimFrameRef.current !== null) {
      cancelAnimationFrame(zoomAnimFrameRef.current);
      zoomAnimFrameRef.current = null;
    }
    setZoom(zoomRef.current);
    if (zoomHudTimerRef.current !== null) {
      window.clearTimeout(zoomHudTimerRef.current);
    }
    zoomHudTimerRef.current = window.setTimeout(() => {
      setZoomHudVisible(false);
      zoomHudTimerRef.current = null;
    }, 1200);
  }, []);

  const startZoomLoop = useCallback(() => {
    setZoomHudVisible(true);
    if (zoomHudTimerRef.current !== null) {
      window.clearTimeout(zoomHudTimerRef.current);
      zoomHudTimerRef.current = null;
    }

    if (zoomAnimFrameRef.current !== null) return;

    const HOLD_DELAY_MS = 250;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!l2HeldRef.current && !r2HeldRef.current) {
        stopZoomLoop();
        return;
      }

      const dt = Math.min((currentTime - lastTime) / 1000, 0.08);
      lastTime = currentTime;

      const l2Duration = l2HeldRef.current
        ? currentTime - l2PressStartRef.current
        : 0;
      const r2Duration = r2HeldRef.current
        ? currentTime - r2PressStartRef.current
        : 0;

      const l2Active = l2HeldRef.current && l2Duration >= HOLD_DELAY_MS;
      const r2Active = r2HeldRef.current && r2Duration >= HOLD_DELAY_MS;

      if (l2Active || r2Active) {
        const heldTimeSec = Math.max(
          l2Active ? (l2Duration - HOLD_DELAY_MS) / 1000 : 0,
          r2Active ? (r2Duration - HOLD_DELAY_MS) / 1000 : 0
        );
        const speed = Math.min(1.6, 0.85 + heldTimeSec * 1.0);

        const effR2 = r2Active ? 1 : 0;
        const effL2 = l2Active ? 1 : 0;
        const delta = (effR2 - effL2) * speed * dt;

        let nextZoom = zoomRef.current + delta;
        nextZoom = Math.max(0.5, Math.min(3.0, nextZoom));

        if (Math.abs(nextZoom - 1.0) < 0.02) {
          if (Math.abs(zoomRef.current - 1.0) >= 0.02) {
            nextZoom = 1.0;
            triggerHaptic("click", "both", true);
          }
        }

        zoomRef.current = nextZoom;

        if (videoRef.current) {
          videoRef.current.style.transform = `scale(${nextZoom.toFixed(3)})`;
        }

        if (zoomHudTextRef.current) {
          zoomHudTextRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
        }
        if (zoomHudBarRef.current) {
          const pct = Math.round(((nextZoom - 0.5) / 2.5) * 100);
          zoomHudBarRef.current.style.width = `${pct}%`;
          zoomHudBarRef.current.style.background =
            nextZoom === 1.0
              ? "var(--ds-accent)"
              : nextZoom > 1.0
              ? "#38bdf8"
              : "#a855f7";
        }
      }

      zoomAnimFrameRef.current = requestAnimationFrame(loop);
    };

    zoomAnimFrameRef.current = requestAnimationFrame(loop);
  }, [videoRef, stopZoomLoop]);

  // Очистка таймеров и анимации при размонтировании
  useEffect(() => {
    return () => {
      if (zoomAnimFrameRef.current !== null) {
        cancelAnimationFrame(zoomAnimFrameRef.current);
      }
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
    };
  }, []);

  return {
    zoom,
    zoomRef,
    zoomHudVisible,
    zoomHudTimerRef,
    zoomHudTextRef,
    zoomHudBarRef,
    l2HeldRef,
    r2HeldRef,
    l2PressStartRef,
    r2PressStartRef,
    zoomAnimFrameRef,
    applyZoomStep,
    resetZoom,
    startZoomLoop,
    stopZoomLoop,
    showZoomHud,
  };
}
