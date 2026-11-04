import { FC, RefObject, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { AudioTrack, SubtitleTrack } from "./types";
import { TrackSelectionMenu } from "./TrackSelectionMenu";
import { getActiveDocument } from "../../runtime/activeDoc";
import { useI18n } from "../../i18n";
import { PlayerTimeline, formatTime } from "./PlayerTimeline";
import { PlayerButtonBar } from "./PlayerButtonBar";

export interface PlayerControlsProps {
  showControls: boolean;
  isPlaying: boolean;
  currentPlayhead: number;
  duration: number;
  progressPercent: number;
  bufferedPercent?: number;
  isOnline: boolean;
  playBtnRef: RefObject<HTMLDivElement | null>;
  subtitleBtnRef: RefObject<HTMLDivElement | null>;
  audioBtnRef: RefObject<HTMLDivElement | null>;
  subtitleMenuRef: RefObject<HTMLDivElement | null>;
  audioMenuRef: RefObject<HTMLDivElement | null>;
  onTogglePlay: () => void;
  onSeekRelative: (sec: number) => void;
  onSeekTo: (sec: number) => void;
  onProgressBarTouch: (e: any) => void;
  showSubtitleMenu: boolean;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitle: number | string | null;
  activeSubMenuIdx: number;
  onToggleSubtitleMenu: () => void;
  onSelectSubtitle: (trackIndex: number | string | null) => void;
  onHoverSubItem: (idx: number) => void;
  showAudioMenu: boolean;
  audioTracks: AudioTrack[];
  selectedAudio?: number;
  activeAudioMenuIdx: number;
  onToggleAudioMenu: () => void;
  onSelectAudio: (trackIndex: number) => void;
  onHoverAudioItem: (idx: number) => void;
  onChangeVolume?: (delta: number) => void;
  hasNextEpisode?: boolean;
  onPlayNextEpisode?: () => void;
  onBtnFocus?: (el: HTMLElement) => void;
}

export const PlayerControls: FC<PlayerControlsProps> = ({
  showControls, isPlaying, currentPlayhead, duration, progressPercent, bufferedPercent = 0,
  isOnline, playBtnRef, subtitleBtnRef, audioBtnRef, subtitleMenuRef, audioMenuRef,
  onTogglePlay, onSeekRelative, onSeekTo, onProgressBarTouch,
  showSubtitleMenu, subtitleTracks, selectedSubtitle, activeSubMenuIdx,
  onToggleSubtitleMenu, onSelectSubtitle, onHoverSubItem,
  showAudioMenu, audioTracks, selectedAudio, activeAudioMenuIdx,
  onToggleAudioMenu, onSelectAudio, onHoverAudioItem,
  onChangeVolume, hasNextEpisode, onPlayNextEpisode, onBtnFocus,
}) => {
  const { t } = useI18n();
  const isAnyMenuOpen = showAudioMenu || showSubtitleMenu;
  const isFocusDisabled = !showControls || isAnyMenuOpen;
  const barContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barContainerRef.current;
    if (!bar) return;
    const doc = getActiveDocument(bar) || document;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.classList?.contains("ds-btn") || target.getAttribute?.("tabindex") === "0")) {
        doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
          if (el !== target) el.classList.remove("gpfocus");
        });
        target.classList.add("gpfocus");
        onBtnFocus?.(target);
      }
    };
    const handleFocusOut = (e: FocusEvent) => {
      (e.target as HTMLElement | null)?.classList.remove("gpfocus");
    };
    bar.addEventListener("focusin", handleFocusIn);
    bar.addEventListener("focusout", handleFocusOut);
    return () => {
      bar.removeEventListener("focusin", handleFocusIn);
      bar.removeEventListener("focusout", handleFocusOut);
    };
  }, [onBtnFocus]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
        background: "linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 70%, transparent 100%)",
        opacity: showControls ? 1 : 0, visibility: showControls ? "visible" : "hidden",
        pointerEvents: showControls ? "auto" : "none", transition: "opacity 0.3s ease, visibility 0.3s ease",
        display: "flex", flexDirection: "column",
      }}
    >
      <PlayerTimeline
        currentPlayhead={currentPlayhead} duration={duration} progressPercent={progressPercent}
        bufferedPercent={bufferedPercent} isOnline={isOnline} onProgressBarTouch={onProgressBarTouch}
      />
      <div ref={barContainerRef} className="projacktor-player-controls-container" style={{ position: "relative", width: "100%", padding: "4px 24px 16px", boxSizing: "border-box" }}>
        <div
          style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            fontSize: 14, fontWeight: 500, color: "rgba(255, 255, 255, 0.9)", fontFamily: "monospace",
            pointerEvents: "none", whiteSpace: "nowrap", zIndex: 1,
          }}
        >
          {formatTime(currentPlayhead)} / {duration > 0 ? formatTime(duration) : (isOnline ? t("onlineBadge") : "--:--")}
        </div>
        <Focusable
          flow-children="row"
          className="projacktor-player-controls-bar"
          noFocusRing={isFocusDisabled}
          onGamepadDirection={(evt: any) => {
            if (isAnyMenuOpen) { evt?.preventDefault?.(); evt?.stopPropagation?.(); return false; }
            const btn = evt?.detail?.button;
            if (btn === 9 || btn === 4 || btn === 20) { evt?.preventDefault?.(); evt?.stopPropagation?.(); onChangeVolume?.(0.05); return false; }
            if (btn === 10 || btn === 6 || btn === 21) { evt?.preventDefault?.(); evt?.stopPropagation?.(); onChangeVolume?.(-0.05); return false; }
            return undefined;
          }}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", position: "relative", zIndex: 2 }}
        >
          <PlayerButtonBar
            isPlaying={isPlaying} currentPlayhead={currentPlayhead} isFocusDisabled={isFocusDisabled}
            isAnyMenuOpen={isAnyMenuOpen} playBtnRef={playBtnRef} subtitleBtnRef={subtitleBtnRef}
            audioBtnRef={audioBtnRef} showSubtitleMenu={showSubtitleMenu} selectedSubtitle={selectedSubtitle}
            showAudioMenu={showAudioMenu} hasNextEpisode={hasNextEpisode} onTogglePlay={onTogglePlay}
            onSeekRelative={onSeekRelative} onSeekTo={onSeekTo} onPlayNextEpisode={onPlayNextEpisode}
            onToggleSubtitleMenu={onToggleSubtitleMenu} onToggleAudioMenu={onToggleAudioMenu} onBtnFocus={onBtnFocus}
          />
        </Focusable>
        {showSubtitleMenu && (
          <TrackSelectionMenu
            type="subtitle" menuRef={subtitleMenuRef} activeIdx={activeSubMenuIdx}
            onHoverItem={onHoverSubItem} onClose={onToggleSubtitleMenu} subtitleTracks={subtitleTracks}
            selectedSubtitle={selectedSubtitle} onSelectSubtitle={onSelectSubtitle}
          />
        )}
        {showAudioMenu && (
          <TrackSelectionMenu
            type="audio" menuRef={audioMenuRef} activeIdx={activeAudioMenuIdx}
            onHoverItem={onHoverAudioItem} onClose={onToggleAudioMenu} audioTracks={audioTracks}
            selectedAudio={selectedAudio} onSelectAudio={onSelectAudio}
          />
        )}
      </div>
    </div>
  );
};
