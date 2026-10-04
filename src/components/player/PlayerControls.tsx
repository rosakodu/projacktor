import { FC, RefObject, useCallback, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import {
  FaPlay,
  FaPause,
  FaBackward,
  FaForward,
  FaStepForward,
  FaUndo,
  FaClosedCaptioning,
  FaHeadphones,
} from "react-icons/fa";
import { AudioTrack, SubtitleTrack } from "./types";
import { TrackSelectionMenu } from "./TrackSelectionMenu";
import { useI18n } from "../../i18n";
import { getActiveDocument } from "../../runtime/activeDoc";

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
  hasNextEpisode?: boolean;
  onPlayNextEpisode?: () => void;
  onBtnFocus?: (el: HTMLElement) => void;
}

export const PlayerControls: FC<PlayerControlsProps> = ({
  showControls,
  isPlaying,
  currentPlayhead,
  duration,
  progressPercent,
  bufferedPercent = 0,
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
  hasNextEpisode,
  onPlayNextEpisode,
  onBtnFocus,
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

  const isFocusDisabled = !showControls || isAnyMenuOpen;

  // Централизованная синхронизация фокуса для кнопок плеера:
  // При получении фокуса любой кнопкой убираем .gpfocus со всех остальных,
  // чтобы никогда не оставалось двух одновременно подсвеченных кнопок.
  const handleBtnFocus = useCallback((e: any) => {
    const current = e?.currentTarget as HTMLElement | null;
    if (!current) return;
    const doc = getActiveDocument(current) || document;
    doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
      if (el !== current) {
        el.classList.remove("gpfocus");
      }
    });
    current.classList.add("gpfocus");
    onBtnFocus?.(current);
  }, [onBtnFocus]);

  const handleBtnBlur = useCallback((e: any) => {
    const current = e?.currentTarget as HTMLElement | null;
    if (current) {
      current.classList.remove("gpfocus");
    }
  }, []);

  const barContainerRef = useRef<HTMLDivElement>(null);

  // Нативные слушатели focusin/focusout на контейнере панели управления:
  // Гарантируют снятие .gpfocus при любом уходе фокуса с кнопки (включая навигацию геймпадом SteamOS)
  useEffect(() => {
    const bar = barContainerRef.current;
    if (!bar) return;
    const doc = getActiveDocument(bar) || document;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.classList?.contains("ds-btn") || target.getAttribute?.("tabindex") === "0") {
        doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
          if (el !== target) el.classList.remove("gpfocus");
        });
        target.classList.add("gpfocus");
        onBtnFocus?.(target);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        target.classList.remove("gpfocus");
      }
    };

    bar.addEventListener("focusin", handleFocusIn);
    bar.addEventListener("focusout", handleFocusOut);
    return () => {
      bar.removeEventListener("focusin", handleFocusIn);
      bar.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // Содержимое ряда кнопок
  const buttonBarContent = (
    <>
      {/* Кнопка 1: Перемотка назад (-10с) */}
      <Focusable
        tabIndex={isFocusDisabled ? -1 : 0}
        noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus}
        onBlur={handleBtnBlur}
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
        tabIndex={isFocusDisabled ? -1 : 0}
        noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--primary ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus}
        onBlur={handleBtnBlur}
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
        tabIndex={isFocusDisabled ? -1 : 0}
        noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus}
        onBlur={handleBtnBlur}
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

      {/* Кнопка: Следующая серия (если есть в плейлисте) */}
      {hasNextEpisode && onPlayNextEpisode && (
        <Focusable
          tabIndex={isFocusDisabled ? -1 : 0}
          noFocusRing={isFocusDisabled}
          className="ds-btn ds-btn--compact ds-btn--icon"
          onFocus={handleBtnFocus}
          onBlur={handleBtnBlur}
          onActivate={(e?: any) => {
            if (isAnyMenuOpen) return;
            e?.stopPropagation?.();
            onPlayNextEpisode();
          }}
          onClick={(e?: any) => {
            if (isAnyMenuOpen) return;
            e?.stopPropagation?.();
            onPlayNextEpisode();
          }}
          onTouchStart={(e: any) => e?.stopPropagation?.()}
          style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
          title={t("nextEpisode")}
        >
          <FaStepForward />
        </Focusable>
      )}

      {/* Кнопка 4: Начать сначала (если playhead > 30s) */}
      {currentPlayhead > 30 && (
        <Focusable
          tabIndex={isFocusDisabled ? -1 : 0}
          noFocusRing={isFocusDisabled}
          className="ds-btn ds-btn--compact ds-btn--icon"
          onFocus={handleBtnFocus}
          onBlur={handleBtnBlur}
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
        tabIndex={isFocusDisabled ? -1 : 0}
        noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus}
        onBlur={handleBtnBlur}
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
        tabIndex={isFocusDisabled ? -1 : 0}
        noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus}
        onBlur={handleBtnBlur}
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
        visibility: showControls ? "visible" : "hidden",
        pointerEvents: showControls ? "auto" : "none",
        transition: "opacity 0.3s ease, visibility 0.3s ease",
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
            overflow: "hidden",
          }}
        >
          {/* Буферная полоса кэширования (YouTube / Кинопоиск стиль) */}
          {bufferedPercent > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${Math.max(progressPercent, Math.min(100, bufferedPercent))}%`,
                background: "rgba(255, 255, 255, 0.4)",
                borderRadius: 0,
                transition: "width 0.25s ease",
                pointerEvents: "none",
              }}
            />
          )}
          {/* Текущая позиция воспроизведения */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${progressPercent}%`,
              background: "var(--ds-accent)",
              borderRadius: 0,
              transition: "width 0.15s ease",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div
        ref={barContainerRef}
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
          noFocusRing={isFocusDisabled}
          onFocusCapture={(e: any) => {
            const target = e?.target as HTMLElement | null;
            if (!target) return;
            const doc = getActiveDocument(target) || document;
            doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
              if (el !== target) el.classList.remove("gpfocus");
            });
            if (target.classList?.contains("ds-btn")) {
              target.classList.add("gpfocus");
              onBtnFocus?.(target);
            }
          }}
          onBlurCapture={(e: any) => {
            const target = e?.target as HTMLElement | null;
            if (target && target.classList?.contains("ds-btn")) {
              target.classList.remove("gpfocus");
            }
          }}
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
