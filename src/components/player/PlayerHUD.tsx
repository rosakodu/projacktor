import { FC, RefObject, useState, useEffect } from "react";
import { FaVolumeUp, FaVolumeMute, FaSearchMinus, FaSearchPlus } from "react-icons/fa";
import { getBackdropUrl, getLogoUrl } from "../../api";
import { PlayerMediaInfo } from "../../types";
import { triggerHeartbeatHaptic } from "../../runtime/haptics";

interface PlayerHUDProps {
  volumeHudVisible: boolean;
  volume: number;
  zoomHudVisible: boolean;
  zoom: number;
  zoomHudBarRef: RefObject<HTMLDivElement | null>;
  zoomHudTextRef: RefObject<HTMLSpanElement | null>;
  hasStartedPlayback: boolean;
  isBuffering?: boolean;
  errorMsg: string | null;
  mediaInfo?: PlayerMediaInfo;
  logoPath: string | null;
  title: string;
  isOnline?: boolean;
}

export const PlayerHUD: FC<PlayerHUDProps> = ({
  volumeHudVisible,
  volume,
  zoomHudVisible,
  zoom,
  zoomHudBarRef,
  zoomHudTextRef,
  hasStartedPlayback,
  errorMsg,
  mediaInfo,
  logoPath,
  title,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoRetry, setLogoRetry] = useState(0);

  const [splashMounted, setSplashMounted] = useState(!hasStartedPlayback);
  const [splashOpacity, setSplashOpacity] = useState(hasStartedPlayback ? 0 : 1);

  useEffect(() => {
    if (hasStartedPlayback) {
      setSplashOpacity(0);
      const timer = setTimeout(() => {
        setSplashMounted(false);
      }, 450);
      return () => clearTimeout(timer);
    } else {
      setSplashMounted(true);
      setSplashOpacity(1);
      return undefined;
    }
  }, [hasStartedPlayback]);

  useEffect(() => {
    setLogoFailed(false);
    setLogoRetry(0);
  }, [logoPath]);

  // Нежная тактильная вибрация в такт пульсирующему логотипу
  const isPulsingLogoVisible = splashMounted && splashOpacity > 0 && !errorMsg && !!logoPath && !logoFailed;

  useEffect(() => {
    if (!isPulsingLogoVisible) {
      return undefined;
    }

    let isCancelled = false;
    let secondaryTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleInterval: ReturnType<typeof setInterval> | null = null;

    const runHeartbeat = () => {
      if (isCancelled) return;
      triggerHeartbeatHaptic("primary");
      secondaryTimer = setTimeout(() => {
        if (!isCancelled) {
          triggerHeartbeatHaptic("secondary");
        }
      }, 450);
    };

    // Первый такт синхронизирован с пиком первого расширения логотипа (14% от 1.6s ≈ 224ms)
    const initialDelay = setTimeout(() => {
      if (isCancelled) return;
      runHeartbeat();
      cycleInterval = setInterval(runHeartbeat, 1600);
    }, 180);

    return () => {
      isCancelled = true;
      if (initialDelay) clearTimeout(initialDelay);
      if (secondaryTimer) clearTimeout(secondaryTimer);
      if (cycleInterval) clearInterval(cycleInterval);
    };
  }, [isPulsingLogoVisible]);

  const handleLogoError = () => {
    if (logoRetry < 3) {
      setTimeout(() => {
        setLogoRetry((r) => r + 1);
      }, 1000);
    } else {
      setLogoFailed(true);
    }
  };

  return (
    <>
      {/* HUD громкости (Справа) */}
      {volumeHudVisible && (
        <div className="projacktor-volume-hud">
          {volume === 0 ? (
            <FaVolumeMute style={{ color: "var(--ds-accent)", fontSize: 20 }} />
          ) : (
            <FaVolumeUp style={{ color: "var(--ds-accent)", fontSize: 20 }} />
          )}
          <div className="projacktor-volume-bar-track">
            <div className="projacktor-volume-bar-fill" style={{ width: `${Math.round(volume * 100)}%` }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 38 }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {/* HUD масштаба (Справа под громкостью) */}
      {zoomHudVisible && (
        <div className="projacktor-zoom-hud">
          {zoom < 1.0 ? (
            <FaSearchMinus style={{ color: "#a855f7", fontSize: 18 }} />
          ) : zoom > 1.0 ? (
            <FaSearchPlus style={{ color: "#38bdf8", fontSize: 18 }} />
          ) : (
            <FaSearchPlus style={{ color: "var(--ds-accent)", fontSize: 18 }} />
          )}
          <div className="projacktor-zoom-bar-track">
            <div
              ref={zoomHudBarRef}
              className="projacktor-zoom-bar-fill"
              style={{
                width: `${Math.round(((zoom - 0.5) / 2.5) * 100)}%`,
                background: zoom === 1.0 ? "var(--ds-accent)" : zoom > 1.0 ? "#38bdf8" : "#a855f7",
              }}
            />
          </div>
          <span
            ref={zoomHudTextRef}
            style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 42 }}
          >
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      {/* 1. Экран начальной загрузки и буферизации с официальным логотипом фильма с TMDB */}
      {splashMounted && !errorMsg && (
        <div
          className="projacktor-player-splash"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0d14",
            zIndex: 25,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: splashOpacity,
            transition: "opacity 0.45s cubic-bezier(0.2, 0, 0, 1)",
            willChange: "opacity",
          }}
        >
          {/* Фоновый четкий бэкдроп фильма с умеренным затемнением */}
          {mediaInfo?.backdropPath && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `url(${getBackdropUrl(mediaInfo.backdropPath)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "brightness(0.55)",
                zIndex: 1,
              }}
            />
          )}

          {/* Мягкий виньеточный радиальный градиент */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "radial-gradient(ellipse at center, rgba(10,13,20,0.3) 0%, rgba(10,13,20,0.85) 100%)",
              zIndex: 2,
            }}
          />

          {/* Контент: Только графический логотип TMDB с анимацией пульсации по центру */}
          {logoPath && !logoFailed ? (
            <div
              style={{
                position: "relative",
                zIndex: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 30px",
                maxWidth: "85%",
              }}
            >
              <img
                key={`logo-${logoPath}-${logoRetry}`}
                className="projacktor-buffering-heartbeat"
                src={`${getLogoUrl(logoPath)}${logoRetry > 0 ? `&retry=${logoRetry}` : ""}`}
                alt={title}
                onError={handleLogoError}
                style={{
                  maxWidth: 440,
                  maxHeight: 170,
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 0 18px rgba(255, 255, 255, 0.25)) drop-shadow(0 8px 24px rgba(0, 0, 0, 0.95)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8))",
                  userSelect: "none",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                position: "relative",
                zIndex: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  border: "4px solid rgba(255, 255, 255, 0.15)",
                  borderTop: "4px solid var(--ds-accent)",
                  borderRadius: "50%",
                  animation: "projacktor-spin 0.9s linear infinite",
                  boxShadow: "0 0 20px rgba(0, 0, 0, 0.5)",
                }}
              />
            </div>
          )}
        </div>
      )}

    </>
  );
};
