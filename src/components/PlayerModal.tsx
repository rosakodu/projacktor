import { FC, useState, useRef, useEffect, useCallback } from "react";
import { ModalRoot, Focusable } from "@decky/ui";
import {
  FaPlay,
  FaPause,
  FaBackward,
  FaForward,
  FaCheck,
  FaHeadphones,
  FaTimes,
  FaClosedCaptioning,
  FaVolumeUp,
  FaVolumeMute,
} from "react-icons/fa";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";

interface AudioTrack {
  index: number;
  codec: string;
  channels: number;
  lang: string;
  title: string;
}

interface SubtitleTrack {
  index: number;
  codec: string;
  lang: string;
  title: string;
}

interface PlayerModalProps {
  filePath: string;
  title: string;
  isOnline?: boolean;
  closeModal?: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export const PlayerModal: FC<PlayerModalProps> = ({ filePath, title, isOnline = false, closeModal }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [baseTime, setBaseTime] = useState<number>(0);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | undefined>(undefined);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [volumeHudVisible, setVolumeHudVisible] = useState<boolean>(false);
  const volumeHudTimerRef = useRef<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<number | null>(null);

  const showAudioMenuRef = useRef(showAudioMenu);
  showAudioMenuRef.current = showAudioMenu;

  const showSubtitleMenuRef = useRef(showSubtitleMenu);
  showSubtitleMenuRef.current = showSubtitleMenu;

  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;

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

  const selectSubtitleTrack = useCallback((trackIndex: number | null) => {
    setSelectedSubtitle(trackIndex);
    setShowSubtitleMenu(false);
    resetControlsTimer();
  }, [resetControlsTimer]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current !== null) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimer]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchMovedRef = useRef<boolean>(false);

  const getStreamUrl = useCallback(
    (startTime: number = 0, track?: number) => {
      let base = `http://127.0.0.1:8400/api/stream?file=${encodeURIComponent(filePath)}`;
      if (isOnline) {
        base += `&online=1`;
      }
      if (startTime > 0) {
        base += `&start=${Math.floor(startTime)}`;
      }
      if (track !== undefined) {
        base += `&audio=${track}`;
      }
      return base;
    },
    [filePath, isOnline]
  );

  const [streamUrl, setStreamUrl] = useState<string>(() => getStreamUrl(0));

