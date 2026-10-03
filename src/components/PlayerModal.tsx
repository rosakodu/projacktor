import { FC, useState, useRef, useEffect, useCallback } from "react";
import { Focusable, GamepadButton } from "@decky/ui";
import {
  rpcResumeAllDownloads,
  rpcDropStream,
  fetchMovieLogo,
  API_BASE,
  API_HOST,
} from "../api";
import { PlayerMediaInfo, PlaylistItem } from "../types";
import { getActiveDocument, isOverlayActiveOrRecent } from "../runtime/activeDoc";
import { playNavSound } from "../runtime/navSound";
import { AudioTrack, SubtitleTrack } from "./player/types";
import { PlayerHUD } from "./player/PlayerHUD";
import { PlayerControls } from "./player/PlayerControls";
import { usePlayerGamepad } from "../hooks/usePlayerGamepad";
import { triggerHaptic } from "../runtime/haptics";
import { setPlayerActive } from "../runtime/homeInputBus";
import { useI18n } from "../i18n";
import { useScreensaverInhibitor } from "../runtime/screensaverInhibitor";
import { SubtitleCue, parseWebVTT, mergeCues } from "./player/vttParser";
import { usePlayerZoom, usePlayerProgress } from "./player";

export type { AudioTrack, SubtitleTrack };

interface PlayerModalProps {
  filePath: string;
  title: string;
  isOnline?: boolean;
  torrentHash?: string;
  mediaInfo?: PlayerMediaInfo;
  initialTime?: number;
  closeModal?: () => void;
  playlist?: PlaylistItem[];
  onPlayNext?: () => boolean | void;
}

