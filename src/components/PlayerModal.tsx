import { FC } from "react";
import { Focusable } from "@decky/ui";
import { PlayerMediaInfo, PlaylistItem } from "../types";
import { AudioTrack, SubtitleTrack } from "./player/types";
import { PlayerHUD } from "./player/PlayerHUD";
import { PlayerControls } from "./player/PlayerControls";
import { PlayerHeaderBar } from "./player/PlayerHeaderBar";
import { PlayerErrorOverlay } from "./player/PlayerErrorOverlay";
import { PlayerSubtitleOverlay } from "./player/PlayerSubtitleOverlay";
import { usePlayerController } from "./player/usePlayerController";

export type { AudioTrack, SubtitleTrack };

export interface PlayerModalProps {
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

export const PlayerModal: FC<PlayerModalProps> = (props) => {
  const {
    containerRef, videoRef, playBtnRef, subtitleBtnRef, audioBtnRef,
    subtitleMenuRef, audioMenuRef, zoomControls, media, nav, torrent,
    playback, seek, subs, gestures, hasNextEpisode,
  } = usePlayerController(props);

  return (
    <Focusable
      ref={containerRef}
      className={`projacktor-player-fullscreen gpfocus${nav.showControls ? "" : " controls-hidden"}`}
      style={{
        position: "fixed", inset: 0, width: "100vw", height: "100vh",
        color: "#fff", background: "#000", overflow: "hidden",
        borderRadius: 0, zIndex: 2147483647, cursor: nav.showControls ? "default" : "none",
      }}
    >
      <PlayerHeaderBar showControls={nav.showControls} hasStartedPlayback={playback.hasStartedPlayback} title={props.title} />

      <div
        onTouchStart={gestures.handleVideoTouchStart} onTouchMove={gestures.handleVideoTouchMove}
        onTouchEnd={gestures.handleVideoTouchEnd} onClick={playback.togglePlay}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", zIndex: 1,
        }}
      >
        <PlayerHUD
          volumeHudVisible={nav.volumeHudVisible} volume={nav.volume}
          zoomHudVisible={zoomControls.zoomHudVisible} zoom={zoomControls.zoom}
          zoomHudBarRef={zoomControls.zoomHudBarRef} zoomHudTextRef={zoomControls.zoomHudTextRef}
          hasStartedPlayback={playback.hasStartedPlayback} isBuffering={playback.isBuffering}
          errorMsg={playback.errorMsg} mediaInfo={props.mediaInfo}
          logoPath={media.logoPath} title={props.title}
          isOnline={props.isOnline} torrentStatus={torrent.torrentStatus}
        />

        <video
          ref={videoRef} src={media.streamUrl} autoPlay preload="auto"
          muted={!playback.hasStartedPlayback} onError={playback.handleVideoError}
          style={{
            width: "100%", height: "100%", objectFit: "contain", outline: "none", pointerEvents: "none",
            transform: `scale(${zoomControls.zoom.toFixed(3)})`, transformOrigin: "center center", willChange: "transform",
          }}
        />

        <PlayerErrorOverlay
          errorMsg={playback.errorMsg}
          onRetry={() => {
            playback.setErrorMsg(null);
            playback.retryCountRef.current = 0;
            playback.setIsBuffering(true);
            playback.retryPlayback();
          }}
          onClose={props.closeModal}
        />

        <PlayerSubtitleOverlay
          selectedSubtitle={subs.selectedSubtitle} currentSubtitleText={subs.currentSubtitleText}
          hasStartedPlayback={playback.hasStartedPlayback} showControls={nav.showControls}
        />
      </div>

      <PlayerControls
        showControls={nav.showControls} resetControlsTimer={nav.resetControlsTimer} isPlaying={playback.isPlaying}
        currentPlayhead={seek.currentPlayhead} duration={media.duration}
        progressPercent={seek.progressPercent} bufferedPercent={playback.bufferedPercent}
        isOnline={!!props.isOnline} playBtnRef={playBtnRef}
        subtitleBtnRef={subtitleBtnRef} audioBtnRef={audioBtnRef}
        subtitleMenuRef={subtitleMenuRef} audioMenuRef={audioMenuRef}
        onTogglePlay={playback.togglePlay} onSeekRelative={seek.seekRelative}
        onSeekTo={seek.seekTo} onProgressBarTouch={seek.handleProgressBarTouch}
        showSubtitleMenu={nav.showSubtitleMenu} subtitleTracks={media.subtitleTracks}
        selectedSubtitle={subs.selectedSubtitle} activeSubMenuIdx={nav.activeSubMenuIdx}
        onToggleSubtitleMenu={nav.toggleSubtitleMenu} onSelectSubtitle={subs.selectSubtitleTrack}
        onHoverSubItem={(idx) => { nav.setActiveSubMenuIdx(idx); nav.activeSubMenuIdxRef.current = idx; }}
        showAudioMenu={nav.showAudioMenu} audioTracks={media.audioTracks}
        selectedAudio={media.selectedAudio} activeAudioMenuIdx={nav.activeAudioMenuIdx}
        onToggleAudioMenu={nav.toggleAudioMenu} onSelectAudio={media.selectAudioTrack}
        onHoverAudioItem={(idx) => { nav.setActiveAudioMenuIdx(idx); nav.activeAudioMenuIdxRef.current = idx; }}
        onChangeVolume={nav.changeVolume} hasNextEpisode={!!hasNextEpisode}
        onPlayNextEpisode={() => props.onPlayNext?.()} onBtnFocus={(el) => { nav.lastFocusedBtnRef.current = el; }}
      />
    </Focusable>
  );
};
