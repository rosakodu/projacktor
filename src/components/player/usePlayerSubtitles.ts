import { useState, useRef, useEffect, useCallback, RefObject, MutableRefObject } from "react";
import { API_BASE } from "../../api";
import { SubtitleCue, parseWebVTT, mergeCues } from "./vttParser";
import { SubtitleTrack } from "./types";

interface UsePlayerSubtitlesProps {
  filePath: string;
  actualFilePath: string | null;
  subtitleTracks: SubtitleTrack[];
  isOnline: boolean;
  duration: number;
  currentPlayhead: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  subtitleBtnRef: RefObject<HTMLDivElement | null>;
  focusControl: (el: HTMLElement) => void;
  resetControlsTimer: () => void;
  setShowSubtitleMenu: (b: boolean) => void;
  selectedSubtitleRef?: MutableRefObject<number | string | null>;
}

export function usePlayerSubtitles({
  filePath, actualFilePath, subtitleTracks, isOnline, duration, currentPlayhead,
  videoRef, subtitleBtnRef, focusControl, resetControlsTimer, setShowSubtitleMenu,
  selectedSubtitleRef,
}: UsePlayerSubtitlesProps) {
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | string | null>(null);
  const [parsedCues, setParsedCues] = useState<SubtitleCue[]>([]);
  const parsedCuesRef = useRef<SubtitleCue[]>([]);
  parsedCuesRef.current = parsedCues;
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>("");
  const currentSubtitleTextRef = useRef<string>("");
  const isFetchingMoreSubsRef = useRef(false);

  useEffect(() => {
    setSelectedSubtitle(null);
    if (selectedSubtitleRef) selectedSubtitleRef.current = null;
    setParsedCues([]);
    setCurrentSubtitleText("");
    currentSubtitleTextRef.current = "";
  }, [filePath, selectedSubtitleRef]);

  const selectSubtitleTrack = useCallback((trackIndex: number | string | null) => {
    setSelectedSubtitle(trackIndex);
    if (selectedSubtitleRef) selectedSubtitleRef.current = trackIndex;
    if (subtitleBtnRef.current) focusControl(subtitleBtnRef.current);
    setShowSubtitleMenu(false);
    resetControlsTimer();
    setTimeout(() => { if (subtitleBtnRef.current) focusControl(subtitleBtnRef.current); }, 50);
  }, [focusControl, resetControlsTimer, selectedSubtitleRef, setShowSubtitleMenu, subtitleBtnRef]);

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
    if (String(selectedSubtitle).startsWith("ext_") && !activeTrack) return;
    const subTarget = activeTrack?.url || actualFilePath || filePath;
    const isHttpSub = subTarget.startsWith("http://") || subTarget.startsWith("https://");
    const trackParam = activeTrack?.url ? "" : `&track=${selectedSubtitle}`;
    const startParam = (currentPlayhead > 15 && isOnline) ? `&start=${Math.max(0, Math.floor(currentPlayhead - 10))}` : "";
    const subUrl = `${API_BASE}/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

    let cancelled = false;
    let retryTimer: any = null;
    let pollCount = 0;

    const loadSubtitles = () => {
      if (cancelled) return;
      fetch(subUrl)
        .then((res) => { if (!res.ok) throw new Error(`${res.status}`); return res.text(); })
        .then((vtt) => {
          if (cancelled) return;
          const cues = parseWebVTT(vtt);
          if (cues.length > 0) setParsedCues((prev) => mergeCues(prev, cues));
          if (cues.length === 0 && pollCount < 4) { pollCount++; retryTimer = setTimeout(loadSubtitles, 4000); }
        })
        .catch(() => {
          if (!cancelled && pollCount < 3) { pollCount++; retryTimer = setTimeout(loadSubtitles, 4000); }
        });
    };
    loadSubtitles();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [selectedSubtitle, subtitleTracks, actualFilePath, filePath]);

  useEffect(() => {
    if (selectedSubtitle === null || parsedCues.length === 0 || !duration || duration <= 180) return;
    const lastCue = parsedCues[parsedCues.length - 1];
    if (!lastCue || lastCue.end >= duration - 60) return;

    if (currentPlayhead >= lastCue.end - 45 && !isFetchingMoreSubsRef.current) {
      isFetchingMoreSubsRef.current = true;
      const activeTrack = subtitleTracks.find((s) => String(s.index) === String(selectedSubtitle));
      const subTarget = activeTrack?.url || actualFilePath || filePath;
      const isHttpSub = subTarget.startsWith("http://") || subTarget.startsWith("https://");
      const trackParam = activeTrack?.url ? "" : `&track=${selectedSubtitle}`;
      const startParam = isOnline ? `&start=${Math.max(0, Math.floor(currentPlayhead - 10))}` : "";
      const subUrl = `${API_BASE}/stream/subtitles?${isHttpSub ? "url" : "file"}=${encodeURIComponent(subTarget)}${trackParam}${startParam}`;

      fetch(subUrl)
        .then((res) => (res.ok ? res.text() : ""))
        .then((vtt) => {
          if (vtt) {
            const nextCues = parseWebVTT(vtt);
            if (nextCues.length > 0) setParsedCues((prev) => mergeCues(prev, nextCues));
          }
        })
        .catch(() => {})
        .finally(() => { setTimeout(() => { isFetchingMoreSubsRef.current = false; }, 6000); });
    }
  }, [currentPlayhead, parsedCues, duration, selectedSubtitle, subtitleTracks, actualFilePath, filePath, isOnline]);

  useEffect(() => {
    if (parsedCues.length === 0 || selectedSubtitle === null) {
      if (currentSubtitleTextRef.current) {
        currentSubtitleTextRef.current = "";
        setCurrentSubtitleText("");
      }
      return;
    }
    const active = parsedCues.find((c) => currentPlayhead >= c.start && currentPlayhead <= c.end);
    const newText = active ? active.text : "";
    if (newText !== currentSubtitleTextRef.current) {
      currentSubtitleTextRef.current = newText;
      setCurrentSubtitleText(newText);
    }
  }, [currentPlayhead, parsedCues, selectedSubtitle]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const disableNative = () => {
      for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = "disabled";
    };
    disableNative();
    const t = setTimeout(disableNative, 200);
    return () => clearTimeout(t);
  }, [selectedSubtitle, videoRef]);

  return {
    selectedSubtitle, setSelectedSubtitle, selectSubtitleTrack,
    currentSubtitleText, parsedCuesRef, currentSubtitleTextRef,
  };
}
