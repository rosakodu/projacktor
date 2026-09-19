import { FC, RefObject } from "react";
import { Focusable } from "@decky/ui";
import {
  FaPlay,
  FaPause,
  FaBackward,
  FaForward,
  FaUndo,
  FaClosedCaptioning,
  FaHeadphones,
} from "react-icons/fa";
import { AudioTrack, SubtitleTrack } from "./types";
import { TrackSelectionMenu } from "./TrackSelectionMenu";
import { useI18n } from "../../i18n";

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

interface PlayerControlsProps {
  showControls: boolean;
  isPlaying: boolean;
  currentPlayhead: number;
  duration: number;
  progressPercent: number;
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
  // Subtitle menu state
  showSubtitleMenu: boolean;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitle: number | string | null;
  activeSubMenuIdx: number;
  onToggleSubtitleMenu: () => void;
  onSelectSubtitle: (trackIndex: number | string | null) => void;
  onHoverSubItem: (idx: number) => void;
  // Audio menu state
  showAudioMenu: boolean;
  audioTracks: AudioTrack[];
  selectedAudio?: number;
  activeAudioMenuIdx: number;
  onToggleAudioMenu: () => void;
  onSelectAudio: (trackIndex: number) => void;
  onHoverAudioItem: (idx: number) => void;
  onChangeVolume?: (delta: number) => void;
}

