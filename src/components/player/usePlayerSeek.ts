import { RefObject, MutableRefObject, useRef, useCallback } from "react";

interface UsePlayerSeekProps {
  isDirectStream: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number;
  baseTime: number;
  videoTime: number;
  selectedAudio?: number;
  getStreamUrl: (startTime?: number, track?: number, cacheBust?: boolean) => string;
  setBaseTime: (t: number) => void;
  setVideoTime: (t: number) => void;
  setBufferedPercent: (p: number) => void;
  setStreamUrl: (url: string) => void;
  setErrorMsg: (msg: string | null) => void;
  resetControlsTimer: () => void;
  hasStartedPlaybackRef: MutableRefObject<boolean>;
  retryCountRef: MutableRefObject<number>;
}

export function usePlayerSeek({
  isDirectStream, videoRef, duration, baseTime, videoTime, selectedAudio,
  getStreamUrl, setBaseTime, setVideoTime, setBufferedPercent, setStreamUrl,
  setErrorMsg, resetControlsTimer, hasStartedPlaybackRef, retryCountRef,
}: UsePlayerSeekProps) {
  const seekCommitTimerRef = useRef<number | null>(null);
  const targetSeekTimeRef = useRef<number | null>(null);

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
        try { videoRef.current?.pause(); } catch {}
        hasStartedPlaybackRef.current = false;
        retryCountRef.current = 0;
        setBaseTime(target);
        setVideoTime(0);
        setBufferedPercent(0);
        setStreamUrl(getStreamUrl(target, selectedAudio, true));
      }
    }
  }, [getStreamUrl, isDirectStream, selectedAudio, setBaseTime, setBufferedPercent, setStreamUrl, setVideoTime, videoRef, hasStartedPlaybackRef, retryCountRef]);

  const seekRelative = useCallback((delta: number) => {
    const currentBase = targetSeekTimeRef.current !== null
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
  }, [baseTime, commitPendingSeek, duration, isDirectStream, resetControlsTimer, setVideoTime, videoRef]);

  const seekTo = useCallback((targetSec: number) => {
    setErrorMsg(null);
    const newTime = Math.max(0, Math.min(duration || 999999, targetSec));
    if (isDirectStream && videoRef.current) {
      videoRef.current.currentTime = newTime;
      setVideoTime(newTime);
    } else {
      try { videoRef.current?.pause(); } catch {}
      hasStartedPlaybackRef.current = false;
      retryCountRef.current = 0;
      setBaseTime(newTime);
      setVideoTime(0);
      setBufferedPercent(0);
      setStreamUrl(getStreamUrl(newTime, selectedAudio, true));
    }
    resetControlsTimer();
  }, [duration, getStreamUrl, isDirectStream, resetControlsTimer, selectedAudio, setBaseTime, setBufferedPercent, setErrorMsg, setStreamUrl, setVideoTime, videoRef, hasStartedPlaybackRef, retryCountRef]);

  const handleProgressBarTouch = useCallback((e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const targetPercent = clickX / rect.width;
    seekTo(targetPercent * duration);
  }, [duration, seekTo]);

  const currentPlayhead = isDirectStream ? videoTime : (baseTime + videoTime);
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentPlayhead / duration) * 100)) : 0;

  return {
    commitPendingSeek,
    seekRelative,
    seekTo,
    handleProgressBarTouch,
    currentPlayhead,
    progressPercent,
  };
}
