import { FC, memo, RefObject } from "react";
import { Focusable, Spinner } from "@decky/ui";
import { TorrentItem, EpisodeItem, isTvRelease } from "../../../api";
import { useI18n } from "../../../i18n";
import { TorrentCard } from "./TorrentCard";

export interface TorrentListProps {
  torrentsRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  sortedTorrents: TorrentItem[];
  closeModal?: () => void;
  isTv: boolean;
  focusedTorrentId: string | null;
  expandedTorrentId: string | null;
  streamingTorrentId: string | null;
  downloadingTorrentId: string | null;
  episodesMap: Record<string, EpisodeItem[]>;
  loadingEpisodesMap: Record<string, boolean>;
  streamingEpIdx: number | null;
  downloadingEpIdx: number | null;
  onFocusCard: (tId: string) => void;
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
  handleTorrentFocus: (e: FocusEvent) => void;
  navigateToCard: (idx: number, t: "first" | "last") => boolean;
}

export const TorrentList: FC<TorrentListProps> = memo(({
  torrentsRef, loading, sortedTorrents, closeModal, isTv,
  focusedTorrentId, expandedTorrentId, streamingTorrentId, downloadingTorrentId,
  episodesMap, loadingEpisodesMap, streamingEpIdx, downloadingEpIdx,
  onFocusCard, onToggleEpisodes, onWatchOnlineMovie, onDownloadTorrent,
  onDownloadMagicBlack, onWatchEpisode, onDownloadEpisode, onDownloadEpisodeMagicBlack,
  onRetryEpisodes, handleCardGamepad, handleEpisodeGamepad, handleTorrentFocus, navigateToCard,
}) => {
  const { t } = useI18n();

  return (
    <div ref={torrentsRef} onFocusCapture={handleTorrentFocus as any} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: "2px 6px" }}>
      {loading ? (
        <Focusable
          noFocusRing
          className="projacktor-torrents-loading-box"
          tabIndex={0}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, gap: 8, outline: "none" }}
        >
          <Spinner />
          <span style={{ fontSize: 12, opacity: 0.6 }}>{t("searchingTorrents")}</span>
        </Focusable>
      ) : sortedTorrents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 16px", color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: "1.4", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{t("noTorrentsYet")}</div>
            <div style={{ color: "rgba(255, 255, 255, 0.6)" }}>{t("noTorrentsDesc")}</div>
          </div>
          {closeModal && (
            <Focusable className="ds-btn ds-btn--primary" onClick={closeModal} onActivate={closeModal} style={{ padding: "6px 20px", fontSize: 12 }}>
              {t("close")}
            </Focusable>
          )}
        </div>
      ) : (
        <Focusable flow-children="column" noFocusRing className="projacktor-torrents-list">
          {sortedTorrents.map((tor, idx) => {
            const tId = tor.id || tor.magnet;
            return (
              <TorrentCard
                key={tId || `${tor.tracker}-${idx}`}
                torrent={tor}
                idx={idx}
                isFocused={focusedTorrentId === tId}
                isTorTv={isTv || isTvRelease(tor.title)}
                isExpanded={expandedTorrentId === tId}
                isCurrentStream={streamingTorrentId === tId}
                isCurrentDl={downloadingTorrentId === tId}
                episodes={episodesMap[tId] || []}
                isEpLoading={!!loadingEpisodesMap[tId]}
                streamingEpIdx={streamingEpIdx}
                downloadingEpIdx={downloadingEpIdx}
                sortedTorrentsCount={sortedTorrents.length}
                onFocus={onFocusCard}
                onToggleEpisodes={onToggleEpisodes}
                onWatchOnlineMovie={onWatchOnlineMovie}
                onDownloadTorrent={onDownloadTorrent}
                onDownloadMagicBlack={onDownloadMagicBlack}
                onWatchEpisode={onWatchEpisode}
                onDownloadEpisode={onDownloadEpisode}
                onDownloadEpisodeMagicBlack={onDownloadEpisodeMagicBlack}
                onRetryEpisodes={onRetryEpisodes}
                handleCardGamepad={handleCardGamepad}
                handleEpisodeGamepad={handleEpisodeGamepad}
                navigateToCard={navigateToCard}
              />
            );
          })}
        </Focusable>
      )}
    </div>
  );
});
