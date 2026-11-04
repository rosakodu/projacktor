import { callable } from "@decky/api";
import {
  DownloadItem,
  LibraryItem,
  EpisodeItem,
  WatchlistItem,
  WatchHistoryItem,
} from "../types";
import { StorageDrive, DiskSpaceInfo } from "../services/types";

// ── Decky RPC Transport Layer (40+ callable methods) ───────────
export const rpcGetSteamLanguage = callable<[], string>("get_steam_language");
export const rpcGetWatchlist = callable<[], WatchlistItem[]>("get_watchlist");
export const rpcAddToWatchlist = callable<[string], { success: boolean; error?: string }>("add_to_watchlist");
export const rpcRemoveFromWatchlist = callable<[number], boolean>("remove_from_watchlist");
export const rpcIsInWatchlist = callable<[number], boolean>("is_in_watchlist");

export const rpcGetWatchHistory = callable<[], WatchHistoryItem[]>("get_watch_history");
export const rpcSaveWatchProgress = callable<[string], boolean>("save_watch_progress");
export const rpcStartHistoryDownload = callable<[number], { success: boolean; media_id?: number; error?: string }>("start_history_download");
export const rpcDeleteWatchHistoryItem = callable<[number], boolean>("delete_watch_history_item");
export const rpcClearWatchHistory = callable<[], boolean>("clear_watch_history");

export const rpcGetDownloads = callable<[], DownloadItem[]>("get_downloads");
export const rpcAddDownload = callable<[string], { success: boolean; id?: number; gid?: string }>("add_download");
export const rpcAddToLibrary = callable<[string], { success: boolean; id?: number; error?: string }>("add_to_library");
export const rpcStartDownload = callable<[number, string?], { success: boolean; gid?: string; error?: string }>("start_download");
export const rpcGetEpisodes = callable<[number], EpisodeItem[]>("get_episodes");
export const rpcGetTorrentEpisodes = callable<
  [magnet: string, title?: string, poster_path?: string],
  EpisodeItem[]
>("get_torrent_episodes");
export const rpcDownloadEpisode = callable<[number, number], { success: boolean; gid?: string; error?: string }>("download_episode");
export const rpcPauseEpisodeDownload = callable<[number, number], { success: boolean; error?: string }>("pause_episode_download");
export const rpcCancelEpisodeDownload = callable<[number, number], { success: boolean; error?: string }>("cancel_episode_download");
export const rpcDeleteEpisode = callable<[number, number], { success: boolean; error?: string }>("delete_episode");
export const rpcPrepareStream = callable<
  [mid: number, file_index?: number, force_online?: boolean, magnet?: string],
  {
    success: boolean;
    stream_url?: string;
    direct_stream_url?: string;
    torrent_hash?: string;
    file_path?: string;
    title?: string;
    transcode?: boolean;
    online?: boolean;
    duration?: number;
    error?: string;
  }
>("prepare_stream");
export const rpcGetTorrServerStatus = callable<[], { running: boolean; port: number }>("get_torrserver_status");
export const rpcDropStream = callable<[string], boolean>("drop_stream");
export const rpcPauseDownload = callable<[number], boolean>("pause_download");
export const rpcResumeDownload = callable<[number], boolean>("resume_download");
export const rpcResumeAllDownloads = callable<[], boolean>("resume_all_downloads");
export const rpcDeleteDownload = callable<[number], boolean>("delete_download");
export const rpcGetLibrary = callable<[], LibraryItem[]>("get_library");
export const rpcDeleteLibraryItem = callable<[number], boolean>("delete_library_item");
export const rpcRescanLibrary = callable<[], { success: boolean; restored_count: number; error?: string }>("rescan_library");
export const rpcPlayMedia = callable<[string], boolean>("play_media");
export const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
export const rpcSaveSettings = callable<[string], boolean>("save_settings");
export const rpcGetStatus = callable<[], Record<string, any>>("get_status");
export const rpcCheckJacred = callable<[string], boolean>("check_jacred");
export const rpcClearCache = callable<[], boolean>("clear_cache");
export const rpcGetDiskSpace = callable<[], DiskSpaceInfo>("get_disk_space");
export const rpcGetStorageDrives = callable<[], StorageDrive[]>("get_storage_drives");
export const rpcInhibitSleep = callable<[string?], { success: boolean; error?: string }>("inhibit_sleep");
export const rpcUninhibitSleep = callable<[string?], { success: boolean; error?: string }>("uninhibit_sleep");
export const rpcPingSleepInhibit = callable<[], { success: boolean }>("ping_sleep_inhibit");

// Re-export all domain services and types so existing UI imports remain 100% compatible
export * from "../services";
