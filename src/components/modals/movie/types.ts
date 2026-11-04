import { RefObject } from "react";
import { MediaItem, PlayerMediaInfo } from "../../../api";

export type TorrentSortMode = "seeds" | "newest" | "oldest";

export interface MovieModalProps {
  movie: MediaItem;
  closeModal?: () => void;
  onWatchOnline?: (
    filePath: string,
    title: string,
    torrentHash?: string,
    isOnline?: boolean,
    mediaInfo?: PlayerMediaInfo
  ) => void;
  onStartMagicBlack?: () => void;
}

export interface MovieHeroProps {
  movie: MediaItem;
  title: string;
  year: string;
  ageRating: string | null;
  rating: string | null;
  inWatchlist: boolean;
  watchlistLoading: boolean;
  onToggleWatchlist: () => void;
  torrentsRef: RefObject<HTMLDivElement | null>;
  sortedTorrentsCount: number;
  focusEl: (el: HTMLElement) => void;
  navigateDownToTorrents: () => void;
}

export interface TorrentSortBarProps {
  sortMode: TorrentSortMode;
  onSortChange: (m: TorrentSortMode) => void;
  onGamepadDirection: (evt: any) => any;
  torrentsCount: number;
}
