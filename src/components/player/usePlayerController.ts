import { useRef } from "react";
import { PlayerModalProps } from "../PlayerModal";
import { usePlayerZoom } from "./usePlayerZoom";
import { usePlayerProgress } from "./usePlayerProgress";
import { usePlayerNavigation } from "./usePlayerNavigation";
import { usePlayerMedia } from "./usePlayerMedia";
import { usePlayerPlayback } from "./usePlayerPlayback";
import { usePlayerSeek } from "./usePlayerSeek";
import { usePlayerSubtitles } from "./usePlayerSubtitles";
import { useTorrentStatus } from "./useTorrentStatus";
import { usePlayerTouchGestures } from "./usePlayerTouchGestures";
import { usePlayerGamepad } from "../../hooks/usePlayerGamepad";

export function usePlayerController({
  filePath, title, isOnline = false, torrentHash, mediaInfo,
  initialTime, closeModal, playlist, onPlayNext,
}: PlayerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playBtnRef = useRef<HTMLDivElement>(null);
  const subtitleBtnRef = useRef<HTMLDivElement>(null);
  const audioBtnRef = useRef<HTMLDivElement>(null);
  const subtitleMenuRef = useRef<HTMLDivElement>(null);
  const audioMenuRef = useRef<HTMLDivElement>(null);
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  const durationRef = useRef<number>(mediaInfo?.duration || 0);
  const currentPlayheadRef = useRef<number>(0);
  const playbackRef = useRef<any>(null);

  const actualFilePath = (() => {
    const match = filePath.match(/[?&]file=([^&]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
    return filePath.startsWith("http://") || filePath.startsWith("https://") ? null : filePath;
  })();

  const currentPlaylistIndex = playlist && playlist.length > 0
    ? playlist.findIndex((p) => p.filePath === filePath || (actualFilePath && p.filePath === actualFilePath))
    : -1;
  const hasNextEpisode = playlist && currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.length - 1;

  const { savedStartTimeRef, saveProgressRef } = usePlayerProgress({
    filePath, actualFilePath, title, initialTime, mediaInfo, torrentHash, isOnline, duration: durationRef.current,
  });

  const zoomControls = usePlayerZoom(videoRef);
  const hasStartedPlaybackRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const selectedSubtitleRef = useRef<number | string | null>(null);

  const media = usePlayerMedia({
    filePath, isOnline, torrentHash, mediaInfo, videoRef, audioBtnRef,
    savedStartTime: savedStartTimeRef.current, currentPlayheadRef, durationRef,
    hasStartedPlaybackRef, retryCountRef,
    setBaseTime: (t) => playbackRef.current?.setBaseTime(t),
    setVideoTime: (t) => playbackRef.current?.setVideoTime(t),
    setErrorMsg: (m) => playbackRef.current?.setErrorMsg(m),
    focusControl: (el) => nav.focusControl(el),
    resetControlsTimer: () => nav.resetControlsTimer(),
    retryPlayback: () => playbackRef.current?.retryPlayback(),
    setShowAudioMenu: (b) => nav.setShowAudioMenu(b),
  });

  const nav = usePlayerNavigation({
    containerRef, videoRef, playBtnRef, subtitleMenuRef, audioMenuRef,
    isPlaying: () => !!(videoRef.current && !videoRef.current.paused),
    selectedSubtitle: selectedSubtitleRef,
    selectedAudio: media.selectedAudio,
    subtitleTracks: media.subtitleTracks, audioTracks: media.audioTracks,
  });

  const torrent = useTorrentStatus({
    isOnline, hasStartedPlaybackRef, filePath, torrentHash,
    onError: (m) => playbackRef.current?.setErrorMsg(m),
    setIsBuffering: (b) => playbackRef.current?.setIsBuffering(b),
  });

  const playback = usePlayerPlayback({
    filePath, actualFilePath, title, isOnline, isDirectStream: media.isDirectStream,
    savedStartTime: savedStartTimeRef.current, durationRef,
    hasStartedPlaybackRef, retryCountRef,
    saveProgress: saveProgressRef.current, videoRef, streamUrl: media.streamUrl,
    setStreamUrl: media.setStreamUrl, volume: nav.volume, torrentStatus: torrent.torrentStatus,
    zeroSeedersCountRef: torrent.zeroSeedersCountRef, onPlayNext, closeModal,
    resetControlsTimer: nav.resetControlsTimer,
  });
  playbackRef.current = playback;

  const seek = usePlayerSeek({
    isDirectStream: media.isDirectStream, videoRef, duration: media.duration,
    baseTime: playback.baseTime, videoTime: playback.videoTime, selectedAudio: media.selectedAudio,
    getStreamUrl: media.getStreamUrl, setBaseTime: playback.setBaseTime, setVideoTime: playback.setVideoTime,
    setBufferedPercent: playback.setBufferedPercent, setStreamUrl: media.setStreamUrl,
    setErrorMsg: playback.setErrorMsg, resetControlsTimer: nav.resetControlsTimer,
    hasStartedPlaybackRef, retryCountRef,
  });
  currentPlayheadRef.current = seek.currentPlayhead;

  const subs = usePlayerSubtitles({
    filePath, actualFilePath, subtitleTracks: media.subtitleTracks, isOnline,
    duration: media.duration, currentPlayhead: seek.currentPlayhead, videoRef,
    subtitleBtnRef, focusControl: nav.focusControl, resetControlsTimer: nav.resetControlsTimer,
    setShowSubtitleMenu: nav.setShowSubtitleMenu,
    selectedSubtitleRef,
  });

  const gestures = usePlayerTouchGestures({
    togglePlay: playback.togglePlay, seekRelative: seek.seekRelative,
    changeVolume: nav.changeVolume, resetControlsTimer: nav.resetControlsTimer,
  });

  const audioTracksRef = useRef(media.audioTracks);
  audioTracksRef.current = media.audioTracks;
  const subtitleTracksRef = useRef(media.subtitleTracks);
  subtitleTracksRef.current = media.subtitleTracks;

  usePlayerGamepad({
    containerRef, playBtnRef, subtitleBtnRef, audioBtnRef,
    showControlsRef: nav.showControlsRef, showAudioMenuRef: nav.showAudioMenuRef,
    showSubtitleMenuRef: nav.showSubtitleMenuRef, setShowAudioMenu: nav.setShowAudioMenu,
    setShowSubtitleMenu: nav.setShowSubtitleMenu, setShowControls: nav.setShowControls,
    closeModalRef, audioTracksRef, subtitleTracksRef,
    activeAudioMenuIdxRef: nav.activeAudioMenuIdxRef, activeSubMenuIdxRef: nav.activeSubMenuIdxRef,
    togglePlay: playback.togglePlay, toggleAudioMenu: nav.toggleAudioMenu,
    toggleSubtitleMenu: nav.toggleSubtitleMenu, selectAudioTrack: media.selectAudioTrack,
    selectSubtitleTrack: subs.selectSubtitleTrack, seekRelative: seek.seekRelative,
    commitPendingSeek: seek.commitPendingSeek, changeVolume: nav.changeVolume,
    resetControlsTimer: nav.resetControlsTimer, toggleControls: nav.toggleControls,
    restoreControlsFocus: nav.restoreControlsFocus, handleMenuDirection: nav.handleMenuDirection,
    zoom: zoomControls,
  });

  return {
    containerRef, videoRef, playBtnRef, subtitleBtnRef, audioBtnRef, subtitleMenuRef, audioMenuRef,
    zoomControls, media, nav, torrent, playback, seek, subs, gestures, hasNextEpisode,
  };
}
