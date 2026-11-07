import { useEffect, RefObject, MutableRefObject } from "react";

interface UseVideoEventsProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  streamUrl: string;
  baseTime: number;
  filePath: string;
  actualFilePath: string | null;
  title: string;
  isOnline: boolean;
  isDirectStream: boolean;
  savedStartTime: number;
  durationRef: MutableRefObject<number>;
  setDuration?: (d: number) => void;
  hasStartedPlaybackRef: MutableRefObject<boolean>;
  retryCountRef: MutableRefObject<number>;
  saveProgress: (cur: number, dur: number) => void;
  setVideoTime: (t: number) => void;
  setBufferedPercent: (p: number) => void;
  setHasStartedPlayback: (b: boolean) => void;
  setIsPlaying: (b: boolean) => void;
  setIsBuffering: (b: boolean) => void;
  setErrorMsg: (msg: string | null) => void;
  onPlayNext?: () => boolean | void;
  closeModal?: () => void;
}

export function useVideoEvents({
  videoRef, streamUrl, baseTime, filePath, actualFilePath, title, isOnline,
  isDirectStream, savedStartTime, durationRef, setDuration, hasStartedPlaybackRef,
  retryCountRef, saveProgress, setVideoTime, setBufferedPercent,
  setHasStartedPlayback, setIsPlaying, setIsBuffering, setErrorMsg,
  onPlayNext, closeModal,
}: UseVideoEventsProps) {
  const hasInitialSeekedRef = { current: false };

  useEffect(() => {
    setErrorMsg(null);
    const video = videoRef.current;
    if (!video) return;

    const getAvailableDuration = () => {
      let dur = durationRef.current;
      const v = videoRef.current;
      if (dur <= 0 && v?.duration && !isNaN(v.duration) && isFinite(v.duration) && v.duration > 0) {
        dur = v.duration; durationRef.current = dur; setDuration?.(dur);
      }
      return dur > 0 ? dur : 0;
    };

    const updateBuffered = () => {
      const v = videoRef.current;
      if (!v || !v.buffered || v.buffered.length === 0) return;
      const cur = v.currentTime;
      let endSec = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        const start = v.buffered.start(i);
        const end = v.buffered.end(i);
        if (start <= cur + 1.0 && end >= cur - 0.2) {
          endSec = Math.max(endSec, end);
        }
      }
      if (endSec === 0 && v.buffered.length > 0) endSec = v.buffered.end(v.buffered.length - 1);
      const dur = getAvailableDuration();
      if (endSec > 0 && dur > 0) {
        const total = isDirectStream ? endSec : (baseTime + endSec);
        setBufferedPercent(Math.min(100, Math.max(0, (total / dur) * 100)));
      }
    };

    let rvfcId: any = null;
    const markFirstFrame = () => {
      if (hasStartedPlaybackRef.current) return;
      hasStartedPlaybackRef.current = true;
      setHasStartedPlayback(true);
      setErrorMsg(null);
      retryCountRef.current = 0;
      setIsBuffering(false);
    };

    const scheduleFirstFrame = () => {
      if (hasStartedPlaybackRef.current) return;
      if (video && typeof (video as any).requestVideoFrameCallback === "function") {
        try {
          if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
            (video as any).cancelVideoFrameCallback(rvfcId);
          }
          rvfcId = (video as any).requestVideoFrameCallback(() => { markFirstFrame(); });
        } catch {}
      }
    };

    let lastSave = 0;
    const onTimeUpdate = () => {
      const vTime = video.currentTime;
      setVideoTime(vTime);
      updateBuffered();
      if (!hasStartedPlaybackRef.current) {
        scheduleFirstFrame();
        if (vTime > 0.25 && video.readyState >= 2) markFirstFrame();
      } else { setIsBuffering(false); }
      const totalCur = Math.floor(isDirectStream ? vTime : (baseTime + vTime));
      if (Math.abs(totalCur - lastSave) >= 5) { lastSave = totalCur; saveProgress(totalCur, durationRef.current); }
    };

    const onLoadedMetadata = () => {
      const vDur = video.duration;
      const isLive = isOnline || filePath.includes("/api/stream");
      if (durationRef.current <= 0 && vDur && !isNaN(vDur) && isFinite(vDur) && vDur > 0 && (!isLive || vDur >= 180)) {
        durationRef.current = vDur;
        setDuration?.(vDur);
      }
      if (isDirectStream && savedStartTime > 0 && !hasInitialSeekedRef.current) {
        hasInitialSeekedRef.current = true;
        try { video.currentTime = savedStartTime; setVideoTime(savedStartTime); } catch {}
      }
      updateBuffered();
      if (!hasStartedPlaybackRef.current) scheduleFirstFrame();
      video.play().catch(() => {});
    };

    const onDurationChange = () => {
      getAvailableDuration();
      updateBuffered();
    };

    const onPlay = () => { setIsPlaying(true); updateBuffered(); if (!hasStartedPlaybackRef.current) scheduleFirstFrame(); else setIsBuffering(false); };
    const onPlaying = () => { setIsPlaying(true); updateBuffered(); if (!hasStartedPlaybackRef.current) scheduleFirstFrame(); else setIsBuffering(false); };
    const onPause = () => { setIsPlaying(false); updateBuffered(); saveProgress(isDirectStream ? video.currentTime : (baseTime + video.currentTime), durationRef.current); };
    const onWaiting = () => { if (hasStartedPlaybackRef.current) setIsBuffering(true); };
    const onCanPlay = () => { updateBuffered(); if (!hasStartedPlaybackRef.current) scheduleFirstFrame(); else setIsBuffering(false); };
    const onEnded = () => {
      setIsPlaying(false);
      try {
        const fileTarget = actualFilePath || filePath;
        const fileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
        const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
        localStorage.removeItem(`projacktor_progress_${fileName}`);
        if (cleanTitle) localStorage.removeItem(`projacktor_progress_t_${cleanTitle}`);
        saveProgress(0, durationRef.current);
      } catch {}
      let nextStarted = false;
      if (onPlayNext) nextStarted = Boolean(onPlayNext());
      if (!nextStarted) closeModal?.();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadeddata", updateBuffered);
    video.addEventListener("play", onPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("progress", updateBuffered);
    video.addEventListener("ended", onEnded);

    updateBuffered();

    return () => {
      if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
        try { (video as any).cancelVideoFrameCallback(rvfcId); } catch {}
      }
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadeddata", updateBuffered);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("progress", updateBuffered);
      video.removeEventListener("ended", onEnded);
    };
  }, [streamUrl, baseTime, videoRef]);
}
