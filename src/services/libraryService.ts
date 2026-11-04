import { callable } from "@decky/api";
import {
  LibraryItem,
  WatchlistItem,
  WatchHistoryItem,
  DownloadItem,
  EpisodeItem,
} from "../types";
import { API_BASE } from "../api/utils";

const rpcGetLib = callable<[], LibraryItem[]>("get_library");
const rpcDelLib = callable<[number], boolean>("delete_library_item");
const rpcRescanLib = callable<[], { success: boolean; restored_count: number; error?: string }>("rescan_library");
const rpcGetWatch = callable<[], WatchlistItem[]>("get_watchlist");
const rpcAddWatch = callable<[string], { success: boolean; error?: string }>("add_to_watchlist");
const rpcRemWatch = callable<[number], boolean>("remove_from_watchlist");
const rpcCheckWatch = callable<[number], boolean>("is_in_watchlist");
const rpcGetHist = callable<[], WatchHistoryItem[]>("get_watch_history");
const rpcSaveProg = callable<[string], boolean>("save_watch_progress");
const rpcDelHist = callable<[number], boolean>("delete_watch_history_item");
const rpcClearHist = callable<[], boolean>("clear_watch_history");
const rpcGetDown = callable<[], DownloadItem[]>("get_downloads");
const rpcGetEp = callable<[number], EpisodeItem[]>("get_episodes");

export async function getLibraryItemDetails(id: number): Promise<LibraryItem | null> {
  try {
    const res = await fetch(`${API_BASE}/library/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
  try {
    return (await rpcGetLib()) || [];
  } catch {
    return [];
  }
}

export async function deleteLibraryItem(id: number): Promise<boolean> {
  try {
    return await rpcDelLib(id);
  } catch {
    return false;
  }
}

export async function rescanLibrary(): Promise<{ success: boolean; restored_count: number; error?: string }> {
  try {
    return await rpcRescanLib();
  } catch (e: any) {
    return { success: false, restored_count: 0, error: String(e) };
  }
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  try {
    return (await rpcGetWatch()) || [];
  } catch {
    return [];
  }
}

export async function addToWatchlist(item: WatchlistItem): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpcAddWatch(JSON.stringify(item));
  } catch (e: any) {
    return { success: false, error: String(e) };
  }
}

export async function removeFromWatchlist(id: number): Promise<boolean> {
  try {
    return await rpcRemWatch(id);
  } catch {
    return false;
  }
}

export async function isInWatchlist(id: number): Promise<boolean> {
  try {
    return await rpcCheckWatch(id);
  } catch {
    return false;
  }
}

export async function fetchWatchHistory(): Promise<WatchHistoryItem[]> {
  try {
    return (await rpcGetHist()) || [];
  } catch {
    return [];
  }
}

export async function saveWatchProgress(progress: Record<string, any>): Promise<boolean> {
  try {
    return await rpcSaveProg(JSON.stringify(progress));
  } catch {
    return false;
  }
}

export async function deleteWatchHistoryItem(id: number): Promise<boolean> {
  try {
    return await rpcDelHist(id);
  } catch {
    return false;
  }
}

export async function clearWatchHistory(): Promise<boolean> {
  try {
    return await rpcClearHist();
  } catch {
    return false;
  }
}

export async function fetchDownloads(): Promise<DownloadItem[]> {
  try {
    return (await rpcGetDown()) || [];
  } catch {
    return [];
  }
}

export async function fetchEpisodes(mediaId: number): Promise<EpisodeItem[]> {
  try {
    return (await rpcGetEp(mediaId)) || [];
  } catch {
    return [];
  }
}
