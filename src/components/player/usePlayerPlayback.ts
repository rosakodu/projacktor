import { useState, useRef, useEffect, useCallback, RefObject, MutableRefObject } from "react";
import { useScreensaverInhibitor } from "../../runtime/screensaverInhibitor";
import { TorrentStatusInfo } from "./PlayerHUD";
import { useI18n } from "../../i18n";
import { useVideoEvents } from "./useVideoEvents";

interface UsePlayerPlaybackProps {
  filePath: string;
  actualFilePath: string | null;
  title: string;
  isOnline: boolean;
  isDirectStream: boolean;
  savedStartTime: number;
  durationRef: MutableRefObject<number>;
  saveProgress: (cur: number, dur: number) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamUrl: string;
  setStreamUrl: React.Dispatch<React.SetStateAction<string>>;
  volume: number;
  torrentStatus: TorrentStatusInfo | null;
  zeroSeedersCountRef: MutableRefObject<number>;
  onPlayNext?: () => boolean | void;
  closeModal?: () => void;
  resetControlsTimer: () => void;
  hasStartedPlaybackRef?: MutableRefObject<boolean>;
  retryCountRef?: MutableRefObject<number>;
}

export function usePlayerPlayback({
  filePath, actualFilePath, title, isOnline, isDirectStream, savedStartTime,
  durationRef, saveProgress, videoRef, streamUrl, setStreamUrl,
  volume, torrentStatus, zeroSeedersCountRef, onPlayNext, closeModal, resetControlsTimer,
  hasStartedPlaybackRef: externalPlaybackRef, retryCountRef: externalRetryRef,
}: UsePlayerPlaybackProps) {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  useScreensaverInhibitor(isPlaying);

  const [baseTime, setBaseTime] = useState<number>(savedStartTime);
  const [videoTime, setVideoTime] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);

  const [hasStartedPlayback, setHasStartedPlayback] = useState<boolean>(false);
  const localPlaybackRef = useRef<boolean>(false);
  const hasStartedPlaybackRef = externalPlaybackRef || localPlaybackRef;
  hasStartedPlaybackRef.current = hasStartedPlayback;

  const localRetryRef = useRef<number>(0);
  const retryCountRef = externalRetryRef || localRetryRef;
  const retryTimeoutRef = useRef<any>(null);
  const prevFilePathRef = useRef<string>(filePath);

  useEffect(() => {
    if (prevFilePathRef.current !== filePath) {
      prevFilePathRef.current = filePath;
      hasStartedPlaybackRef.current = false;
      setHasStartedPlayback(false);
      setIsBuffering(true);
    }
  }, [filePath, hasStartedPlaybackRef]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !hasStartedPlayback;
      if (hasStartedPlayback) videoRef.current.volume = volume;
    }
  }, [hasStartedPlayback, volume, videoRef]);

  const lastToggleAtRef = useRef<number>(0);
  const togglePlay = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 250) return;
    lastToggleAtRef.current = now;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
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
  }, [isDirectStream, isOnline, resetControlsTimer, videoRef]);

  const retryPlayback = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setErrorMsg(null);
    setIsBuffering(true);
    setStreamUrl((curUrl) => {
      const now = Date.now();
      return curUrl.includes("t=") ? curUrl.replace(/t=\d+/, `t=${now}`) : `${curUrl}${curUrl.includes("?") ? "&" : "?"}t=${now}`;
    });
    setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        try { video.load(); video.play().catch(() => {}); } catch {}
      }
    }, 50);
  }, [setStreamUrl, videoRef]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const err = video?.error;
    const codeMap: Record<number, string> = { 1: "MEDIA_ERR_ABORTED", 2: "MEDIA_ERR_NETWORK", 3: "MEDIA_ERR_DECODE", 4: "MEDIA_ERR_SRC_NOT_SUPPORTED" };
    const codeName = err ? (codeMap[err.code] || `ERR_${err.code}`) : "UNKNOWN";
    const isTranscodeOrOnline = isOnline || filePath.includes("/api/stream") || filePath.startsWith("http") || !isDirectStream;
    const maxRetries = hasStartedPlaybackRef.current ? 4 : 10;

    if (isTranscodeOrOnline && retryCountRef.current < maxRetries) {
      retryCountRef.current += 1;
      const delayMs = hasStartedPlaybackRef.current ? 400 : Math.min(3000, 1000 + retryCountRef.current * 300);
      setIsBuffering(true);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => { retryPlayback(); }, delayMs);
      return;
    }
    if (isOnline && zeroSeedersCountRef.current >= 5 && (!torrentStatus || (torrentStatus.connected_seeders || 0) === 0)) {
      setErrorMsg("Раздача не отвечает: нет доступных сидеров в сети. Пожалуйста, вернитесь назад и выберите другую раздачу из списка.");
    } else {
      setErrorMsg(t("streamPlaybackError") + (codeName ? ` (${codeName})` : ""));
    }
    setIsBuffering(false);
  }, [filePath, isDirectStream, isOnline, retryPlayback, t, torrentStatus, videoRef, zeroSeedersCountRef]);

  useVideoEvents({
    videoRef, streamUrl, baseTime, filePath, actualFilePath, title, isOnline,
    isDirectStream, savedStartTime, durationRef, hasStartedPlaybackRef,
    retryCountRef, saveProgress, setVideoTime, setBufferedPercent,
    setHasStartedPlayback, setIsPlaying, setIsBuffering, setErrorMsg,
    onPlayNext, closeModal,
  });

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying, isBuffering, setIsBuffering, hasStartedPlayback, hasStartedPlaybackRef,
    baseTime, setBaseTime, videoTime, setVideoTime, errorMsg, setErrorMsg,
    bufferedPercent, setBufferedPercent, togglePlay, retryPlayback, handleVideoError, retryCountRef,
  };
}
