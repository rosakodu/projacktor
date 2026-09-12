export interface MediaItem {
  id: number;
  title: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
  media_type?: "movie" | "tv";
  genre_ids?: number[];
}

export interface TorrentItem {
  id?: string;
  title: string;
  tracker: string;
  size: string;
  size_bytes?: number;
  seeds: number;
  peers: number;
  quality: string;
  voice: string;
  magnet: string;
}

export interface DownloadItem {
  id: number;
  media_id: number;
  aria2_gid: string;
  status: "queued" | "downloading" | "paused" | "completed" | "error";
  progress: number;
  download_speed: number;
  upload_speed: number;
  total_size: number;
  downloaded_size: number;
  download_dir: string;
  quality?: string;
  title?: string;
  year?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  media_type?: string;
}

export interface LibraryItem {
  id: number;
  tmdb_id?: number;
  title: string;
  year?: string;
  media_type?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  file_count?: number;
  total_file_size?: number;
  download_id?: number;
  download_status?: "in_library" | "queued" | "downloading" | "paused" | "completed" | "error";
  download_progress?: number;
  download_speed?: number;
  download_total_size?: number;
  download_downloaded_size?: number;
  aria2_gid?: string;
  effective_magnet?: string;
  effective_quality?: string;
  effective_torrent_title?: string;
  effective_download_dir?: string;
  files?: Array<{
    id: number;
    file_path: string;
    file_name: string;
    file_size: number;
    watched: number;
    watch_progress: number;
  }>;
}

export interface EpisodeItem {
  index: number;
  name: string;
  path: string;
  size: number;
  completed: number;
  selected: boolean;
  downloaded: boolean;
}

export interface WatchlistItem {
  id?: number;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  original_title?: string;
  year?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  created_at?: string;
}

export interface WatchHistoryItem {
  id: number;
  tmdb_id?: number;
  title: string;
  original_title?: string;
  media_type: "movie" | "tv";
  year?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  file_path?: string;
  stream_url?: string;
  torrent_hash?: string;
  is_online: number | boolean;
  is_downloaded?: boolean;
  episode_name?: string;
  season_number?: number;
  episode_number?: number;
  current_time: number;
  duration: number;
  progress: number;
  watched_at: string;
}

export interface PlayerMediaInfo {
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  mediaType?: "movie" | "tv";
  year?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
  episodeName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export type CatalogCategory = "movie" | "tv" | "cartoon" | "anime";

export type TabId =
  | "movies"
  | "tv"
  | "cartoons"
  | "anime"
  | "search"
  | "watchlist"
  | "history"
  | "library"
  | "settings";

export type SectorKey = "watching_today" | "trending_today" | "top_rated";

export interface SectorConfig {
  key: SectorKey;
  title: string;
}

