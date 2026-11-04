import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaDownload, FaList, FaSpinner, FaMoon } from "react-icons/fa";
import { TorrentItem, EpisodeItem } from "../../../api";
import { MarqueeTitle } from "../../MarqueeTitle";
import { useI18n } from "../../../i18n";
import { EpisodePicker } from "./EpisodePicker";

export interface TorrentCardProps {
  torrent: TorrentItem;
  idx: number;
  isFocused: boolean;
  isTorTv: boolean;
  isExpanded: boolean;
  isCurrentStream: boolean;
  isCurrentDl: boolean;
  episodes: EpisodeItem[];
  isEpLoading: boolean;
  streamingEpIdx: number | null;
  downloadingEpIdx: number | null;
  sortedTorrentsCount: number;
  onFocus: (tId: string) => void;
  onToggleEpisodes: (t: TorrentItem) => void;
  onWatchOnlineMovie: (t: TorrentItem) => void;
  onDownloadTorrent: (t: TorrentItem) => void;
  onDownloadMagicBlack: (t: TorrentItem) => void;
  onWatchEpisode: (t: TorrentItem, ep: EpisodeItem) => void;
  onDownloadEpisode: (t: TorrentItem, ep: EpisodeItem) => void;
  onDownloadEpisodeMagicBlack: (t: TorrentItem, ep: EpisodeItem) => void;
  onRetryEpisodes: (t: TorrentItem) => void;
  handleCardGamepad: (idx: number, isExpanded: boolean, epCount: number, evt: any) => any;
  handleEpisodeGamepad: (cardIdx: number, epIdx: number, total: number, evt: any) => any;
  navigateToCard: (idx: number, t: "first" | "last") => boolean;
}

export const TorrentCard: FC<TorrentCardProps> = memo(({
  torrent, idx, isFocused, isTorTv, isExpanded,
  isCurrentStream, isCurrentDl, episodes, isEpLoading,
  streamingEpIdx, downloadingEpIdx, sortedTorrentsCount,
  onFocus, onToggleEpisodes, onWatchOnlineMovie, onDownloadTorrent,
  onDownloadMagicBlack, onWatchEpisode, onDownloadEpisode,
  onDownloadEpisodeMagicBlack, onRetryEpisodes, handleCardGamepad,
  handleEpisodeGamepad, navigateToCard,
}) => {
  const { t } = useI18n();
  const tId = torrent.id || torrent.magnet;
  const primaryTracker = torrent.tracker ? torrent.tracker.split(",")[0].trim() : "";
  const isScreener = torrent.quality && (torrent.quality.startsWith("TS") || torrent.quality.startsWith("CAM") || torrent.quality.startsWith("TC"));

  return (
    <div
      className={`projacktor-torrent-card ${isFocused ? "projacktor-torrent-card--focused" : ""}`}
      onFocusCapture={() => onFocus(tId)}
      onMouseEnter={() => onFocus(tId)}
    >
      <div className="projacktor-torrent-header-row">
        <div className="projacktor-torrent-info">
          <MarqueeTitle title={torrent.title} isFocused={isFocused} />
          <div className="projacktor-torrent-meta">
            {torrent.quality && (
              <span className={`projacktor-badge-quality ${isScreener ? "projacktor-badge-quality--screener" : ""}`}>
                {torrent.quality}
              </span>
            )}
            {torrent.size && <span style={{ fontWeight: 600, color: "#fff" }}>{torrent.size}</span>}
            <span className="projacktor-torrent-seeds">↑ {torrent.seeds}</span>
            <span className="projacktor-torrent-peers">↓ {torrent.peers}</span>
            {primaryTracker && (
              <span style={{ opacity: 0.6, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {primaryTracker}
              </span>
            )}
          </div>
        </div>

        <Focusable
          flow-children="row"
          noFocusRing
          className="projacktor-torrent-actions"
          onGamepadDirection={(evt: any) => handleCardGamepad(idx, isTorTv && isExpanded, episodes.length, evt)}
        >
          {isTorTv ? (
            <Focusable
              className={`projacktor-icon-btn ${isExpanded ? "projacktor-icon-btn--primary" : ""}`}
              noFocusRing
              onActivate={() => onToggleEpisodes(torrent)}
              onClick={() => onToggleEpisodes(torrent)}
              title={isExpanded ? t("hideEpisodes") : t("selectEpisode")}
            >
              {isEpLoading ? <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} /> : <FaList />}
            </Focusable>
          ) : (
            <Focusable
              className="projacktor-icon-btn projacktor-icon-btn--primary"
              noFocusRing
              onActivate={() => onWatchOnlineMovie(torrent)}
              onClick={() => onWatchOnlineMovie(torrent)}
              title={t("watchOnline")}
            >
              {isCurrentStream ? <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} /> : <FaPlay style={{ marginLeft: 1 }} />}
            </Focusable>
          )}

          <Focusable
            className="projacktor-icon-btn"
            noFocusRing
            onActivate={() => onDownloadTorrent(torrent)}
            onClick={() => onDownloadTorrent(torrent)}
            title={t("download")}
          >
            {isCurrentDl ? <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} /> : <FaDownload />}
          </Focusable>

          <Focusable
            className="projacktor-icon-btn projacktor-magicblack-btn"
            noFocusRing
            onActivate={() => onDownloadMagicBlack(torrent)}
            onClick={() => onDownloadMagicBlack(torrent)}
            title={t("downloadSleepMagicBlack")}
          >
            <FaMoon style={{ fontSize: 11 }} />
          </Focusable>
        </Focusable>
      </div>

      {isTorTv && isExpanded && (
        <EpisodePicker
          torrent={torrent} episodes={episodes} isEpLoading={isEpLoading}
          streamingEpIdx={streamingEpIdx} downloadingEpIdx={downloadingEpIdx}
          onWatchEpisode={onWatchEpisode} onDownloadEpisode={onDownloadEpisode}
          onDownloadEpisodeMagicBlack={onDownloadEpisodeMagicBlack} onRetry={onRetryEpisodes}
          cardIdx={idx} sortedTorrentsCount={sortedTorrentsCount} onFocusCard={onFocus}
          navigateToCard={navigateToCard} handleEpisodeGamepad={handleEpisodeGamepad}
        />
      )}
    </div>
  );
});
