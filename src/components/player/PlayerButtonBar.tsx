import { FC, memo, RefObject, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaPause, FaBackward, FaForward, FaStepForward, FaUndo, FaClosedCaptioning, FaHeadphones } from "react-icons/fa";
import { useI18n } from "../../i18n";
import { getActiveDocument } from "../../runtime/activeDoc";

export interface PlayerButtonBarProps {
  isPlaying: boolean;
  currentPlayhead: number;
  isFocusDisabled: boolean;
  isAnyMenuOpen: boolean;
  playBtnRef: RefObject<HTMLDivElement | null>;
  subtitleBtnRef: RefObject<HTMLDivElement | null>;
  audioBtnRef: RefObject<HTMLDivElement | null>;
  showSubtitleMenu: boolean;
  selectedSubtitle: number | string | null;
  showAudioMenu: boolean;
  hasNextEpisode?: boolean;
  onTogglePlay: () => void;
  onSeekRelative: (sec: number) => void;
  onSeekTo: (sec: number) => void;
  onPlayNextEpisode?: () => void;
  onToggleSubtitleMenu: () => void;
  onToggleAudioMenu: () => void;
  onBtnFocus?: (el: HTMLElement) => void;
}

export const PlayerButtonBar: FC<PlayerButtonBarProps> = memo(({
  isPlaying, currentPlayhead, isFocusDisabled, isAnyMenuOpen,
  playBtnRef, subtitleBtnRef, audioBtnRef, showSubtitleMenu,
  selectedSubtitle, showAudioMenu, hasNextEpisode, onTogglePlay,
  onSeekRelative, onSeekTo, onPlayNextEpisode, onToggleSubtitleMenu,
  onToggleAudioMenu, onBtnFocus,
}) => {
  const { t } = useI18n();

  const handleBtnFocus = useCallback((e: any) => {
    const current = e?.currentTarget as HTMLElement | null;
    if (!current) return;
    const doc = getActiveDocument(current) || document;
    doc.querySelectorAll(".projacktor-player-fullscreen .gpfocus").forEach((el) => {
      if (el !== current) el.classList.remove("gpfocus");
    });
    current.classList.add("gpfocus");
    onBtnFocus?.(current);
  }, [onBtnFocus]);

  const handleBtnBlur = useCallback((e: any) => {
    (e?.currentTarget as HTMLElement | null)?.classList.remove("gpfocus");
  }, []);

  return (
    <>
      <Focusable
        tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus} onBlur={handleBtnBlur}
        onActivate={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekRelative(-10); }}
        onClick={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekRelative(-10); }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={t("rewind10s")}
      >
        <FaBackward />
      </Focusable>

      <Focusable
        ref={playBtnRef} tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--primary ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus} onBlur={handleBtnBlur}
        onActivate={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onTogglePlay(); }}
        onClick={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onTogglePlay(); }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={isPlaying ? t("pause") : t("play")}
      >
        {isPlaying ? <FaPause /> : <FaPlay />}
      </Focusable>

      <Focusable
        tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus} onBlur={handleBtnBlur}
        onActivate={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekRelative(10); }}
        onClick={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekRelative(10); }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
        title={t("fastForward10s")}
      >
        <FaForward />
      </Focusable>

      {hasNextEpisode && onPlayNextEpisode && (
        <Focusable
          tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
          className="ds-btn ds-btn--compact ds-btn--icon"
          onFocus={handleBtnFocus} onBlur={handleBtnBlur}
          onActivate={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onPlayNextEpisode(); }}
          onClick={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onPlayNextEpisode(); }}
          onTouchStart={(e: any) => e?.stopPropagation?.()}
          style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
          title={t("nextEpisode")}
        >
          <FaStepForward />
        </Focusable>
      )}

      {currentPlayhead > 30 && (
        <Focusable
          tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
          className="ds-btn ds-btn--compact ds-btn--icon"
          onFocus={handleBtnFocus} onBlur={handleBtnBlur}
          onActivate={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekTo(0); }}
          onClick={(e?: any) => { if (isAnyMenuOpen) return; e?.stopPropagation?.(); onSeekTo(0); }}
          onTouchStart={(e: any) => e?.stopPropagation?.()}
          style={{ width: 36, height: 32, opacity: isAnyMenuOpen ? 0.4 : 1 }}
          title={t("restart")}
        >
          <FaUndo style={{ fontSize: 11 }} />
        </Focusable>
      )}

      <Focusable
        ref={subtitleBtnRef} tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus} onBlur={handleBtnBlur}
        onActivate={(e?: any) => { e?.stopPropagation?.(); onToggleSubtitleMenu(); }}
        onClick={(e?: any) => { e?.stopPropagation?.(); onToggleSubtitleMenu(); }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        title={t("selectSubtitles")}
        style={{
          marginLeft: "auto", borderRadius: 0, width: 34, height: 32,
          background: showSubtitleMenu || selectedSubtitle !== null ? "var(--ds-surface-hi)" : "var(--ds-surface)",
          borderColor: showSubtitleMenu || selectedSubtitle !== null ? "rgba(255,255,255,0.4)" : "var(--ds-border)",
          color: selectedSubtitle !== null ? "var(--ds-accent)" : "#fff",
        }}
      >
        <FaClosedCaptioning style={{ fontSize: 14 }} />
      </Focusable>

      <Focusable
        ref={audioBtnRef} tabIndex={isFocusDisabled ? -1 : 0} noFocusRing={isFocusDisabled}
        className="ds-btn ds-btn--compact ds-btn--icon"
        onFocus={handleBtnFocus} onBlur={handleBtnBlur}
        onActivate={(e?: any) => { e?.stopPropagation?.(); onToggleAudioMenu(); }}
        onClick={(e?: any) => { e?.stopPropagation?.(); onToggleAudioMenu(); }}
        onTouchStart={(e: any) => e?.stopPropagation?.()}
        title={t("selectAudio")}
        style={{
          borderRadius: 0, width: 34, height: 32,
          background: showAudioMenu ? "var(--ds-surface-hi)" : "var(--ds-surface)",
          borderColor: showAudioMenu ? "rgba(255,255,255,0.4)" : "var(--ds-border)",
        }}
      >
        <FaHeadphones style={{ fontSize: 13 }} />
      </Focusable>
    </>
  );
});
