import { FC, useState, useRef, useEffect, useCallback } from "react";
import { ModalRoot, Focusable, GamepadButton } from "@decky/ui";
import {
  rpcResumeAllDownloads,
  rpcDropStream,
  rpcSaveWatchProgress,
  fetchMovieLogo,
} from "../api";
import { PlayerMediaInfo } from "../types";
import { getActiveDocument } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { AudioTrack, SubtitleTrack } from "./player/types";
import { PlayerHUD } from "./player/PlayerHUD";
import { PlayerControls } from "./player/PlayerControls";
import { usePlayerGamepad } from "../hooks/usePlayerGamepad";
import { triggerHaptic } from "../runtime/haptics";
import { setPlayerActive } from "../runtime/homeInputBus";
import { useI18n } from "../i18n";
import { useScreensaverInhibitor } from "../runtime/screensaverInhibitor";

export type { AudioTrack, SubtitleTrack };

interface PlayerModalProps {
  filePath: string;
  title: string;
  isOnline?: boolean;
  torrentHash?: string;
  mediaInfo?: PlayerMediaInfo;
  initialTime?: number;
  closeModal?: () => void;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const parseVttTimestamp = (timeStr: string): number => {
  const parts = timeStr.trim().split(":");
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    hours = parseFloat(parts[0]) || 0;
    minutes = parseFloat(parts[1]) || 0;
    seconds = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]) || 0;
    seconds = parseFloat(parts[1]) || 0;
  } else {
    seconds = parseFloat(parts[0]) || 0;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

const parseWebVTT = (vtt: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  if (!vtt) return cues;
  const lines = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split("-->");
      if (parts.length === 2) {
        const startRaw = parts[0].trim();
        const endRaw = parts[1].trim().split(/\s+/)[0];
        const start = parseVttTimestamp(startRaw);
        const end = parseVttTimestamp(endRaw);
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
          const clean = lines[i]
            .replace(/<[^>]+>/g, "")
            .replace(/\{[^}]+\}/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
          if (clean) textLines.push(clean);
          i++;
        }
        if (textLines.length > 0 && end > start) {
          cues.push({ start, end, text: textLines.join("\n") });
        }
        continue;
      }
    }
    i++;
  }
  return cues;
};

const mergeCues = (prev: SubtitleCue[], next: SubtitleCue[]): SubtitleCue[] => {
  if (prev.length === 0) return next;
  if (next.length === 0) return prev;
  const map = new Map<string, SubtitleCue>();
  for (const c of prev) map.set(`${c.start.toFixed(2)}_${c.end.toFixed(2)}`, c);
  for (const c of next) map.set(`${c.start.toFixed(2)}_${c.end.toFixed(2)}`, c);
  return Array.from(map.values()).sort((a, b) => a.start - b.start);
};

