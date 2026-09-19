import { FC, RefObject, useState, useEffect } from "react";
import { FaVolumeUp, FaVolumeMute, FaSearchMinus, FaSearchPlus } from "react-icons/fa";
import { getBackdropUrl, getLogoUrl } from "../../api";
import { PlayerMediaInfo } from "../../types";
import { useI18n } from "../../i18n";

interface PlayerHUDProps {
  volumeHudVisible: boolean;
  volume: number;
  zoomHudVisible: boolean;
  zoom: number;
  zoomHudBarRef: RefObject<HTMLDivElement | null>;
  zoomHudTextRef: RefObject<HTMLSpanElement | null>;
  hasStartedPlayback: boolean;
  isBuffering: boolean;
  errorMsg: string | null;
  mediaInfo?: PlayerMediaInfo;
  logoPath: string | null;
  title: string;
  isOnline: boolean;
}

export const PlayerHUD: FC<PlayerHUDProps> = ({
  volumeHudVisible,
  volume,
  zoomHudVisible,
  zoom,
  zoomHudBarRef,
  zoomHudTextRef,
  hasStartedPlayback,
  isBuffering,
  errorMsg,
  mediaInfo,
  logoPath,
  title,
  isOnline,
}) => {
  const { t } = useI18n();
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => { setLogoFailed(false); }, [logoPath]);
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
      {!hasStartedPlayback && !errorMsg && (
        <div
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
            transition: "opacity 0.4s ease",
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

          {/* Контент: Только графический логотип TMDB по центру */}
          {logoPath && !logoFailed && (
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
                className="projacktor-buffering-heartbeat"
                src={getLogoUrl(logoPath)}
                alt={title}
                onError={() => setLogoFailed(true)}
                style={{
                  maxWidth: 420,
                  maxHeight: 160,
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  filter: "drop-shadow(0 8px 24px rgba(0, 0, 0, 0.95)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8))",
                  userSelect: "none",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* 2. Компактный спиннер повторной буферизации во время просмотра */}
      {isBuffering && hasStartedPlayback && !errorMsg && (
        <div
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
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: "4px solid rgba(255, 255, 255, 0.2)",
              borderTop: "4px solid var(--ds-accent)",
              borderRadius: "50%",
              animation: "projacktor-spin 0.9s linear infinite",
              marginBottom: 14,
            }}
          />
          <div style={{ color: "#fff", fontSize: 13.5, fontWeight: 500, letterSpacing: 0.3 }}>
            {isOnline ? t("bufferingStream") : t("loading")}
          </div>
        </div>
      )}
    </>
  );
};
