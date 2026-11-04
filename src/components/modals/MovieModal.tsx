import { FC, useRef } from "react";
import { ModalRoot, Focusable } from "@decky/ui";
import { PROJACKTOR_STYLES } from "../../styles";
import {
  MovieModalProps, MovieHero, TorrentSortBar, TorrentList,
  useMovieModalState, useEpisodeState, useMovieModalGamepad,
} from "./movie";

export const MovieModal: FC<MovieModalProps> = ({ movie, closeModal, onWatchOnline, onStartMagicBlack }) => {
  const torrentsRef = useRef<HTMLDivElement>(null);
  const isTv = movie.media_type === "tv";

  const state = useMovieModalState({ movie, closeModal, onWatchOnline, onStartMagicBlack });
  const episodes = useEpisodeState({
    movie, title: state.title, currentMediaInfo: state.currentMediaInfo,
    getOrCreateMediaId: state.getOrCreateMediaId, closeModal, onWatchOnline, onStartMagicBlack,
  });
  const gamepad = useMovieModalGamepad({
    torrentsRef, sortedTorrents: state.sortedTorrents, sortMode: state.sortMode,
    setSortMode: state.setSortMode, loading: state.loading, closeModal,
  });

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal} bAllowFullSize={false} bHideCloseIcon={true}>
      <Focusable className="projacktor-modal-root" style={{ margin: "auto", alignSelf: "center" }} onCancelButton={closeModal}>
        <style>{PROJACKTOR_STYLES}</style>
        <MovieHero
          movie={movie} title={state.title} year={state.year} ageRating={state.ageRating}
          rating={state.rating} inWatchlist={state.inWatchlist} watchlistLoading={state.watchlistLoading}
          onToggleWatchlist={state.handleToggleWatchlist} torrentsRef={torrentsRef}
          sortedTorrentsCount={state.sortedTorrents.length} focusEl={gamepad.focusEl}
          navigateDownToTorrents={gamepad.navigateDownToTorrents}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 120, overflow: "hidden", padding: "4px 12px 8px 12px" }}>
          <TorrentSortBar
            sortMode={state.sortMode} onSortChange={state.handleSortChange}
            onGamepadDirection={gamepad.handleSortPillGamepad} torrentsCount={state.sortedTorrents.length}
          />
          <TorrentList
            torrentsRef={torrentsRef} loading={state.loading} sortedTorrents={state.sortedTorrents}
            closeModal={closeModal} isTv={isTv} focusedTorrentId={state.focusedTorrentId}
            expandedTorrentId={episodes.expandedTorrentId} streamingTorrentId={state.streamingTorrentId}
            downloadingTorrentId={state.downloadingTorrentId} episodesMap={episodes.episodesMap}
            loadingEpisodesMap={episodes.loadingEpisodesMap} streamingEpIdx={episodes.streamingEpIdx}
            downloadingEpIdx={episodes.downloadingEpIdx} onFocusCard={state.setFocusedTorrentId}
            onToggleEpisodes={episodes.handleToggleEpisodes} onWatchOnlineMovie={state.handleWatchOnlineMovie}
            onDownloadTorrent={state.handleDownloadTorrent} onDownloadMagicBlack={state.handleDownloadWithMagicBlack}
            onWatchEpisode={episodes.handleWatchEpisodeOnline} onDownloadEpisode={episodes.handleDownloadEpisode}
            onDownloadEpisodeMagicBlack={episodes.handleDownloadEpisodeWithMagicBlack}
            onRetryEpisodes={episodes.fetchEpisodesForTorrent} handleCardGamepad={gamepad.handleCardGamepad}
            handleEpisodeGamepad={gamepad.handleEpisodeGamepad} handleTorrentFocus={gamepad.handleTorrentFocus}
            navigateToCard={gamepad.navigateToCard}
          />
        </div>
      </Focusable>
    </ModalRoot>
  );
};

export default MovieModal;