export const PlayerModal: FC<PlayerModalProps> = ({
  filePath,
  title,
  isOnline = false,
  torrentHash,
  mediaInfo,
  initialTime,
  closeModal,
  playlist,
  onPlayNext,
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

  const currentPlaylistIndex = playlist && playlist.length > 0
    ? playlist.findIndex((p) => p.filePath === filePath || (actualFilePath && p.filePath === actualFilePath))
    : -1;
  const hasNextEpisode = playlist && currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.length - 1;

  const isOnlineOrProxied = isOnline || filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.includes("/api/stream?url=");
  const [duration, setDuration] = useState<number>(mediaInfo?.duration || 0);
  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const {
    savedStartTimeRef,
    saveProgressRef,
  } = usePlayerProgress({
    filePath,
    actualFilePath,
    title,
    initialTime,
    mediaInfo,
    torrentHash,
    isOnline,
    duration,
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  useScreensaverInhibitor(isPlaying);
  const [isDirectStream, setIsDirectStream] = useState<boolean>(false);
  const [baseTime, setBaseTime] = useState<number>(() => savedStartTimeRef.current);
  const [videoTime, setVideoTime] = useState<number>(0);
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

  const zoomControls = usePlayerZoom(videoRef);
  const {
    zoom,
    zoomHudVisible,
    zoomHudTextRef,
    zoomHudBarRef,
  } = zoomControls;
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [logoPath, setLogoPath] = useState<string | null>(() => mediaInfo?.logoPath || null);
  const [hasStartedPlayback, setHasStartedPlayback] = useState<boolean>(false);
  const hasStartedPlaybackRef = useRef<boolean>(false);
  hasStartedPlaybackRef.current = hasStartedPlayback;
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<any>(null);
  const hasInitialSeekedRef = useRef<boolean>(false);

  const prevFilePathRef = useRef<string>(filePath);
  useEffect(() => {
    if (prevFilePathRef.current !== filePath) {
      prevFilePathRef.current = filePath;
      hasStartedPlaybackRef.current = false;
      setHasStartedPlayback(false);
      setIsBuffering(true);
    }
  }, [filePath]);

  // Фоновая загрузка официального логотипа с TMDB для заставки буферизации
  useEffect(() => {
    let active = true;
    if (mediaInfo?.logoPath) {
      setLogoPath(mediaInfo.logoPath);
      return;
    }
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
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.logoPath]);

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

  // Точное отслеживание системных оверлеев Steam выполняется централизованно в activeDoc.ts

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

  // Auto-hide controls after 3 seconds of inactivity
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current !== null) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (isPlaying && !showAudioMenu && !showSubtitleMenu) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, showAudioMenu, showSubtitleMenu]);

  // Мгновенное скрытие интерфейса плеера (например, по нажатию левого стика L3)
  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioMenu(false);
    setShowSubtitleMenu(false);
    if (controlsTimeoutRef.current !== null) {
      window.clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
  }, []);

  const toggleControls = useCallback(() => {
    if (showControlsRef.current) {
      hideControls();
    } else {
      setShowControls(true);
      resetControlsTimer();
    }
  }, [hideControls, resetControlsTimer]);

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

  const selectSubtitleTrack = useCallback((trackIndex: number | string | null) => {
    userInteractedWithSubtitlesRef.current = true;
    setSelectedSubtitle(trackIndex);

    // Синхронно переводим фокус на кнопку субтитров ДО закрытия меню,
    // чтобы фокус браузера/Decky не сбрасывался на первый элемент (перемотку назад)
    if (subtitleBtnRef.current) {
      try {
        const doc = getActiveDocument(subtitleBtnRef.current) || document;
        doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
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
          doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
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
          doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
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

  const prevShowControlsRef = useRef<boolean>(showControls);

  useEffect(() => {
    const wasHidden = !prevShowControlsRef.current;
    prevShowControlsRef.current = showControls;

    if (showControls) {
      // Восстанавливаем фокус на playBtnRef ТОЛЬКО если контролы только что появились из скрытого состояния,
      // а НЕ при закрытии/открытии меню субтитров/аудио, когда контролы уже были видны!
      if (wasHidden && !showSubtitleMenu && !showAudioMenu) {
        const t = setTimeout(() => {
          if (playBtnRef.current) {
            try {
              const doc = getActiveDocument(playBtnRef.current) || document;
              const activeEl = doc.activeElement as HTMLElement | null;
              const hasActivePlayerFocus =
                doc.querySelector(".projacktor-player-fullscreen .gpfocus") ||
                (activeEl && activeEl !== doc.body && containerRef.current?.contains(activeEl));
              if (!hasActivePlayerFocus) {
                doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                playBtnRef.current.focus();
                playBtnRef.current.classList.add("gpfocus");
              }
            } catch {}
          }
        }, 60);
        return () => clearTimeout(t);
      }
    } else {
      if (containerRef.current) {
        try {
          const doc = getActiveDocument(containerRef.current) || document;
          doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
            if (el !== containerRef.current) el.classList.remove("gpfocus");
          });
          containerRef.current.setAttribute("tabindex", "0");
          containerRef.current.focus();
          try {
            (containerRef.current as any).TakeFocus?.(0);
          } catch {}
          containerRef.current.classList.add("gpfocus", "gpfocuswithin");
        } catch {}
      }
    }

    return undefined;
  }, [showControls, showSubtitleMenu, showAudioMenu]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchMovedRef = useRef<boolean>(false);

  const getStreamUrl = useCallback(
    (startTime: number = 0, track?: number) => {
      const isHttp = filePath.startsWith("http://") || filePath.startsWith("https://");
      let base = isHttp ? filePath : `${API_BASE}/stream?file=${encodeURIComponent(filePath)}`;
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
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);

  const currentPlayheadRef = useRef<number>(savedStartTimeRef.current);
  currentPlayheadRef.current = isDirectStream ? videoTime : (baseTime + videoTime);

  const torrentHashRef = useRef(torrentHash);
  torrentHashRef.current = torrentHash;

  const lastToggleAtRef = useRef<number>(0);
  const togglePlay = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 250) return;
    lastToggleAtRef.current = now;
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.paused) {
      // Проверяем запас буфера перед возобновлением, чтобы исключить скачок и фриз кадров
      const cur = video.currentTime;
      let bufferedAhead = 0;
      if (video.buffered && video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= cur + 0.3 && video.buffered.end(i) > cur) {
            bufferedAhead = video.buffered.end(i) - cur;
            break;
          }
        }
      }

      // Если данных меньше 0.5с на онлайн/транскод потоке и readyState < 3 — даем буферу наполниться
      if (bufferedAhead < 0.5 && video.readyState < 3 && (isOnline || !isDirectStream)) {
        setIsBuffering(true);
        let started = false;
        const startPlayback = () => {
          if (started) return;
          started = true;
          video.removeEventListener("canplay", startPlayback);
          video.play().catch(() => {});
          setIsPlaying(true);
          setIsBuffering(false);
        };
        video.addEventListener("canplay", startPlayback, { once: true });
        setTimeout(startPlayback, 400);
      } else {
        video.play().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetControlsTimer();
  }, [isDirectStream, isOnline, resetControlsTimer]);

  const retryPlayback = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setErrorMsg(null);
    setIsBuffering(true);
    setStreamUrl((curUrl) => {
      return curUrl.includes("t=")
        ? curUrl.replace(/t=\d+/, `t=${Date.now()}`)
        : `${curUrl}${curUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
    });
    setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        try {
          video.load();
          video.play().catch(() => {});
        } catch (e) {
          console.warn("[PlayerModal] retryPlayback error:", e);
        }
      }
    }, 50);
  }, []);

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
        setBufferedPercent(0);
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
        doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
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
          doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => el.classList.remove("gpfocus"));
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
      setBufferedPercent(0);
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
    resetControlsTimer,
    toggleControls,
    handleMenuDirection,
    zoom: zoomControls,
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
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      saveProgressRef.current(currentPlayheadRef.current, durationRef.current);
      rpcResumeAllDownloads().catch(() => {});
      try {
        fetch(`${API_BASE}/stream/stop`).catch(() => {});
      } catch {}
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
        const u = new URL(target, API_HOST);
        const inner = u.searchParams.get("url") || u.searchParams.get("file");
        if (inner) target = inner;
      } catch {}
    }
    const isHttp = target.startsWith("http://") || target.startsWith("https://");
    const probeQuery = isHttp ? `url=${encodeURIComponent(target)}` : `file=${encodeURIComponent(target)}`;

    const runProbe = () => {
      fetch(`${API_BASE}/stream/probe?${probeQuery}`)
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

          // Автоматическое восстановление воспроизведения, если probe вернул метаданные (файл на бэкенде готов и читается),
          // но видеоплеер упал в ошибку или ещё не стартовал
          const video = videoRef.current;
          if (data && (data.duration > 0 || data.vcodec) && video && (!hasStartedPlaybackRef.current || video.error)) {
            if (video.error) {
              console.log("[PlayerModal] Probe succeeded while video was in error state; auto-recovering video playback");
              setErrorMsg(null);
              retryCountRef.current = 0;
              try {
                video.load();
                video.play().catch(() => {});
              } catch {}
            }
          }

          // Если probe вернул timeout или duration <= 0, продолжаем опрос до 8 раз (до ~16с)
          const isPendingProbe = isHttp && (!data.duration || data.duration <= 0 || data.status === "timeout");
          if (((!hasSubs || !hasExtSubs) || isPendingProbe) && isHttp && retryCount < 8) {
            retryCount++;
            retryTimer = setTimeout(runProbe, 2000);
          }
        })
        .catch(() => {
          if (!cancelled && retryCount < 8) {
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
    const subUrl = `${API_BASE}/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

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
      const subUrl = `${API_BASE}/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

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

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const err = video?.error;
    const codeMap: Record<number, string> = {
      1: "MEDIA_ERR_ABORTED",
      2: "MEDIA_ERR_NETWORK",
      3: "MEDIA_ERR_DECODE",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
    };
    const codeName = err ? (codeMap[err.code] || `ERR_${err.code}`) : "UNKNOWN";
    console.error(`[PlayerModal] Video error: ${codeName} - ${err?.message || "no details"}`);

    // Если воспроизведение ещё не началось и это сетевой/онлайн поток (например, торрент ещё качает чанки),
    // пробуем авто-повтор до 4 раз с паузой 2.5 секунды
    if (!hasStartedPlaybackRef.current && (isOnline || filePath.includes("/api/stream") || filePath.startsWith("http")) && retryCountRef.current < 4) {
      retryCountRef.current += 1;
      console.log(`[PlayerModal] Auto-retrying stream playback (attempt ${retryCountRef.current}/4) in 2.5s...`);
      setIsBuffering(true);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        retryPlayback();
      }, 2500);
      return;
    }

    if (err && err.code === 2) {
      setErrorMsg(t("streamPlaybackError") + ` (${codeName})`);
    } else {
      setErrorMsg(t("streamPlaybackError") + (err ? ` (${codeName})` : ""));
    }
    setIsBuffering(false);
  }, [filePath, isOnline, retryPlayback, t]);

  useEffect(() => {
    setErrorMsg(null);
    const video = videoRef.current;
    if (!video) return;

    const updateBuffered = () => {
      const v = videoRef.current;
      if (!v || !v.buffered || v.buffered.length === 0) return;
      const cur = v.currentTime;
      const b = v.buffered;
      let endSec = 0;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= cur + 0.5 && b.end(i) >= cur) {
          endSec = b.end(i);
          break;
        }
      }
      if (endSec === 0 && b.length > 0) {
        endSec = b.end(b.length - 1);
      }
      if (endSec > 0 && durationRef.current > 0) {
        const totalBufferedSec = isDirectStream ? endSec : (baseTime + endSec);
        const pct = Math.min(100, Math.max(0, (totalBufferedSec / durationRef.current) * 100));
        setBufferedPercent(pct);
      }
    };

    let rvfcId: any = null;
    const markFirstFramePresented = () => {
      if (hasStartedPlaybackRef.current) return;
      hasStartedPlaybackRef.current = true;
      setHasStartedPlayback(true);
      setErrorMsg(null);
      retryCountRef.current = 0;
      setIsBuffering(false);
    };

    const scheduleFirstFrameDetection = () => {
      if (hasStartedPlaybackRef.current) return;
      if (video && typeof (video as any).requestVideoFrameCallback === "function") {
        try {
          if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
            (video as any).cancelVideoFrameCallback(rvfcId);
          }
          rvfcId = (video as any).requestVideoFrameCallback(() => {
            markFirstFramePresented();
          });
        } catch {}
      }
    };

    let lastSaveSec = 0;
    const onTimeUpdate = () => {
      const vTime = video.currentTime;
      setVideoTime(vTime);
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrameDetection();
        if (vTime > 0.25 && video.readyState >= 2) {
          markFirstFramePresented();
        }
      } else {
        setIsBuffering(false);
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
      if ((durationRef.current <= 0) && vDur && !isNaN(vDur) && isFinite(vDur) && vDur > 0 && (!isLiveTranscode || vDur >= 180)) {
        setDuration(vDur);
      }
      if (isDirectStream && savedStartTimeRef.current > 0 && !hasInitialSeekedRef.current) {
        hasInitialSeekedRef.current = true;
        try {
          video.currentTime = savedStartTimeRef.current;
          setVideoTime(savedStartTimeRef.current);
        } catch {}
      }
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrameDetection();
      }
      video.play().catch(() => {});
    };
    const onPlay = () => {
      setIsPlaying(true);
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrameDetection();
        if (video.currentTime > 0.25 && video.readyState >= 2) {
          markFirstFramePresented();
        }
      } else {
        setIsBuffering(false);
      }
    };
    const onPlaying = () => {
      setIsPlaying(true);
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrameDetection();
      } else {
        setIsBuffering(false);
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      updateBuffered();
      saveProgressRef.current(isDirectStream ? video.currentTime : (baseTime + video.currentTime), durationRef.current);
    };
    const onWaiting = () => {
      if (hasStartedPlaybackRef.current) {
        setIsBuffering(true);
      }
    };
    const onCanPlay = () => {
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrameDetection();
      } else {
        setIsBuffering(false);
      }
    };
    const onProgress = () => {
      updateBuffered();
    };
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
        saveProgressRef.current(0, durationRef.current);
      } catch {}

      let nextStarted = false;
      if (onPlayNext) {
        nextStarted = Boolean(onPlayNext());
      }
      if (!nextStarted) {
        closeModalRef.current?.();
      }
    };


    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("progress", onProgress);
    video.addEventListener("ended", onEnded);

    return () => {
      if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
        try {
          (video as any).cancelVideoFrameCallback(rvfcId);
        } catch {}
        rvfcId = null;
      }
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("ended", onEnded);
    };
  }, [streamUrl, baseTime]);

  const currentPlayhead = isDirectStream ? videoTime : (baseTime + videoTime);
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentPlayhead / duration) * 100)) : 0;

  return (
    <Focusable
      ref={containerRef}
      tabIndex={0}
      className={`projacktor-player-fullscreen${showControls ? "" : " controls-hidden"}`}
      onCancelButton={(evt: any) => {
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        if (isOverlayActiveOrRecent(1200)) {
          return false;
        }
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          return false;
        }
        if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          return false;
        }
        closeModalRef.current?.();
        return false;
      }}
      onCancel={(evt: any) => {
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        if (isOverlayActiveOrRecent(1200)) {
          return;
        }
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          return;
        }
        if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          return;
        }
        closeModalRef.current?.();
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
        {/* Top Header Bar: Логотип фильма или название (только когда идет воспроизведение) */}
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
            opacity: showControls && hasStartedPlayback ? 1 : 0,
            visibility: showControls && hasStartedPlayback ? "visible" : "hidden",
            pointerEvents: showControls && hasStartedPlayback ? "auto" : "none",
            transition: "opacity 0.3s ease, visibility 0.3s ease",
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

              <video
                ref={videoRef}
                src={streamUrl}
                autoPlay
                preload="auto"
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

              {errorMsg && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 35,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(10, 13, 20, 0.92)",
                    backdropFilter: "blur(8px)",
                    textAlign: "center",
                    padding: 32,
                  }}
                >
                  <div
                    style={{
                      maxWidth: 480,
                      background: "rgba(22, 27, 38, 0.95)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: 12,
                      padding: "24px 32px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 16,
                      boxShadow: "0 16px 32px rgba(0, 0, 0, 0.6)",
                    }}
                  >
                    <div style={{ color: "var(--ds-danger, #e53e3e)", fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                      {errorMsg}
                    </div>
                  </div>
                </div>
              )}

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
        </div>

        {/* Bottom Controls Overlay */}
        <PlayerControls
          showControls={showControls}
          isPlaying={isPlaying}
          currentPlayhead={currentPlayhead}
          duration={duration}
          progressPercent={progressPercent}
          bufferedPercent={bufferedPercent}
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
          hasNextEpisode={!!hasNextEpisode}
          onPlayNextEpisode={() => onPlayNext?.()}
        />
      </Focusable>
  );
};