export const PlayerModal: FC<PlayerModalProps> = ({
  filePath,
  title,
  isOnline = false,
  torrentHash,
  mediaInfo,
  initialTime,
  closeModal,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const actualFilePath = (() => {
    const match = filePath.match(/[?&]file=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return filePath.startsWith("http://") || filePath.startsWith("https://") ? null : filePath;
  })();

  const getSavedProgress = useCallback((): number => {
    try {
      if (initialTime !== undefined && initialTime > 0) {
        return Math.floor(initialTime);
      }
      const fileTarget = actualFilePath || filePath;
      const rawFileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
      const fileName = rawFileName.split("?")[0];
      const raw = localStorage.getItem(`projacktor_progress_${fileName}`);
      if (raw) {
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 15) return Math.floor(val);
      }
      const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
      if (cleanTitle) {
        const rawTitle = localStorage.getItem(`projacktor_progress_t_${cleanTitle}`);
        if (rawTitle) {
          const val = parseFloat(rawTitle);
          if (!isNaN(val) && val > 15) return Math.floor(val);
        }
      }
    } catch {}
    return 0;
  }, [actualFilePath, filePath, title, initialTime]);

  const isOnlineOrProxied = isOnline || filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.includes("/api/stream?url=");
  const savedStartTimeRef = useRef<number>(getSavedProgress());
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  useScreensaverInhibitor(isPlaying);
  const [isDirectStream, setIsDirectStream] = useState<boolean>(false);
  const [baseTime, setBaseTime] = useState<number>(() => savedStartTimeRef.current);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(mediaInfo?.duration || 0);
  const [volume, setVolume] = useState<number>(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | undefined>(undefined);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | string | null>(null);
  const userInteractedWithSubtitlesRef = useRef<boolean>(false);
  const [parsedCues, setParsedCues] = useState<SubtitleCue[]>([]);
  const parsedCuesRef = useRef<SubtitleCue[]>([]);
  parsedCuesRef.current = parsedCues;
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>("");
  const currentSubtitleTextRef = useRef<string>("");
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [volumeHudVisible, setVolumeHudVisible] = useState<boolean>(false);
  const volumeHudTimerRef = useRef<number | null>(null);
  const seekCommitTimerRef = useRef<number | null>(null);
  const targetSeekTimeRef = useRef<number | null>(null);

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [hasStartedPlayback, setHasStartedPlayback] = useState<boolean>(false);
  const hasInitialSeekedRef = useRef<boolean>(false);

  // Фоновая загрузка официального логотипа с TMDB для заставки буферизации
  useEffect(() => {
    let active = true;
    if (mediaInfo?.tmdbId) {
      fetchMovieLogo(mediaInfo.tmdbId, mediaInfo.mediaType || "movie")
        .then((path) => {
          if (active && path) {
            setLogoPath(path);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType]);

  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const showControlsRef = useRef<boolean>(showControls);
  showControlsRef.current = showControls;
  const controlsTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setPlayerActive(true);
    return () => {
      setPlayerActive(false);
    };
  }, []);

  const playBtnRef = useRef<HTMLDivElement>(null);
  const subtitleBtnRef = useRef<HTMLDivElement>(null);
  const audioBtnRef = useRef<HTMLDivElement>(null);
  const subtitleMenuRef = useRef<HTMLDivElement>(null);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  const audioTracksRef = useRef<AudioTrack[]>(audioTracks);
  audioTracksRef.current = audioTracks;
  const subtitleTracksRef = useRef<SubtitleTrack[]>(subtitleTracks);
  subtitleTracksRef.current = subtitleTracks;

  const [activeSubMenuIdx, setActiveSubMenuIdx] = useState<number>(0);
  const activeSubMenuIdxRef = useRef<number>(0);
  activeSubMenuIdxRef.current = activeSubMenuIdx;

  const [activeAudioMenuIdx, setActiveAudioMenuIdx] = useState<number>(0);
  const activeAudioMenuIdxRef = useRef<number>(0);
  activeAudioMenuIdxRef.current = activeAudioMenuIdx;

  const showAudioMenuRef = useRef(showAudioMenu);
  showAudioMenuRef.current = showAudioMenu;

  const showSubtitleMenuRef = useRef(showSubtitleMenu);
  showSubtitleMenuRef.current = showSubtitleMenu;

  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;

  const lastMenuNavTimeRef = useRef<number>(0);

  const handleMenuDirection = useCallback(
    (dir: "up" | "down", menuKey: "sub" | "audio") => {
      const now = Date.now();
      if (now - lastMenuNavTimeRef.current < 200) {
        return; // Игнорируем быстрый дребезг / удержание кнопки
      }
      lastMenuNavTimeRef.current = now;

      if (menuKey === "sub") {
        const totalItems = 1 + subtitleTracksRef.current.length;
        if (totalItems <= 0) return;
        const curIdx = activeSubMenuIdxRef.current;
        let nextIndex = dir === "down" ? curIdx + 1 : curIdx - 1;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= totalItems) nextIndex = totalItems - 1;

        if (nextIndex !== curIdx) {
          setActiveSubMenuIdx(nextIndex);
          activeSubMenuIdxRef.current = nextIndex;
          playNavSound();
          const menuEl = subtitleMenuRef.current;
          if (menuEl) {
            const items = Array.from(menuEl.querySelectorAll<HTMLElement>(".ds-btn"));
            const target = items[nextIndex];
            if (target) {
              try {
                target.scrollIntoView({ block: "nearest", behavior: "smooth" });
              } catch {}
            }
          }
        }
      } else {
        const totalItems = audioTracksRef.current.length;
        if (totalItems <= 0) return;
        const curIdx = activeAudioMenuIdxRef.current;
        let nextIndex = dir === "down" ? curIdx + 1 : curIdx - 1;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= totalItems) nextIndex = totalItems - 1;

        if (nextIndex !== curIdx) {
          setActiveAudioMenuIdx(nextIndex);
          activeAudioMenuIdxRef.current = nextIndex;
          playNavSound();
          const menuEl = audioMenuRef.current;
          if (menuEl) {
            const items = Array.from(menuEl.querySelectorAll<HTMLElement>(".ds-btn"));
            const target = items[nextIndex];
            if (target) {
              try {
                target.scrollIntoView({ block: "nearest", behavior: "smooth" });
              } catch {}
            }
          }
        }
      }
    },
    []
  );

  // Focus preservation for subtitle and audio menus
  useEffect(() => {
    if (showSubtitleMenu) {
      let initialIdx = 0;
      if (selectedSubtitle !== null) {
        const found = subtitleTracks.findIndex((s) => s.index === selectedSubtitle);
        if (found !== -1) initialIdx = found + 1;
      }
      setActiveSubMenuIdx(initialIdx);
      activeSubMenuIdxRef.current = initialIdx;

      const t = setTimeout(() => {
        const menuEl = subtitleMenuRef.current;
        if (menuEl) {
          try {
            const doc = getActiveDocument(menuEl) || document;
            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            const items = Array.from(menuEl.querySelectorAll<HTMLElement>(".ds-btn"));
            const target = items[initialIdx] || items[0];
            if (target) {
              target.focus();
              target.classList.add("gpfocus");
              target.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          } catch {}
        }
      }, 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showSubtitleMenu, selectedSubtitle, subtitleTracks]);

  useEffect(() => {
    if (showAudioMenu) {
      let initialIdx = 0;
      if (selectedAudio !== undefined) {
        const found = audioTracks.findIndex((a) => a.index === selectedAudio);
        if (found !== -1) initialIdx = found;
      }
      setActiveAudioMenuIdx(initialIdx);
      activeAudioMenuIdxRef.current = initialIdx;

      const t = setTimeout(() => {
        const menuEl = audioMenuRef.current;
        if (menuEl) {
          try {
            const doc = getActiveDocument(menuEl) || document;
            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            const items = Array.from(menuEl.querySelectorAll<HTMLElement>(".ds-btn"));
            const target = items[initialIdx] || items[0];
            if (target) {
              target.focus();
              target.classList.add("gpfocus");
              target.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          } catch {}
        }
      }, 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showAudioMenu, selectedAudio, audioTracks]);

  // Auto-hide controls after 15 seconds of inactivity
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current !== null) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (isPlaying && !showAudioMenu && !showSubtitleMenu) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 15000);
    }
  }, [isPlaying, showAudioMenu, showSubtitleMenu]);

  const changeVolume = useCallback((delta: number) => {
    setVolume((prev) => {
      const next = Math.max(0, Math.min(1, Math.round((prev + delta) * 20) / 20));
      if (videoRef.current) {
        videoRef.current.volume = next;
      }
      if (next === 0 || next === 1) {
        triggerHaptic("medium", "both");
      } else {
        triggerHaptic("light", "both");
      }
      return next;
    });
    setVolumeHudVisible(true);
    if (volumeHudTimerRef.current !== null) {
      window.clearTimeout(volumeHudTimerRef.current);
    }
    volumeHudTimerRef.current = window.setTimeout(() => {
      setVolumeHudVisible(false);
    }, 1200);
  }, []);

  const showZoomHud = useCallback(() => {
    setZoomHudVisible(true);
    if (zoomHudTimerRef.current !== null) {
      window.clearTimeout(zoomHudTimerRef.current);
    }
    zoomHudTimerRef.current = window.setTimeout(() => {
      setZoomHudVisible(false);
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
  }, [showZoomHud]);

  // Одиночный дискретный шаг масштаба (ровно 1% за нажатие)
  const applyZoomStep = useCallback(
    (step: number) => {
      const nextZoom = Math.max(0.5, Math.min(3.0, Math.round((zoomRef.current + step) * 100) / 100));
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
          nextZoom === 1.0 ? "var(--ds-accent)" : nextZoom > 1.0 ? "#38bdf8" : "#a855f7";
      }

      showZoomHud();
    },
    [showZoomHud]
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

      const l2Duration = l2HeldRef.current ? (currentTime - l2PressStartRef.current) : 0;
      const r2Duration = r2HeldRef.current ? (currentTime - r2PressStartRef.current) : 0;

      const l2Active = l2HeldRef.current && l2Duration >= HOLD_DELAY_MS;
      const r2Active = r2HeldRef.current && r2Duration >= HOLD_DELAY_MS;

      if (l2Active || r2Active) {
        const heldTimeSec = Math.max(
          l2Active ? (l2Duration - HOLD_DELAY_MS) / 1000 : 0,
          r2Active ? (r2Duration - HOLD_DELAY_MS) / 1000 : 0
        );
        const speed = Math.min(1.60, 0.85 + heldTimeSec * 1.00);

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
            nextZoom === 1.0 ? "var(--ds-accent)" : nextZoom > 1.0 ? "#38bdf8" : "#a855f7";
        }
      }

      zoomAnimFrameRef.current = requestAnimationFrame(loop);
    };

    zoomAnimFrameRef.current = requestAnimationFrame(loop);
  }, [stopZoomLoop]);

  const selectSubtitleTrack = useCallback((trackIndex: number | string | null) => {
    userInteractedWithSubtitlesRef.current = true;
    setSelectedSubtitle(trackIndex);

    // Синхронно переводим фокус на кнопку субтитров ДО закрытия меню,
    // чтобы фокус браузера/Decky не сбрасывался на первый элемент (перемотку назад)
    if (subtitleBtnRef.current) {
      try {
        const doc = getActiveDocument(subtitleBtnRef.current) || document;
        doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        subtitleBtnRef.current.focus();
        subtitleBtnRef.current.classList.add("gpfocus");
      } catch {}
    }

    setShowSubtitleMenu(false);
    resetControlsTimer();
    setTimeout(() => {
      if (subtitleBtnRef.current) {
        try {
          const doc = getActiveDocument(subtitleBtnRef.current) || document;
          doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          subtitleBtnRef.current.focus();
          subtitleBtnRef.current.classList.add("gpfocus");
        } catch {}
      }
    }, 50);
  }, [resetControlsTimer]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current !== null) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    let cancelled = false;
    let timerId: any = null;
    const delays = [50, 150, 300];
    let idx = 0;

    const focusPlayBtn = (): boolean => {
      if (cancelled) return false;
      if (playBtnRef.current) {
        try {
          const doc = getActiveDocument(playBtnRef.current) || document;
          doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          playBtnRef.current.focus();
          playBtnRef.current.classList.add("gpfocus");
          return true;
        } catch {}
      }
      return false;
    };

    const scheduleNext = () => {
      if (cancelled || idx >= delays.length) return;
      const delay = delays[idx++];
      timerId = setTimeout(() => {
        if (cancelled) return;
        const ok = focusPlayBtn();
        if (!ok) scheduleNext();
      }, delay);
    };

    if (!focusPlayBtn()) {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId as any);
    };
  }, []);

  useEffect(() => {
    if (showControls && !showSubtitleMenu && !showAudioMenu) {
      const t = setTimeout(() => {
        if (playBtnRef.current) {
          try {
            const doc = getActiveDocument(playBtnRef.current) || document;
            const currentGpfocus = doc.querySelector(".projacktor-player-fullscreen .gpfocus");
            if (!currentGpfocus) {
              playBtnRef.current.focus();
              playBtnRef.current.classList.add("gpfocus");
            }
          } catch {}
        }
      }, 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showControls, showSubtitleMenu, showAudioMenu]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchMovedRef = useRef<boolean>(false);

  const getStreamUrl = useCallback(
    (startTime: number = 0, track?: number) => {
      const isHttp = filePath.startsWith("http://") || filePath.startsWith("https://");
      let base = isHttp ? filePath : `http://127.0.0.1:8400/api/stream?file=${encodeURIComponent(filePath)}`;
      // Strip any existing start= or audio= params to avoid duplicates
      base = base.replace(/([?&])start=\d+(&|$)/g, "$1").replace(/([?&])audio=\d+(&|$)/g, "$1").replace(/[?&]$/, "");
      const separator = base.includes("?") ? "&" : "?";
      const params: string[] = [];

      if (!isHttp && isOnline) {
        params.push("online=1");
      }
      if (startTime > 0) {
        params.push(`start=${Math.floor(startTime)}`);
      }
      if (track !== undefined) {
        params.push(`audio=${track}`);
      }

      return params.length > 0 ? `${base}${separator}${params.join("&")}` : base;
    },
    [filePath, isOnline]
  );

  const [streamUrl, setStreamUrl] = useState<string>(() => getStreamUrl(savedStartTimeRef.current));

  const currentPlayheadRef = useRef<number>(savedStartTimeRef.current);
  currentPlayheadRef.current = isDirectStream ? videoTime : (baseTime + videoTime);

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const saveProgress = useCallback(
    (sec: number, totalDur?: number) => {
      try {
        const fileTarget = actualFilePath || filePath;
        const rawFileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
        const fileName = rawFileName.split("?")[0];
        const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
        const dur = totalDur ?? durationRef.current;
        if (dur && dur > 0 && sec >= dur - 60) {
          localStorage.removeItem(`projacktor_progress_${fileName}`);
          if (cleanTitle) {
            localStorage.removeItem(`projacktor_progress_t_${cleanTitle}`);
          }
        } else if (sec > 15) {
          localStorage.setItem(`projacktor_progress_${fileName}`, String(Math.floor(sec)));
          if (cleanTitle) {
            localStorage.setItem(`projacktor_progress_t_${cleanTitle}`, String(Math.floor(sec)));
          }
        }

        if (sec >= 0) {
          rpcSaveWatchProgress(
            JSON.stringify({
              media_id: mediaInfo?.mediaId,
              tmdb_id: mediaInfo?.tmdbId,
              title: mediaInfo?.title || cleanTitle,
              original_title: mediaInfo?.originalTitle,
              media_type: mediaInfo?.mediaType || "movie",
              year: mediaInfo?.year,
              poster_path: mediaInfo?.posterPath,
              backdrop_path: mediaInfo?.backdropPath,
              overview: mediaInfo?.overview,
              file_path: actualFilePath || filePath,
              stream_url: filePath.startsWith("http") ? filePath : undefined,
              torrent_hash: torrentHash,
              is_online: isOnline,
              episode_name: mediaInfo?.episodeName,
              season_number: mediaInfo?.seasonNumber,
              episode_number: mediaInfo?.episodeNumber,
              current_time: sec,
              duration: dur || 0,
            })
          ).catch(() => {});
        }
      } catch {}
    },
    [actualFilePath, filePath, title, mediaInfo, isOnline, torrentHash]
  );

  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  const torrentHashRef = useRef(torrentHash);
  torrentHashRef.current = torrentHash;

  const lastToggleAtRef = useRef<number>(0);
  const togglePlay = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 250) return;
    lastToggleAtRef.current = now;
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  }, [resetControlsTimer]);

  const commitPendingSeek = useCallback(() => {
    if (seekCommitTimerRef.current !== null) {
      window.clearTimeout(seekCommitTimerRef.current);
      seekCommitTimerRef.current = null;
    }
    if (targetSeekTimeRef.current !== null) {
      const target = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      if (isDirectStream && videoRef.current) {
        videoRef.current.currentTime = target;
        setVideoTime(target);
      } else {
        setBaseTime(target);
        setVideoTime(0);
        setStreamUrl(getStreamUrl(target, selectedAudio));
      }
    }
  }, [getStreamUrl, isDirectStream, selectedAudio]);

  const seekRelative = useCallback(
    (delta: number) => {

      const currentBase =
        targetSeekTimeRef.current !== null
          ? targetSeekTimeRef.current
          : isDirectStream && videoRef.current
          ? videoRef.current.currentTime
          : baseTime + (videoRef.current ? videoRef.current.currentTime : 0);

      const newTime = Math.max(0, Math.min(duration || 999999, currentBase + delta));
      targetSeekTimeRef.current = newTime;

      if (isDirectStream && videoRef.current) {
        videoRef.current.currentTime = newTime;
        setVideoTime(newTime);
        targetSeekTimeRef.current = null;
      } else {
        setVideoTime(Math.max(0, newTime - baseTime));
        if (seekCommitTimerRef.current !== null) {
          window.clearTimeout(seekCommitTimerRef.current);
        }
        seekCommitTimerRef.current = window.setTimeout(() => {
          commitPendingSeek();
        }, 320);
      }
      resetControlsTimer();
    },
    [baseTime, commitPendingSeek, duration, isDirectStream, resetControlsTimer]
  );

  const selectAudioTrack = useCallback((trackIndex: number) => {
    setSelectedAudio(trackIndex);

    // Синхронно переводим фокус на кнопку аудио ДО закрытия меню
    if (audioBtnRef.current) {
      try {
        const doc = getActiveDocument(audioBtnRef.current) || document;
        doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        audioBtnRef.current.focus();
        audioBtnRef.current.classList.add("gpfocus");
      } catch {}
    }

    setShowAudioMenu(false);
    setErrorMsg(null);
    const cur = (isDirectStream && videoRef.current) ? videoRef.current.currentTime : (baseTime + (videoRef.current ? videoRef.current.currentTime : 0));
    setBaseTime(cur);
    setVideoTime(0);
    setStreamUrl(getStreamUrl(cur, trackIndex));
    resetControlsTimer();
    setTimeout(() => {
      if (audioBtnRef.current) {
        try {
          const doc = getActiveDocument(audioBtnRef.current) || document;
          doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          audioBtnRef.current.focus();
          audioBtnRef.current.classList.add("gpfocus");
        } catch {}
      }
    }, 50);
  }, [baseTime, getStreamUrl, isDirectStream, resetControlsTimer]);

  const lastSubToggleRef = useRef<number>(0);
  const toggleSubtitleMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastSubToggleRef.current < 250) return;
    lastSubToggleRef.current = now;
    setShowSubtitleMenu((prev) => !prev);
    setShowAudioMenu(false);
    setShowControls(true);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const lastAudioToggleRef = useRef<number>(0);
  const toggleAudioMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastAudioToggleRef.current < 250) return;
    lastAudioToggleRef.current = now;
    setShowAudioMenu((prev) => !prev);
    setShowSubtitleMenu(false);
    setShowControls(true);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const seekTo = (targetSec: number) => {
    setErrorMsg(null);
    const newTime = Math.max(0, Math.min(duration || 999999, targetSec));
    if (isDirectStream && videoRef.current) {
      videoRef.current.currentTime = newTime;
      setVideoTime(newTime);
    } else {
      setBaseTime(newTime);
      setVideoTime(0);
      setStreamUrl(getStreamUrl(newTime, selectedAudio));
    }
    resetControlsTimer();
  };

  const handleProgressBarTouch = (e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const targetPercent = clickX / rect.width;
    seekTo(targetPercent * duration);
  };

  const handleVideoTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchMovedRef.current = false;
    }
  };

  const handleVideoTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
      touchMovedRef.current = true;
    }
  };

  const handleVideoTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current !== null && touchStartYRef.current !== null) {
      const changedTouch = e.changedTouches[0];
      const deltaX = changedTouch.clientX - touchStartXRef.current;
      const deltaY = changedTouch.clientY - touchStartYRef.current;

      if (!touchMovedRef.current) {
        togglePlay();
      } else {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
          if (deltaX > 0) {
            seekRelative(15);
          } else {
            seekRelative(-15);
          }
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) {
          const isRightHalf = touchStartXRef.current > window.innerWidth / 2;
          if (isRightHalf) {
            if (deltaY < 0) {
              changeVolume(0.1);
            } else {
              changeVolume(-0.1);
            }
          }
        }
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchMovedRef.current = false;
    resetControlsTimer();
  };

  usePlayerGamepad({
    containerRef,
    playBtnRef,
    subtitleBtnRef,
    audioBtnRef,
    showControlsRef,
    showAudioMenuRef,
    showSubtitleMenuRef,
    setShowAudioMenu,
    setShowSubtitleMenu,
    setShowControls,
    closeModalRef,
    audioTracksRef,
    subtitleTracksRef,
    activeAudioMenuIdxRef,
    activeSubMenuIdxRef,
    togglePlay,
    toggleAudioMenu,
    toggleSubtitleMenu,
    selectAudioTrack,
    selectSubtitleTrack,
    seekRelative,
    commitPendingSeek,
    changeVolume,
    applyZoomStep,
    resetZoom,
    startZoomLoop,
    stopZoomLoop,
    resetControlsTimer,
    handleMenuDirection,
    l2HeldRef,
    r2HeldRef,
    l2PressStartRef,
    r2PressStartRef,
    zoomAnimFrameRef,
    zoomHudTimerRef,
  });

  // Request fullscreen on mount to overlay all Steam UI
  useEffect(() => {
    const el = containerRef.current;
    if (el && typeof el.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Сохраняем прогресс, возобновляем загрузки и сбрасываем стрим TorrServer при закрытии плеера
  useEffect(() => {
    return () => {
      saveProgressRef.current(currentPlayheadRef.current, durationRef.current);
      rpcResumeAllDownloads().catch(() => {});
      if (torrentHashRef.current) {
        rpcDropStream(torrentHashRef.current).catch(() => {});
      }
    };
  }, []);

  // Сброс дорожек и субтитров при смене источника / серии
  useEffect(() => {
    userInteractedWithSubtitlesRef.current = false;
    setSelectedSubtitle(null);
    setSubtitleTracks([]);
    setAudioTracks([]);
    setParsedCues([]);
    setCurrentSubtitleText("");
    currentSubtitleTextRef.current = "";
  }, [filePath]);

  // Probe file metadata on mount: duration, audio tracks, and subtitle tracks
  useEffect(() => {
    let cancelled = false;
    let retryTimer: any = null;
    let retryCount = 0;

    let target = actualFilePath || filePath;
    if (target.includes("/api/stream?")) {
      try {
        const u = new URL(target, "http://127.0.0.1:8400");
        const inner = u.searchParams.get("url") || u.searchParams.get("file");
        if (inner) target = inner;
      } catch {}
    }
    const isHttp = target.startsWith("http://") || target.startsWith("https://");
    const probeQuery = isHttp ? `url=${encodeURIComponent(target)}` : `file=${encodeURIComponent(target)}`;

    const runProbe = () => {
      fetch(`http://127.0.0.1:8400/api/stream/probe?${probeQuery}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.duration && data.duration > 0) {
            setDuration(data.duration);
          }
          if (data.direct !== undefined) {
            const canBeDirect = !isOnlineOrProxied && !actualFilePath?.startsWith("http");
            setIsDirectStream(canBeDirect && Boolean(data.direct));
          }
          if (Array.isArray(data.audio_tracks) && data.audio_tracks.length > 0) {
            setAudioTracks(data.audio_tracks);
            if (selectedAudio === undefined) {
              setSelectedAudio(data.audio_tracks[0].index);
            }
          }
          const hasSubs = Array.isArray(data.subtitle_tracks) && data.subtitle_tracks.length > 0;
          if (hasSubs) {
            setSubtitleTracks(data.subtitle_tracks);
            // Субтитры по умолчанию выключены (null).
            // Отображаются только тогда, когда пользователь сам включает их через меню (кнопка X).
            setSelectedSubtitle((prev) => {
              if (prev !== null) {
                const stillExists = data.subtitle_tracks.some((s: SubtitleTrack) => String(s.index) === String(prev));
                if (stillExists) return prev;
              }
              return null;
            });
          }

          const hasExtSubs = hasSubs && data.subtitle_tracks.some((s: SubtitleTrack) => String(s.index).startsWith("ext_"));
          if ((!hasSubs || !hasExtSubs) && isHttp && retryCount < 4) {
            retryCount++;
            retryTimer = setTimeout(runProbe, 2000);
          }
        })
        .catch(() => {
          if (!cancelled && retryCount < 4) {
            retryCount++;
            retryTimer = setTimeout(runProbe, 2000);
          }
        });
    };

    runProbe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [actualFilePath, filePath]);

  // Ссылка для предотвращения одновременных повторных запросов субтитров
  const isFetchingMoreSubsRef = useRef(false);

  // Загрузка дорожки субтитров (с поддержкой polling и retry для онлайн торрентов)
  useEffect(() => {
    if (selectedSubtitle === null) {
      setParsedCues([]);
      setCurrentSubtitleText("");
      currentSubtitleTextRef.current = "";
      return;
    }
    const activeTrack = subtitleTracks.find((s) => String(s.index) === String(selectedSubtitle));
    if (activeTrack && activeTrack.supported === false) {
      setParsedCues([]);
      setCurrentSubtitleText("");
      currentSubtitleTextRef.current = "";
      return;
    }
    if (String(selectedSubtitle).startsWith("ext_") && !activeTrack) {
      return;
    }
    const subTarget = activeTrack?.url || actualFilePath || filePath;
    const isHttpSub = subTarget.startsWith("http://") || subTarget.startsWith("https://");
    const trackParam = activeTrack?.url ? "" : `&track=${selectedSubtitle}`;
    const curPos = isDirectStream ? videoTime : (baseTime + videoTime);
    const startParam = (curPos > 15 && isOnline) ? `&start=${Math.max(0, Math.floor(curPos - 10))}` : "";
    const subUrl = `http://127.0.0.1:8400/api/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

    let cancelled = false;
    let retryTimer: any = null;
    let pollCount = 0;

    const loadSubtitles = () => {
      if (cancelled) return;
      fetch(subUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`Subtitle fetch failed: ${res.status}`);
          return res.text();
        })
        .then((vtt) => {
          if (cancelled) return;
          const cues = parseWebVTT(vtt);
          if (cues.length > 0) {
            setParsedCues((prev) => mergeCues(prev, cues));
          }
          if (cues.length === 0 && pollCount < 4) {
            pollCount++;
            retryTimer = setTimeout(loadSubtitles, 4000);
          }
        })
        .catch(() => {
          if (!cancelled && pollCount < 3) {
            pollCount++;
            retryTimer = setTimeout(loadSubtitles, 4000);
          }
        });
    };

    loadSubtitles();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [selectedSubtitle, subtitleTracks, actualFilePath, filePath]);

  // Фоновое докачивание субтитров, если при старте торрента файл был скачан частично
  useEffect(() => {
    if (selectedSubtitle === null || parsedCues.length === 0 || !duration || duration <= 180) return;
    const lastCue = parsedCues[parsedCues.length - 1];
    if (!lastCue || lastCue.end >= duration - 60) return; // субтитры уже полные

    const curTime = isDirectStream ? videoTime : (baseTime + videoTime);
    if (curTime >= lastCue.end - 45 && !isFetchingMoreSubsRef.current) {
      isFetchingMoreSubsRef.current = true;
      const activeTrack = subtitleTracks.find((s) => String(s.index) === String(selectedSubtitle));
      const subTarget = activeTrack?.url || actualFilePath || filePath;
      const isHttpSub = subTarget.startsWith("http://") || subTarget.startsWith("https://");
      const trackParam = activeTrack?.url ? "" : `&track=${selectedSubtitle}`;
      const startParam = isOnline ? `&start=${Math.max(0, Math.floor(curTime - 10))}` : "";
      const subUrl = `http://127.0.0.1:8400/api/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

      fetch(subUrl)
        .then((res) => (res.ok ? res.text() : ""))
        .then((vtt) => {
          if (vtt) {
            const nextCues = parseWebVTT(vtt);
            if (nextCues.length > 0) {
              setParsedCues((prev) => mergeCues(prev, nextCues));
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            isFetchingMoreSubsRef.current = false;
          }, 6000);
        });
    }
  }, [videoTime, baseTime, isDirectStream, parsedCues, duration, selectedSubtitle, subtitleTracks, actualFilePath, filePath]);

  // Синхронизация реплики субтитров с текущим временем видео
  useEffect(() => {
    if (parsedCues.length === 0 || selectedSubtitle === null) {
      if (currentSubtitleTextRef.current) {
        currentSubtitleTextRef.current = "";
        setCurrentSubtitleText("");
      }
      return;
    }
    const curTime = isDirectStream ? videoTime : (baseTime + videoTime);
    const active = parsedCues.find((c) => curTime >= c.start && curTime <= c.end);
    const newText = active ? active.text : "";
    if (newText !== currentSubtitleTextRef.current) {
      currentSubtitleTextRef.current = newText;
      setCurrentSubtitleText(newText);
    }
  }, [videoTime, baseTime, isDirectStream, parsedCues, selectedSubtitle]);

  // Отключаем нативный рендеринг субтитров в Chromium, чтобы не было дублирования с кастомным оверлеем
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const disableNativeSubs = () => {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = "disabled";
      }
    };
    disableNativeSubs();
    const t = setTimeout(disableNativeSubs, 200);
    return () => clearTimeout(t);
  }, [selectedSubtitle]);

  const handleVideoError = () => {
    setErrorMsg(t("streamPlaybackError"));
  };

  useEffect(() => {
    setErrorMsg(null);
    const video = videoRef.current;
    if (!video) return;

    let lastSaveSec = 0;
    const onTimeUpdate = () => {
      const vTime = video.currentTime;
      setVideoTime(vTime);
      setIsBuffering(false);
      if (vTime > 0.05) {
        setHasStartedPlayback(true);
      }
      const totalCur = Math.floor(isDirectStream ? vTime : (baseTime + vTime));
      if (Math.abs(totalCur - lastSaveSec) >= 5) {
        lastSaveSec = totalCur;
        saveProgressRef.current(totalCur, durationRef.current);
      }
      const curExact = isDirectStream ? vTime : (baseTime + vTime);
      const cues = parsedCuesRef.current;
      if (cues.length > 0) {
        const active = cues.find((c) => curExact >= c.start && curExact <= c.end);
        const text = active ? active.text : "";
        if (text !== currentSubtitleTextRef.current) {
          currentSubtitleTextRef.current = text;
          setCurrentSubtitleText(text);
        }
      } else if (currentSubtitleTextRef.current) {
        currentSubtitleTextRef.current = "";
        setCurrentSubtitleText("");
      }
    };
    const onLoadedMetadata = () => {
      const vDur = video.duration;
      const isLiveTranscode = isOnline || filePath.includes("/api/stream");
      if ((!duration || duration <= 0) && vDur && !isNaN(vDur) && isFinite(vDur) && vDur > 0 && (!isLiveTranscode || vDur >= 180)) {
        setDuration(vDur);
      }
      if (isDirectStream && savedStartTimeRef.current > 0 && !hasInitialSeekedRef.current) {
        hasInitialSeekedRef.current = true;
        try {
          video.currentTime = savedStartTimeRef.current;
          setVideoTime(savedStartTimeRef.current);
        } catch {}
      }
      setIsBuffering(false);
      video.play().catch(() => {});
    };
    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      if (video.currentTime > 0.05) {
        setHasStartedPlayback(true);
      }
    };
    const onPlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      setHasStartedPlayback(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      saveProgressRef.current(isDirectStream ? video.currentTime : (baseTime + video.currentTime), durationRef.current);
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onEnded = () => {
      setIsPlaying(false);
      try {
        const fileTarget = actualFilePath || filePath;
        const fileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
        const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
        localStorage.removeItem(`projacktor_progress_${fileName}`);
        if (cleanTitle) {
          localStorage.removeItem(`projacktor_progress_t_${cleanTitle}`);
        }
        saveProgressRef.current(0, durationRef.current || duration);
      } catch {}
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("ended", onEnded);
    };
  }, [streamUrl, duration, baseTime]);

  const currentPlayhead = isDirectStream ? videoTime : (baseTime + videoTime);
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentPlayhead / duration) * 100)) : 0;

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal} bAllowFullSize={true} bHideCloseIcon={true}>
      <Focusable
        ref={containerRef}
        className="projacktor-player-fullscreen"
        onCancelButton={() => {
          if (showAudioMenuRef.current) {
            setShowAudioMenu(false);
          } else if (showSubtitleMenuRef.current) {
            setShowSubtitleMenu(false);
          } else if (closeModalRef.current) {
            closeModalRef.current();
          }
        }}
        onGamepadDirection={(evt: any) => {
          if (showAudioMenuRef.current || showSubtitleMenuRef.current) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            return false;
          }
          const btn = evt?.detail?.button;
          if (btn === 9 || btn === 4 || btn === 20 || btn === GamepadButton.DIR_UP) {
            // DIR_UP - звук +
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            changeVolume(0.05);
            return false;
          } else if (btn === 10 || btn === 6 || btn === 21 || btn === GamepadButton.DIR_DOWN) {
            // DIR_DOWN - звук -
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            changeVolume(-0.05);
            return false;
          }
          // Блокируем любые другие направления (влево/вправо на границах контролов),
          // чтобы GamepadUI не пытался искать фокусируемые элементы в фоновом каталоге/библиотеке
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          return false;
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          color: "#fff",
          background: "#000",
          overflow: "hidden",
          borderRadius: 0,
          zIndex: 2147483647,
          cursor: showControls ? "default" : "none",
        }}
      >
        {/* Top Header Bar: ТОЛЬКО НАЗВАНИЕ */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            padding: "16px 24px 28px",
            background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%)",
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? "auto" : "none",
            transition: "opacity 0.3s ease",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "#ffffff",
              letterSpacing: 0.2,
            }}
          >
            {title}
          </div>
        </div>

        {/* Video Canvas */}
        <div
          onTouchStart={handleVideoTouchStart}
          onTouchMove={handleVideoTouchMove}
          onTouchEnd={handleVideoTouchEnd}
          onClick={togglePlay}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          <PlayerHUD
            volumeHudVisible={volumeHudVisible}
            volume={volume}
            zoomHudVisible={zoomHudVisible}
            zoom={zoom}
            zoomHudBarRef={zoomHudBarRef}
            zoomHudTextRef={zoomHudTextRef}
            hasStartedPlayback={hasStartedPlayback}
            isBuffering={isBuffering}
            errorMsg={errorMsg}
            mediaInfo={mediaInfo}
            logoPath={logoPath}
            title={title}
            isOnline={isOnline}
          />

          {errorMsg ? (
            <div style={{ textAlign: "center", color: "var(--ds-danger)", fontSize: 14, padding: 20 }}>
              {errorMsg}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={streamUrl}
                autoPlay
                onError={handleVideoError}
                crossOrigin="anonymous"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  outline: "none",
                  pointerEvents: "none",
                  transform: `scale(${zoom.toFixed(3)})`,
                  transformOrigin: "center center",
                  willChange: "transform",
                }}
              />

              {/* Custom Subtitle Overlay (Zoom-independent, hidden during buffering) */}
              {selectedSubtitle !== null && currentSubtitleText && !isBuffering && hasStartedPlayback && (
                <div
                  className="projacktor-subtitle-overlay"
                  style={{
                    bottom: showControls ? "clamp(90px, 12vh, 160px)" : "clamp(36px, 5vh, 75px)",
                  }}
                >
                  <span className="projacktor-subtitle-text">
                    {currentSubtitleText}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Controls Overlay */}
        <PlayerControls
          showControls={showControls}
          isPlaying={isPlaying}
          currentPlayhead={currentPlayhead}
          duration={duration}
          progressPercent={progressPercent}
          isOnline={isOnline}
          playBtnRef={playBtnRef}
          subtitleBtnRef={subtitleBtnRef}
          audioBtnRef={audioBtnRef}
          subtitleMenuRef={subtitleMenuRef}
          audioMenuRef={audioMenuRef}
          onTogglePlay={togglePlay}
          onSeekRelative={seekRelative}
          onSeekTo={seekTo}
          onProgressBarTouch={handleProgressBarTouch}
          showSubtitleMenu={showSubtitleMenu}
          subtitleTracks={subtitleTracks}
          selectedSubtitle={selectedSubtitle}
          activeSubMenuIdx={activeSubMenuIdx}
          onToggleSubtitleMenu={toggleSubtitleMenu}
          onSelectSubtitle={selectSubtitleTrack}
          onHoverSubItem={(idx) => {
            setActiveSubMenuIdx(idx);
            activeSubMenuIdxRef.current = idx;
          }}
          showAudioMenu={showAudioMenu}
          audioTracks={audioTracks}
          selectedAudio={selectedAudio}
          activeAudioMenuIdx={activeAudioMenuIdx}
          onToggleAudioMenu={toggleAudioMenu}
          onSelectAudio={selectAudioTrack}
          onHoverAudioItem={(idx) => {
            setActiveAudioMenuIdx(idx);
            activeAudioMenuIdxRef.current = idx;
          }}
          onChangeVolume={changeVolume}
        />
      </Focusable>
    </ModalRoot>
  );
};
