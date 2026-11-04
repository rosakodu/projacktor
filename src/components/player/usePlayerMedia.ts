import { useState, useEffect, useCallback, RefObject, MutableRefObject } from "react";
import { rpcResumeAllDownloads, rpcDropStream, fetchMovieLogo, API_BASE, API_HOST } from "../../api";
import { PlayerMediaInfo } from "../../types";
import { AudioTrack, SubtitleTrack } from "./types";

interface UsePlayerMediaProps {
  filePath: string;
  isOnline: boolean;
  torrentHash?: string;
  mediaInfo?: PlayerMediaInfo;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioBtnRef: RefObject<HTMLDivElement | null>;
  savedStartTime: number;
  currentPlayheadRef: MutableRefObject<number>;
  durationRef: MutableRefObject<number>;
  hasStartedPlaybackRef: MutableRefObject<boolean>;
  retryCountRef: MutableRefObject<number>;
  setBaseTime: (t: number) => void;
  setVideoTime: (t: number) => void;
  setErrorMsg: (msg: string | null) => void;
  focusControl: (el: HTMLElement) => void;
  resetControlsTimer: () => void;
  retryPlayback: () => void;
  setShowAudioMenu: (b: boolean) => void;
}

export function usePlayerMedia({
  filePath, isOnline, torrentHash, mediaInfo, videoRef, audioBtnRef,
  savedStartTime, currentPlayheadRef, durationRef, hasStartedPlaybackRef,
  retryCountRef, setBaseTime, setVideoTime, setErrorMsg,
  focusControl, resetControlsTimer, retryPlayback, setShowAudioMenu,
}: UsePlayerMediaProps) {
  const actualFilePath = (() => {
    const match = filePath.match(/[?&]file=([^&]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
    return filePath.startsWith("http://") || filePath.startsWith("https://") ? null : filePath;
  })();

  const isOnlineOrProxied = isOnline || filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.includes("/api/stream?url=");
  const [duration, setDuration] = useState<number>(mediaInfo?.duration || 0);
  durationRef.current = duration;
  const [isDirectStream, setIsDirectStream] = useState<boolean>(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | undefined>(undefined);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [logoPath, setLogoPath] = useState<string | null>(() => mediaInfo?.logoPath || null);

  const getStreamUrl = useCallback((startTime: number = 0, track?: number, cacheBust: boolean = false) => {
    const isHttp = filePath.startsWith("http://") || filePath.startsWith("https://");
    let base = isHttp ? filePath : `${API_BASE}/stream?file=${encodeURIComponent(filePath)}`;
    base = base.replace(/([?&])start=\d+(&|$)/g, "$1").replace(/([?&])audio=\d+(&|$)/g, "$1").replace(/([?&])t=\d+(&|$)/g, "$1").replace(/[?&]$/, "");
    const separator = base.includes("?") ? "&" : "?";
    const params: string[] = [];
    if (!isHttp && isOnline) params.push("online=1");
    if (startTime > 0) params.push(`start=${Math.floor(startTime)}`);
    if (track !== undefined) params.push(`audio=${track}`);
    if (cacheBust) params.push(`t=${Date.now()}`);
    return params.length > 0 ? `${base}${separator}${params.join("&")}` : base;
  }, [filePath, isOnline]);

  const [streamUrl, setStreamUrl] = useState<string>(() => getStreamUrl(savedStartTime));

  const selectAudioTrack = useCallback((trackIndex: number) => {
    setSelectedAudio(trackIndex);
    if (audioBtnRef.current) focusControl(audioBtnRef.current);
    setShowAudioMenu(false);
    setErrorMsg(null);
    const cur = (isDirectStream && videoRef.current) ? videoRef.current.currentTime : currentPlayheadRef.current;
    setBaseTime(cur);
    setVideoTime(0);
    if (!isDirectStream) {
      try { videoRef.current?.pause(); } catch {}
      hasStartedPlaybackRef.current = false;
      retryCountRef.current = 0;
    }
    setStreamUrl(getStreamUrl(cur, trackIndex, true));
    resetControlsTimer();
    setTimeout(() => { if (audioBtnRef.current) focusControl(audioBtnRef.current); }, 50);
  }, [audioBtnRef, currentPlayheadRef, focusControl, getStreamUrl, hasStartedPlaybackRef, isDirectStream, resetControlsTimer, retryCountRef, setBaseTime, setErrorMsg, setShowAudioMenu, setVideoTime, videoRef]);

  useEffect(() => {
    let active = true;
    if (mediaInfo?.logoPath) { setLogoPath(mediaInfo.logoPath); return; }
    if (mediaInfo?.tmdbId) {
      fetchMovieLogo(mediaInfo.tmdbId, mediaInfo.mediaType || "movie").then((path) => {
        if (active && path) setLogoPath(path);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.logoPath]);

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
          if (data.duration && data.duration > 0) setDuration(data.duration);
          if (data.direct !== undefined) {
            const canBeDirect = !isOnlineOrProxied && !actualFilePath?.startsWith("http");
            setIsDirectStream(canBeDirect && Boolean(data.direct));
          }
          if (Array.isArray(data.audio_tracks) && data.audio_tracks.length > 0) {
            setAudioTracks(data.audio_tracks);
            if (selectedAudio === undefined) setSelectedAudio(data.audio_tracks[0].index);
          }
          if (Array.isArray(data.subtitle_tracks) && data.subtitle_tracks.length > 0) {
            setSubtitleTracks(data.subtitle_tracks);
          }
          const video = videoRef.current;
          if (data && (data.duration > 0 || data.vcodec) && video && (!hasStartedPlaybackRef.current || video.error)) {
            if (video.error) {
              setErrorMsg(null);
              retryCountRef.current = 0;
              retryPlayback();
            }
          }
          const isPendingProbe = isHttp && (!data.duration || data.duration <= 0 || data.status === "timeout");
          if (isPendingProbe && isHttp && retryCount < 8) {
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
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [actualFilePath, filePath]);

  useEffect(() => {
    return () => {
      rpcResumeAllDownloads().catch(() => {});
      try { fetch(`${API_BASE}/stream/stop`).catch(() => {}); } catch {}
      if (torrentHash) rpcDropStream(torrentHash).catch(() => {});
    };
  }, [torrentHash]);

  return {
    actualFilePath, duration, setDuration, isDirectStream, setIsDirectStream,
    audioTracks, setAudioTracks, selectedAudio, setSelectedAudio, selectAudioTrack,
    subtitleTracks, setSubtitleTracks, logoPath, streamUrl, setStreamUrl, getStreamUrl,
  };
}
