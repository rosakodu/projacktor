import { FC, RefObject, memo } from "react";
import { FaVolumeUp, FaVolumeMute, FaSearchMinus, FaSearchPlus } from "react-icons/fa";
import { PlayerMediaInfo } from "../../types";
import { PlayerSplash } from "./PlayerSplash";

export interface TorrentStatusInfo {
  stat?: number;
  stat_string?: string;
  connected_seeders?: number;
  active_peers?: number;
  total_peers?: number;
  download_speed?: number;
  preloaded_bytes?: number;
  preloaded_pct?: number;
  loaded_size?: number;
  torrent_size?: number;
}

export interface PlayerHUDProps {
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
  torrentStatus?: TorrentStatusInfo | null;
}

export const PlayerHUD: FC<PlayerHUDProps> = memo(({
  volumeHudVisible, volume, zoomHudVisible, zoom,
  zoomHudBarRef, zoomHudTextRef, hasStartedPlayback,
  errorMsg, mediaInfo, logoPath, title, isOnline, torrentStatus,
}) => {
  return (
    <>
      {volumeHudVisible && (
        <div className="projacktor-volume-hud">
          {volume === 0 ? <FaVolumeMute style={{ color: "var(--ds-accent)", fontSize: 20 }} /> : <FaVolumeUp style={{ color: "var(--ds-accent)", fontSize: 20 }} />}
          <div className="projacktor-volume-bar-track">
            <div className="projacktor-volume-bar-fill" style={{ width: `${Math.round(volume * 100)}%` }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 38 }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {zoomHudVisible && (
        <div className="projacktor-zoom-hud">
          {zoom < 1.0 ? <FaSearchMinus style={{ color: "#a855f7", fontSize: 18 }} /> : zoom > 1.0 ? <FaSearchPlus style={{ color: "#38bdf8", fontSize: 18 }} /> : <FaSearchPlus style={{ color: "var(--ds-accent)", fontSize: 18 }} />}
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
          <span ref={zoomHudTextRef} style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "monospace", minWidth: 42 }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      <PlayerSplash
        hasStartedPlayback={hasStartedPlayback}
        errorMsg={errorMsg}
        mediaInfo={mediaInfo}
        logoPath={logoPath}
        title={title}
        isOnline={isOnline}
        torrentStatus={torrentStatus}
      />
    </>
  );
});
