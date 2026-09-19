import { FC, RefObject } from "react";
import { Focusable } from "@decky/ui";
import { FaCheck } from "react-icons/fa";
import { AudioTrack, SubtitleTrack } from "./types";
import { useI18n } from "../../i18n";

interface TrackSelectionMenuProps {
  type: "subtitle" | "audio";
  menuRef: RefObject<HTMLDivElement | null>;
  activeIdx: number;
  onHoverItem: (idx: number) => void;
  onClose?: () => void;
  // Subtitle specific
  subtitleTracks?: SubtitleTrack[];
  selectedSubtitle?: number | string | null;
  onSelectSubtitle?: (trackIndex: number | string | null) => void;
  // Audio specific
  audioTracks?: AudioTrack[];
  selectedAudio?: number;
  onSelectAudio?: (trackIndex: number) => void;
}

export const TrackSelectionMenu: FC<TrackSelectionMenuProps> = ({
  type,
  menuRef,
  activeIdx,
  onHoverItem,
  onClose,
  subtitleTracks = [],
  selectedSubtitle,
  onSelectSubtitle,
  audioTracks = [],
  selectedAudio,
  onSelectAudio,
}) => {
  const { t } = useI18n();

  return (
    <Focusable
      ref={menuRef}
      flow-children="vertical"
      className="projacktor-player-dropdown-menu"
      onCancel={() => {
        onClose?.();
      }}
      onClick={(e: any) => e?.stopPropagation?.()}
      onTouchStart={(e: any) => e?.stopPropagation?.()}
      onTouchEnd={(e: any) => e?.stopPropagation?.()}
      style={{
        position: "absolute",
        bottom: "100%",
        right: type === "subtitle" ? 68 : 24,
        marginBottom: 8,
        background: "#121721",
        border: "1px solid rgba(255,255,255,0.2)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
        minWidth: 220,
        maxWidth: 340,
        maxHeight: "65vh",
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
      }}
    >
      {type === "subtitle" && (
        <>
          <div style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--ds-text-dim)", textTransform: "uppercase" }}>
            {t("subtitles")}
          </div>
          <Focusable
            className={`ds-btn ds-btn--compact ${activeIdx === 0 ? "gpfocus active-nav" : ""}`}
            data-selected={selectedSubtitle === null ? "true" : undefined}
            onActivate={(e?: any) => {
              e?.stopPropagation?.();
              onSelectSubtitle?.(null);
            }}
            onClick={(e: any) => {
              e?.stopPropagation?.();
              onSelectSubtitle?.(null);
            }}
            onMouseEnter={() => onHoverItem(0)}
            style={{
              justifyContent: "flex-start",
              width: "100%",
              height: 32,
              background: selectedSubtitle === null ? "var(--ds-surface-hi)" : "transparent",
              borderColor: selectedSubtitle === null ? "rgba(255,255,255,0.3)" : "transparent",
              gap: 8,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <FaCheck style={{ fontSize: 10, opacity: selectedSubtitle === null ? 1 : 0, flexShrink: 0 }} />
            <span style={{ fontSize: 12 }}>{t("disableSubtitles")}</span>
          </Focusable>

          {subtitleTracks.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {t("noSubtitlesFound")}
            </div>
          ) : (
            subtitleTracks.map((sub, sIdx) => {
              const itemIdx = sIdx + 1;
              const isNavActive = activeIdx === itemIdx;
              const isSelected = selectedSubtitle !== null && String(sub.index) === String(selectedSubtitle);
              const isSupported = sub.supported !== false;
              return (
                <Focusable
                  key={sub.index}
                  className={`ds-btn ds-btn--compact ${isNavActive ? "gpfocus active-nav" : ""}`}
                  data-selected={isSelected ? "true" : undefined}
                  onActivate={(e?: any) => {
                    e?.stopPropagation?.();
                    if (isSupported) {
                      onSelectSubtitle?.(sub.index);
                    }
                  }}
                  onClick={(e: any) => {
                    e?.stopPropagation?.();
                    if (isSupported) {
                      onSelectSubtitle?.(sub.index);
                    }
                  }}
                  onMouseEnter={() => onHoverItem(itemIdx)}
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    height: 32,
                    background: isSelected ? "var(--ds-surface-hi)" : "transparent",
                    borderColor: isSelected ? "rgba(255,255,255,0.3)" : "transparent",
                    gap: 8,
                    textAlign: "left",
                    cursor: isSupported ? "pointer" : "not-allowed",
                    opacity: isSupported ? 1 : 0.45,
                  }}
                >
                  <FaCheck style={{ fontSize: 10, opacity: isSelected ? 1 : 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sub.title || (sub.lang ? `${t("subtitles")} (${sub.lang.toUpperCase()})` : `${t("subtitlesNumber")}${sub.index}`)}
                    {!isSupported && (
                      <span style={{ fontSize: 10, color: "var(--ds-text-dim)", marginLeft: 6 }}>
                        ({t("unsupported")})
                      </span>
                    )}
                  </span>
                </Focusable>
              );
            })
          )}
        </>
      )}

      {type === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--ds-text-dim)", textTransform: "uppercase" }}>
            {t("audioTrack")}
          </div>
          {audioTracks.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {t("defaultTrack")}
            </div>
          ) : (
            audioTracks.map((track, tIdx) => {
              const isNavActive = activeIdx === tIdx;
              const isSelected = selectedAudio !== undefined && String(track.index) === String(selectedAudio);
              return (
                <Focusable
                  key={track.index}
                  className={`ds-btn ds-btn--compact ${isNavActive ? "gpfocus active-nav" : ""}`}
                  data-selected={isSelected ? "true" : undefined}
                  onActivate={(e?: any) => {
                    e?.stopPropagation?.();
                    onSelectAudio?.(track.index);
                  }}
                  onClick={(e: any) => {
                    e?.stopPropagation?.();
                    onSelectAudio?.(track.index);
                  }}
                  onMouseEnter={() => onHoverItem(tIdx)}
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    height: 32,
                    background: isSelected ? "var(--ds-surface-hi)" : "transparent",
                    borderColor: isSelected ? "rgba(255,255,255,0.3)" : "transparent",
                    gap: 8,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <FaCheck style={{ fontSize: 10, opacity: isSelected ? 1 : 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {track.title || (track.lang ? `${t("audioLang")} (${track.lang.toUpperCase()})` : `${t("trackNumber")}${track.index}`)}
                  </span>
                </Focusable>
              );
            })
          )}
        </div>
      )}
    </Focusable>
  );
};