export const PlayerControls: FC<PlayerControlsProps> = ({
  showControls,
  isPlaying,
  currentPlayhead,
  duration,
  progressPercent,
  isOnline,
  playBtnRef,
  subtitleBtnRef,
  audioBtnRef,
  subtitleMenuRef,
  audioMenuRef,
  onTogglePlay,
  onSeekRelative,
  onSeekTo,
  onProgressBarTouch,
  showSubtitleMenu,
  subtitleTracks,
  selectedSubtitle,
  activeSubMenuIdx,
  onToggleSubtitleMenu,
  onSelectSubtitle,
  onHoverSubItem,
  showAudioMenu,
  audioTracks,
  selectedAudio,
  activeAudioMenuIdx,
  onToggleAudioMenu,
  onSelectAudio,
  onHoverAudioItem,
  onChangeVolume,
}) => {
  const { t } = useI18n();
  const isAnyMenuOpen = showAudioMenu || showSubtitleMenu;

  // Общие стили для ряда кнопок
  const barStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    position: "relative",
    zIndex: 2,
  };

  // Содержимое ряда кнопок
  const buttonBarContent = (
    <>
      {/* Кнопка 1: Перемотка назад (-10с) */}
      <Focusable
        tabIndex={isAnyMenuOpen ? -1 : 0}
        noFocusRing={isAnyMenuOpen}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onActivate={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onSeekRelative(-10);
        }}
        onClick={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onSeekRelative(-10);
        }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={t("rewind10s")}
      >
        <FaBackward />
      </Focusable>

      {/* Кнопка 2: Пауза / Плей */}
      <Focusable
        ref={playBtnRef}
        tabIndex={isAnyMenuOpen ? -1 : 0}
        noFocusRing={isAnyMenuOpen}
        className="ds-btn ds-btn--primary ds-btn--compact ds-btn--icon"
        onActivate={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onTogglePlay();
        }}
        onClick={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onTogglePlay();
        }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={isPlaying ? t("pause") : t("play")}
      >
        {isPlaying ? <FaPause /> : <FaPlay />}
      </Focusable>

      {/* Кнопка 3: Перемотка вперед (+10с) */}
      <Focusable
        tabIndex={isAnyMenuOpen ? -1 : 0}
        noFocusRing={isAnyMenuOpen}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onActivate={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onSeekRelative(10);
        }}
        onClick={(e?: any) => {
          if (isAnyMenuOpen) return;
          e?.stopPropagation?.();
          onSeekRelative(10);
        }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={t("fastForward10s")}
      >
        <FaForward />
      </Focusable>

      {/* Кнопка 4: Начать сначала (если playhead > 30s) */}
      {currentPlayhead > 30 && (
        <Focusable
          tabIndex={isAnyMenuOpen ? -1 : 0}
          noFocusRing={isAnyMenuOpen}
          className="ds-btn ds-btn--compact ds-btn--icon"
          onActivate={(e?: any) => {
            if (isAnyMenuOpen) return;
            e?.stopPropagation?.();
            onSeekTo(0);
          }}
          onClick={(e?: any) => {
            if (isAnyMenuOpen) return;
            e?.stopPropagation?.();
            onSeekTo(0);
          }}
          onTouchStart={(e: any) => e?.stopPropagation?.()}
          style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
          title={t("restart")}
        >
          <FaUndo style={{ fontSize: 11 }} />
        </Focusable>
      )}

      {/* Кнопка 5: Выбор субтитров */}
      <Focusable
        ref={subtitleBtnRef}
        tabIndex={isAnyMenuOpen ? -1 : 0}
        noFocusRing={isAnyMenuOpen}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onActivate={(e?: any) => {
          e?.stopPropagation?.();
          onToggleSubtitleMenu();
        }}
        onClick={(e?: any) => {
          e?.stopPropagation?.();
          onToggleSubtitleMenu();
        }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        title={t("selectSubtitles")}
        style={{
          marginLeft: "auto",
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

      {/* Кнопка 6: Выбор аудиодорожки */}
      <Focusable
        ref={audioBtnRef}
        tabIndex={isAnyMenuOpen ? -1 : 0}
        noFocusRing={isAnyMenuOpen}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onActivate={(e?: any) => {
          e?.stopPropagation?.();
          onToggleAudioMenu();
        }}
        onClick={(e?: any) => {
          e?.stopPropagation?.();
          onToggleAudioMenu();
        }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        title={t("selectAudio")}
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
    </>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        background: "linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 70%, transparent 100%)",
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? "auto" : "none",
        transition: "opacity 0.3s ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Timeline Progress Bar */}
      <div
        onClick={onProgressBarTouch}
        onTouchStart={onProgressBarTouch}
        style={{
          padding: "12px 24px 6px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            height: 8,
            background: "rgba(255,255,255,0.2)",
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
      <div
        className="projacktor-player-controls-container"
        style={{
          position: "relative",
          width: "100%",
          padding: "4px 24px 16px",
          boxSizing: "border-box",
        }}
      >
        {/* По центру: Время (не перехватывает клики и фокус) */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(255, 255, 255, 0.9)",
            fontFamily: "monospace",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          {formatTime(currentPlayhead)} / {duration > 0 ? formatTime(duration) : (isOnline ? t("onlineBadge") : "--:--")}
        </div>

        <Focusable
          flow-children="horizontal"
          className="projacktor-player-controls-bar"
          noFocusRing={isAnyMenuOpen}
          onGamepadDirection={(evt: any) => {
            if (isAnyMenuOpen) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              return false;
            }
            const btn = evt?.detail?.button;
            if (btn === 9 || btn === 4 || btn === 20) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              onChangeVolume?.(0.05);
              return false;
            }
            if (btn === 10 || btn === 6 || btn === 21) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              onChangeVolume?.(-0.05);
              return false;
            }
            return undefined;
          }}
          style={barStyle}
        >
          {buttonBarContent}
        </Focusable>

        {/* Выпадающее меню субтитров */}
        {showSubtitleMenu && (
          <TrackSelectionMenu
            type="subtitle"
            menuRef={subtitleMenuRef}
            activeIdx={activeSubMenuIdx}
            onHoverItem={onHoverSubItem}
            onClose={onToggleSubtitleMenu}
            subtitleTracks={subtitleTracks}
            selectedSubtitle={selectedSubtitle}
            onSelectSubtitle={onSelectSubtitle}
          />
        )}

        {/* Выпадающее меню звуковых дорожек */}
        {showAudioMenu && (
          <TrackSelectionMenu
            type="audio"
            menuRef={audioMenuRef}
            activeIdx={activeAudioMenuIdx}
            onHoverItem={onHoverAudioItem}
            onClose={onToggleAudioMenu}
            audioTracks={audioTracks}
            selectedAudio={selectedAudio}
            onSelectAudio={onSelectAudio}
          />
        )}
      </div>
    </div>
  );
};