  const togglePlay = useCallback(() => {
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

  const seekRelative = useCallback((delta: number) => {
    const cur = baseTime + (videoRef.current ? videoRef.current.currentTime : 0);
    const newTime = Math.max(0, Math.min(duration || 999999, cur + delta));
    setBaseTime(newTime);
    setVideoTime(0);
    setStreamUrl(getStreamUrl(newTime, selectedAudio));
    resetControlsTimer();
  }, [baseTime, duration, getStreamUrl, resetControlsTimer, selectedAudio]);

  const selectAudioTrack = useCallback((trackIndex: number) => {
    setSelectedAudio(trackIndex);
    setShowAudioMenu(false);
    const cur = baseTime + (videoRef.current ? videoRef.current.currentTime : 0);
    setBaseTime(cur);
    setVideoTime(0);
    setStreamUrl(getStreamUrl(cur, trackIndex));
    resetControlsTimer();
  }, [baseTime, getStreamUrl, resetControlsTimer]);

  const seekTo = (targetSec: number) => {
    const newTime = Math.max(0, Math.min(duration || 999999, targetSec));
    setBaseTime(newTime);
    setVideoTime(0);
    setStreamUrl(getStreamUrl(newTime, selectedAudio));
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
        // Simple tap: toggle play/pause and show controls
        togglePlay();
      } else {
        // Horizontal swipe: seek
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
          if (deltaX > 0) {
            seekRelative(15);
          } else {
            seekRelative(-15);
          }
        }
        // Vertical swipe on right half: volume
        else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) {
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

  useEffect(() => {
    const handleActivity = () => {
      resetControlsTimer();
    };

    let lastSeekAt = 0;
    let lastVolumeAt = 0;
    let lastToggleAt = 0;

    // Прямая подписка на события геймпада Steam Deck
    const unController = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const now = Date.now();

      // Кнопка A (0): Воспроизведение / Пауза
      if (e.button === RawButton.A || e.button === 0) {
        if (now - lastToggleAt < 250) return;
        lastToggleAt = now;
        togglePlay();
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // Кнопка B (1): Закрыть меню аудио/субтитров или выйти из плеера
      if (e.button === RawButton.B || e.button === 1) {
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          setShowControls(true);
          resetControlsTimer();
        } else if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          setShowControls(true);
          resetControlsTimer();
        } else if (closeModalRef.current) {
          closeModalRef.current();
        }
        return;
      }

      // Кнопка Y (3): Переключение меню аудиодорожек
      if (e.button === RawButton.Y || e.button === 3) {
        setShowAudioMenu((prev) => !prev);
        setShowSubtitleMenu(false);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // Кнопка X (2): Переключение меню субтитров
      if (e.button === RawButton.X || e.button === 2) {
        setShowSubtitleMenu((prev) => !prev);
        setShowAudioMenu(false);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // Перемотка назад (-15с): только бампер L1 (30) и триггер L2 (28) (D-Pad и стики отключены)
      if (
        e.button === RawButton.L1 ||
        e.button === RawButton.L2 ||
        e.button === 30 ||
        e.button === 28
      ) {
        if (now - lastSeekAt < 180) return;
        lastSeekAt = now;
        seekRelative(-15);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // Перемотка вперёд (+15с): только бампер R1 (31) и триггер R2 (29) (D-Pad и стики отключены)
      if (
        e.button === RawButton.R1 ||
        e.button === RawButton.R2 ||
        e.button === 31 ||
        e.button === 29
      ) {
        if (now - lastSeekAt < 180) return;
        lastSeekAt = now;
        seekRelative(15);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // D-pad Вверх (4), Стик Вверх (20): Громкость +5%
      if (
        e.button === RawButton.DPAD_UP ||
        e.button === RawButton.LEFTSTICK_UP ||
        e.button === 4 ||
        e.button === 20
      ) {
        if (now - lastVolumeAt < 120) return;
        lastVolumeAt = now;
        changeVolume(0.05);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // D-pad Вниз (6), Стик Вниз (21): Громкость -5%
      if (
        e.button === RawButton.DPAD_DOWN ||
        e.button === RawButton.LEFTSTICK_DOWN ||
        e.button === 6 ||
        e.button === 21
      ) {
        if (now - lastVolumeAt < 120) return;
        lastVolumeAt = now;
        changeVolume(-0.05);
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      setShowControls(true);
      resetControlsTimer();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      setShowControls(true);
      resetControlsTimer();

      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          setShowControls(true);
          resetControlsTimer();
        } else if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          setShowControls(true);
          resetControlsTimer();
        } else if (closeModalRef.current) {
          closeModalRef.current();
        }
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        return;
      }

      if (e.key === " " || e.key === "Enter" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekRelative(-15);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        seekRelative(15);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        changeVolume(0.05);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        changeVolume(-0.05);
      } else if (e.key === "y" || e.key === "Y") {
        setShowAudioMenu((prev) => !prev);
        setShowSubtitleMenu(false);
      } else if (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X") {
        setShowSubtitleMenu((prev) => !prev);
        setShowAudioMenu(false);
      }
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("pointermove", handleActivity);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      unController();
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [
    audioTracks.length,
    changeVolume,
    resetControlsTimer,
    seekRelative,
    togglePlay,
  ]);

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

  // Probe file metadata on mount: duration and audio tracks
  useEffect(() => {
    let cancelled = false;
    fetch(`http://127.0.0.1:8400/api/stream/probe?file=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.duration && data.duration > 0) {
          setDuration(data.duration);
        }
        if (Array.isArray(data.audio_tracks) && data.audio_tracks.length > 0) {
          setAudioTracks(data.audio_tracks);
          if (selectedAudio === undefined) {
            setSelectedAudio(data.audio_tracks[0].index);
          }
        }
        if (Array.isArray(data.subtitle_tracks) && data.subtitle_tracks.length > 0) {
          setSubtitleTracks(data.subtitle_tracks);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Управление активной дорожкой субтитров в <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = selectedSubtitle !== null ? "showing" : "disabled";
    }
  }, [selectedSubtitle]);

  const handleVideoError = () => {
    setErrorMsg("Ошибка воспроизведения потока. Проверьте файл.");
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setVideoTime(video.currentTime);
      setIsBuffering(false);
    };
    const onLoadedMetadata = () => {
      if (!duration && video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
        setDuration(video.duration);
      }
      setIsBuffering(false);
      video.play().catch(() => {});
    };
    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [streamUrl, duration]);

  const currentPlayhead = baseTime + videoTime;
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
          const btn = evt?.detail?.button;
          if (btn === 9) {
            // DIR_UP - звук +
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            changeVolume(0.05);
          } else if (btn === 10) {
            // DIR_DOWN - звук -
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            changeVolume(-0.05);
          }
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100vw",
          height: "100vh",
          color: "#fff",
          background: "#000",
          overflow: "hidden",
          borderRadius: 0,
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 2147483647,
          cursor: showControls ? "default" : "none",
        }}
      >
        {/* Top Header Bar: ТОЛЬКО НАЗВАНИЕ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 24px",
            background: "rgba(0, 0, 0, 0.85)",
            flexShrink: 0,
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
            flex: 1,
            position: "relative",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            cursor: "pointer",
          }}
        >
          {/* Индикатор изменения громкости (HUD) */}
          {volumeHudVisible && (
            <div
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "rgba(18, 23, 33, 0.92)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: 0,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                zIndex: 20,
                pointerEvents: "none",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.6)",
              }}
            >
              {volume > 0 ? (
                <FaVolumeUp style={{ color: "var(--ds-accent)", fontSize: 15 }} />
              ) : (
                <FaVolumeMute style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }} />
              )}
              <div style={{ width: 80, height: 6, background: "rgba(255,255,255,0.15)", position: "relative" }}>
                <div style={{ width: `${Math.round(volume * 100)}%`, height: "100%", background: "var(--ds-accent)" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 36 }}>
                {Math.round(volume * 100)}%
              </span>
            </div>
          )}

          {isBuffering && !errorMsg && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  border: "4px solid rgba(255, 255, 255, 0.2)",
                  borderTop: "4px solid var(--ds-accent)",
                  borderRadius: "50%",
                  animation: "projacktor-spin 0.9s linear infinite",
                  marginBottom: 16,
                }}
              />
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, letterSpacing: 0.5 }}>
                {isOnline ? "Буферизация видеопотока..." : "Загрузка..."}
              </div>
            </div>
          )}

          {errorMsg ? (
            <div style={{ textAlign: "center", color: "var(--ds-danger)", fontSize: 14, padding: 20 }}>
              {errorMsg}
            </div>
          ) : (
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
              }}
            >
              {selectedSubtitle !== null && (
                <track
                  key={selectedSubtitle}
                  kind="subtitles"
                  label={subtitleTracks.find((s) => s.index === selectedSubtitle)?.title || "Субтитры"}
                  srcLang={subtitleTracks.find((s) => s.index === selectedSubtitle)?.lang || "ru"}
                  src={`http://127.0.0.1:8400/api/stream/subtitles?file=${encodeURIComponent(filePath)}&track=${selectedSubtitle}`}
                  default
                />
              )}
            </video>
          )}
        </div>

        {/* Timeline Progress Bar */}
        <div
          onClick={handleProgressBarTouch}
          onTouchStart={handleProgressBarTouch}
          style={{
            padding: "8px 24px",
            background: "rgba(0, 0, 0, 0.85)",
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? "auto" : "none",
            transition: "opacity 0.3s ease",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              height: 8,
              background: "rgba(255,255,255,0.12)",
              cursor: "pointer",
              position: "relative",
              borderRadius: 0,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPercent}%`,
                background: "var(--ds-accent)",
                borderRadius: 0,
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>

        {/* Bottom Controls Bar */}
        <Focusable
          flow-children="row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 24px 16px",
            background: "rgba(0, 0, 0, 0.85)",
            flexShrink: 0,
            gap: 16,
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? "auto" : "none",
            transition: "opacity 0.3s ease",
            position: "relative",
          }}
        >
          {/* Слева: Перемотка назад (-15с), Пауза / Плей, Перемотка вперед (+15с) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, zIndex: 2 }}>
            <Focusable
              className="ds-btn ds-btn--compact ds-btn--icon"
              onActivate={() => seekRelative(-15)}
              onClick={() => seekRelative(-15)}
              style={{ width: 36, height: 32 }}
              title="Перемотка назад (-15с)"
            >
              <FaBackward />
            </Focusable>

            <Focusable
              className="ds-btn ds-btn--primary ds-btn--compact ds-btn--icon"
              onActivate={togglePlay}
              onClick={togglePlay}
              style={{ width: 36, height: 32 }}
              title={isPlaying ? "Пауза" : "Воспроизведение"}
            >
              {isPlaying ? <FaPause /> : <FaPlay />}
            </Focusable>

            <Focusable
              className="ds-btn ds-btn--compact ds-btn--icon"
              onActivate={() => seekRelative(15)}
              onClick={() => seekRelative(15)}
              style={{ width: 36, height: 32 }}
              title="Перемотка вперед (+15с)"
            >
              <FaForward />
            </Focusable>
          </div>

          {/* По центру: Время */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255, 255, 255, 0.9)",
              fontFamily: "monospace",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 1,
            }}
          >
            {formatTime(currentPlayhead)} / {duration > 0 ? formatTime(duration) : (isOnline ? "Онлайн" : "--:--")}
          </div>

          {/* Справа: Выбор субтитров, Выбор аудиодорожки, Закрыть */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 2 }}>
            {/* Кнопка выбора субтитров */}
            <Focusable
              className="ds-btn ds-btn--compact ds-btn--icon"
              onActivate={() => {
                setShowSubtitleMenu((prev) => !prev);
                setShowAudioMenu(false);
              }}
              onClick={() => {
                setShowSubtitleMenu((prev) => !prev);
                setShowAudioMenu(false);
              }}
              title="Выбор субтитров (X)"
              style={{
                borderRadius: 0,
                background: showSubtitleMenu || selectedSubtitle !== null ? "var(--ds-surface-hi)" : "var(--ds-surface)",
                borderColor: showSubtitleMenu || selectedSubtitle !== null ? "rgba(255,255,255,0.4)" : "var(--ds-border)",
                color: selectedSubtitle !== null ? "var(--ds-accent)" : "#fff",
                width: 34,
                height: 32,
              }}
            >
              <FaClosedCaptioning style={{ fontSize: 14 }} />
            </Focusable>

            {showSubtitleMenu && (
              <Focusable
                flow-children="column"
                style={{
                  position: "absolute",
                  bottom: "100%",
                  right: 44,
                  marginBottom: 8,
                  background: "#121721",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
                  minWidth: 220,
                  maxWidth: 340,
                  zIndex: 1000,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 6,
                }}
              >
                <div style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--ds-text-dim)", textTransform: "uppercase" }}>
                  Субтитры
                </div>
                <Focusable
                  className="ds-btn ds-btn--compact"
                  onActivate={() => selectSubtitleTrack(null)}
                  onClick={() => selectSubtitleTrack(null)}
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    height: 32,
                    background: selectedSubtitle === null ? "var(--ds-surface-hi)" : "transparent",
                    borderColor: selectedSubtitle === null ? "rgba(255,255,255,0.3)" : "transparent",
                    gap: 8,
                    textAlign: "left",
                  }}
                >
                  <FaCheck style={{ fontSize: 10, opacity: selectedSubtitle === null ? 1 : 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 12 }}>Отключить субтитры</span>
                </Focusable>

                {subtitleTracks.length === 0 ? (
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    Субтитры в раздаче не найдены
                  </div>
                ) : (
                  subtitleTracks.map((sub) => (
                    <Focusable
                      key={sub.index}
                      className="ds-btn ds-btn--compact"
                      onActivate={() => selectSubtitleTrack(sub.index)}
                      onClick={() => selectSubtitleTrack(sub.index)}
                      style={{
                        justifyContent: "flex-start",
                        width: "100%",
                        height: 32,
                        background: sub.index === selectedSubtitle ? "var(--ds-surface-hi)" : "transparent",
                        borderColor: sub.index === selectedSubtitle ? "rgba(255,255,255,0.3)" : "transparent",
                        gap: 8,
                        textAlign: "left",
                      }}
                    >
                      <FaCheck style={{ fontSize: 10, opacity: sub.index === selectedSubtitle ? 1 : 0, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub.title || (sub.lang ? `Субтитры (${sub.lang.toUpperCase()})` : `Субтитры #${sub.index}`)}
                      </span>
                    </Focusable>
                  ))
                )}
              </Focusable>
            )}

            {/* Кнопка выбора аудиодорожки */}
            <Focusable
              className="ds-btn ds-btn--compact ds-btn--icon"
              onActivate={() => {
                setShowAudioMenu((prev) => !prev);
                setShowSubtitleMenu(false);
              }}
              onClick={() => {
                setShowAudioMenu((prev) => !prev);
                setShowSubtitleMenu(false);
              }}
              title="Выбор звуковой дорожки (Y)"
              style={{
                borderRadius: 0,
                background: showAudioMenu ? "var(--ds-surface-hi)" : "var(--ds-surface)",
                borderColor: showAudioMenu ? "rgba(255,255,255,0.4)" : "var(--ds-border)",
                width: 34,
                height: 32,
              }}
            >
              <FaHeadphones style={{ fontSize: 13 }} />
            </Focusable>

            {showAudioMenu && (
              <Focusable
                flow-children="column"
                style={{
                  position: "absolute",
                  bottom: "100%",
                  right: 44,
                  marginBottom: 8,
                  background: "#121721",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
                  minWidth: 220,
                  maxWidth: 340,
                  zIndex: 1000,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 6,
                }}
              >
                <div style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--ds-text-dim)", textTransform: "uppercase" }}>
                  Аудиодорожка
                </div>
                {audioTracks.length === 0 ? (
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    Дорожка по умолчанию
                  </div>
                ) : (
                  audioTracks.map((track) => (
                    <Focusable
                      key={track.index}
                      className="ds-btn ds-btn--compact"
                      onActivate={() => selectAudioTrack(track.index)}
                      onClick={() => selectAudioTrack(track.index)}
                      style={{
                        justifyContent: "flex-start",
                        width: "100%",
                        height: 32,
                        background: track.index === selectedAudio ? "var(--ds-surface-hi)" : "transparent",
                        borderColor: track.index === selectedAudio ? "rgba(255,255,255,0.3)" : "transparent",
                        gap: 8,
                        textAlign: "left",
                      }}
                    >
                      <FaCheck style={{ fontSize: 10, opacity: track.index === selectedAudio ? 1 : 0, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {track.title || (track.lang ? `Аудио (${track.lang.toUpperCase()})` : `Дорожка #${track.index}`)}
                      </span>
                    </Focusable>
                  ))
                )}
              </Focusable>
            )}

            {/* Кнопка закрытия плеера в правом нижнем углу */}
            {closeModal && (
              <Focusable
                className="ds-btn ds-btn--compact ds-btn--icon"
                onActivate={closeModal}
                onClick={closeModal}
                title="Закрыть плеер (B)"
                style={{
                  width: 34,
                  height: 32,
                  borderRadius: 0,
                  background: "rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <FaTimes style={{ fontSize: 14 }} />
              </Focusable>
            )}
          </div>
        </Focusable>
      </Focusable>
    </ModalRoot>
  );
};
