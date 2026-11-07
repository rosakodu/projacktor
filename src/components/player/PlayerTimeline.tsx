import { FC, memo } from "react";

export interface PlayerTimelineProps {
  currentPlayhead?: number;
  duration?: number;
  progressPercent: number;
  bufferedPercent?: number;
  isOnline?: boolean;
  onProgressBarTouch: (e: any) => void;
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export const PlayerTimeline: FC<PlayerTimelineProps> = memo(({
  progressPercent, bufferedPercent = 0, onProgressBarTouch,
}) => {
  const safeProgress = Math.min(100, Math.max(0, progressPercent || 0));
  const safeBuffered = Math.min(100, Math.max(safeProgress, bufferedPercent || 0));

  return (
    <div
      onClick={onProgressBarTouch}
      onTouchStart={onProgressBarTouch}
      style={{ padding: "12px 24px 6px", cursor: "pointer" }}
    >
      <div style={{ height: 8, background: "rgba(255, 255, 255, 0.2)", cursor: "pointer", position: "relative", borderRadius: 0, overflow: "hidden" }}>
        {safeBuffered > 0 && (
          <div
            style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${safeBuffered}%`,
              background: "rgba(255, 255, 255, 0.45)", borderRadius: 0,
              zIndex: 1, transition: "width 0.25s ease", pointerEvents: "none",
            }}
          />
        )}
        <div
          style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${safeProgress}%`,
            background: "var(--ds-accent, #1a9fff)",
            borderRadius: 0, zIndex: 2, transition: "width 0.15s ease", pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
});
