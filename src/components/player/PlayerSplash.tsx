import { FC, memo, useState, useEffect } from "react";
import { getBackdropUrl, getLogoUrl } from "../../api";
import { PlayerMediaInfo } from "../../types";
import { triggerHeartbeatHaptic } from "../../runtime/haptics";
import { TorrentStatusInfo } from "./PlayerHUD";

export interface PlayerSplashProps {
  hasStartedPlayback: boolean;
  errorMsg: string | null;
  mediaInfo?: PlayerMediaInfo;
  logoPath: string | null;
  title: string;
  isOnline?: boolean;
  torrentStatus?: TorrentStatusInfo | null;
}

export const PlayerSplash: FC<PlayerSplashProps> = memo(({
  hasStartedPlayback, errorMsg, mediaInfo, logoPath, title,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoRetry, setLogoRetry] = useState(0);
  const [splashMounted, setSplashMounted] = useState(!hasStartedPlayback);
  const [splashOpacity, setSplashOpacity] = useState(hasStartedPlayback ? 0 : 1);

  useEffect(() => {
    if (hasStartedPlayback) {
      setSplashOpacity(0);
      const timer = setTimeout(() => { setSplashMounted(false); }, 450);
      return () => clearTimeout(timer);
    }
    setSplashMounted(true);
    setSplashOpacity(1);
    return undefined;
  }, [hasStartedPlayback]);

  useEffect(() => {
    if (!splashMounted || splashOpacity === 0 || !!errorMsg) return undefined;
    let isCancelled = false;
    let secondaryTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleInterval: ReturnType<typeof setInterval> | null = null;

    const runHeartbeat = () => {
      if (isCancelled) return;
      triggerHeartbeatHaptic("primary");
      secondaryTimer = setTimeout(() => { if (!isCancelled) triggerHeartbeatHaptic("secondary"); }, 450);
    };

    const initialDelay = setTimeout(() => {
      if (isCancelled) return;
      runHeartbeat();
      cycleInterval = setInterval(runHeartbeat, 1600);
    }, 220);

    return () => {
      isCancelled = true;
      if (initialDelay) clearTimeout(initialDelay);
      if (secondaryTimer) clearTimeout(secondaryTimer);
      if (cycleInterval) clearInterval(cycleInterval);
    };
  }, [splashMounted, splashOpacity, errorMsg]);

  useEffect(() => { setLogoFailed(false); setLogoRetry(0); }, [logoPath]);

  const handleLogoError = () => {
    if (logoRetry < 3) setTimeout(() => { setLogoRetry((r) => r + 1); }, 1000);
    else setLogoFailed(true);
  };

  if (!splashMounted || errorMsg) return null;

  return (
    <div
      className="projacktor-player-splash"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#0a0d14", zIndex: 25, overflow: "hidden", pointerEvents: "none",
        opacity: splashOpacity, transition: "opacity 0.45s cubic-bezier(0.2, 0, 0, 1)", willChange: "opacity",
      }}
    >
      {mediaInfo?.backdropPath && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `url(${getBackdropUrl(mediaInfo.backdropPath)})`,
            backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.55)", zIndex: 1,
          }}
        />
      )}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(ellipse at center, rgba(10,13,20,0.3) 0%, rgba(10,13,20,0.85) 100%)", zIndex: 2,
        }}
      />
      {logoPath && !logoFailed ? (
        <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 30px", maxWidth: "85%" }}>
          <img
            key={`logo-${logoPath}-${logoRetry}`}
            className="projacktor-buffering-heartbeat"
            src={`${getLogoUrl(logoPath)}${logoRetry > 0 ? `&retry=${logoRetry}` : ""}`}
            alt={title}
            onError={handleLogoError}
            style={{
              maxWidth: 440, maxHeight: 170, width: "auto", height: "auto", objectFit: "contain",
              filter: "drop-shadow(0 0 18px rgba(255, 255, 255, 0.25)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.95)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8))",
              userSelect: "none",
            }}
          />
        </div>
      ) : (
        <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 52, height: 52, border: "4px solid rgba(255, 255, 255, 0.15)",
              borderTop: "4px solid var(--ds-accent)", borderRadius: "50%",
              animation: "projacktor-spin 0.9s linear infinite", boxShadow: "0 0 20px rgba(0, 0, 0, 0.5)",
            }}
          />
        </div>
      )}

      {/* Индикатор буферизации/загрузки: только минималистичный спиннер без текста о сидерах и скорости */}
    </div>
  );
});
