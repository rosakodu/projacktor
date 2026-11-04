import { FC, memo } from "react";

export interface PlayerSubtitleOverlayProps {
  selectedSubtitle: number | string | null;
  currentSubtitleText: string;
  hasStartedPlayback: boolean;
  showControls: boolean;
}

export const PlayerSubtitleOverlay: FC<PlayerSubtitleOverlayProps> = memo(({
  selectedSubtitle, currentSubtitleText, hasStartedPlayback, showControls,
}) => {
  if (selectedSubtitle === null || !currentSubtitleText || !hasStartedPlayback) {
    return null;
  }

  return (
    <div
      className="projacktor-subtitle-overlay"
      style={{
        bottom: showControls ? "clamp(90px, 12vh, 160px)" : "clamp(36px, 5vh, 75px)",
      }}
    >
      <span className="projacktor-subtitle-text">
        {currentSubtitleText}
      </span>
    </div>
  );
});
