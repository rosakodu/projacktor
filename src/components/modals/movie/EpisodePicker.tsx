import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaDownload, FaSpinner, FaMoon } from "react-icons/fa";
import { TorrentItem, EpisodeItem, formatBytes } from "../../../api";
import { useI18n } from "../../../i18n";
import { isEvtUp, isEvtDown, isEvtLeft, isEvtRight } from "./gamepadHelpers";

export interface EpisodePickerProps {
  torrent: TorrentItem;
  episodes: EpisodeItem[];
  isEpLoading: boolean;
  streamingEpIdx: number | null;
  downloadingEpIdx: number | null;
  onWatchEpisode: (tor: TorrentItem, ep: EpisodeItem) => void;
  onDownloadEpisode: (tor: TorrentItem, ep: EpisodeItem) => void;
  onDownloadEpisodeMagicBlack: (tor: TorrentItem, ep: EpisodeItem) => void;
  onRetry: (tor: TorrentItem) => void;
  cardIdx: number;
  sortedTorrentsCount: number;
  onFocusCard: (tId: string) => void;
  navigateToCard: (idx: number, t: "first" | "last") => boolean;
  handleEpisodeGamepad: (cardIdx: number, epIdx: number, total: number, evt: any) => any;
}

export const EpisodePicker: FC<EpisodePickerProps> = memo(({
  torrent, episodes, isEpLoading, streamingEpIdx, downloadingEpIdx,
  onWatchEpisode, onDownloadEpisode, onDownloadEpisodeMagicBlack,
  onRetry, cardIdx, sortedTorrentsCount, onFocusCard,
  navigateToCard, handleEpisodeGamepad,
}) => {
  const { t } = useI18n();
  const tId = torrent.id || torrent.magnet;

  const handleRetryGamepad = (evt: any) => {
    if (isEvtUp(evt)) {
      try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
      navigateToCard(cardIdx, "first");
      return false;
    }
    if (isEvtDown(evt)) {
      try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
      if (cardIdx < sortedTorrentsCount - 1) navigateToCard(cardIdx + 1, "first");
      return false;
    }
    if (isEvtLeft(evt) || isEvtRight(evt)) {
      try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
      return false;
    }
    return undefined;
  };

  return (
    <div className="projacktor-torrent-episodes">
      {isEpLoading ? (
        <div style={{ padding: "8px 4px", fontSize: 11, color: "var(--ds-text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} />
          <span>{t("connectingSeedsLoadingEpisodes")}</span>
        </div>
      ) : episodes.length === 0 ? (
        <div style={{ padding: "8px 4px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {(torrent.seeds || 0) === 0 ? (
            <span style={{ color: "#ff7875" }}>{t("torrentNoSeeds")}</span>
          ) : (
            <>
              <span style={{ color: "var(--ds-text-dim)" }}>{t("failedToGetEpisodesTimeout")}</span>
              <Focusable
                className="ds-btn ds-btn--compact ds-btn--primary projacktor-torrent-retry-btn"
                noFocusRing
                tabIndex={0}
                onActivate={() => onRetry(torrent)}
                onClick={() => onRetry(torrent)}
                onFocus={() => onFocusCard(tId)}
                onMouseEnter={() => onFocusCard(tId)}
                onGamepadDirection={handleRetryGamepad}
                style={{ padding: "3px 12px", fontSize: 10, flexShrink: 0 }}
              >
                {t("retry")}
              </Focusable>
            </>
          )}
        </div>
      ) : (
        episodes.map((ep, epIdx) => {
          const isEpStreaming = streamingEpIdx === ep.index;
          const isEpDownloading = downloadingEpIdx === ep.index;
          return (
            <div key={ep.index} className="projacktor-torrent-ep-row">
              <div className="projacktor-torrent-ep-title" title={ep.name}>{ep.name}</div>
              <Focusable
                flow-children="row"
                noFocusRing
                style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                onGamepadDirection={(evt: any) => handleEpisodeGamepad(cardIdx, epIdx, episodes.length, evt)}
              >
                <span style={{ fontSize: 10, color: "var(--ds-text-dim)", marginRight: 2 }}>{formatBytes(ep.size)}</span>
                <Focusable
                  className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-icon-btn--primary"
                  noFocusRing
                  onActivate={() => onWatchEpisode(torrent, ep)}
                  onClick={() => onWatchEpisode(torrent, ep)}
                  title={t("watchEpisodeOnline")}
                >
                  {isEpStreaming ? <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} /> : <FaPlay style={{ fontSize: 9, marginLeft: 1 }} />}
                </Focusable>
                <Focusable
                  className="projacktor-icon-btn projacktor-icon-btn--compact"
                  noFocusRing
                  onActivate={() => onDownloadEpisode(torrent, ep)}
                  onClick={() => onDownloadEpisode(torrent, ep)}
                  title={t("downloadEpisode")}
                >
                  {isEpDownloading ? <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite" }} /> : <FaDownload style={{ fontSize: 9 }} />}
                </Focusable>
                <Focusable
                  className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-magicblack-btn"
                  noFocusRing
                  onActivate={() => onDownloadEpisodeMagicBlack(torrent, ep)}
                  onClick={() => onDownloadEpisodeMagicBlack(torrent, ep)}
                  title={t("downloadEpisodeMagicBlack")}
                >
                  <FaMoon style={{ fontSize: 9 }} />
                </Focusable>
              </Focusable>
            </div>
          );
        })
      )}
    </div>
  );
});
