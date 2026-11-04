import { FC, memo } from "react";

export interface PlayerHeaderBarProps {
  title: string;
  showControls: boolean;
  hasStartedPlayback: boolean;
}

export const PlayerHeaderBar: FC<PlayerHeaderBarProps> = memo(({
  title, showControls, hasStartedPlayback,
}) => {
  const visible = showControls && hasStartedPlayback;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        padding: "16px 24px 28px",
        background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%)",
        opacity: visible ? 1 : 0,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.3s ease, visibility 0.3s ease",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#ffffff",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </div>
    </div>
  );
});
