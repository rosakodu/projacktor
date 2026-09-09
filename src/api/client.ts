import { callable } from "@decky/api";
import {
  MediaItem,
  TorrentItem,
  DownloadItem,
  LibraryItem,
  EpisodeItem,
  CatalogCategory,
} from "../types";
import { API_BASE, formatBytes } from "./utils";
import { getCachedCatalog, setCachedCatalog } from "./cache";

// ── RPC Functions ──────────────────────────────────────────────
export const rpcGetDownloads = callable<[], DownloadItem[]>("get_downloads");
export const rpcAddDownload = callable<[string], { success: boolean; id?: number; gid?: string }>("add_download");
export const rpcAddToLibrary = callable<[string], { success: boolean; id?: number; error?: string }>("add_to_library");
export const rpcStartDownload = callable<[number, string?], { success: boolean; gid?: string; error?: string }>("start_download");
export const rpcGetEpisodes = callable<[number], EpisodeItem[]>("get_episodes");
export const rpcDownloadEpisode = callable<[number, number], { success: boolean; gid?: string; error?: string }>("download_episode");
export const rpcPrepareStream = callable<[number, number?], { success: boolean; file_path?: string; title?: string; transcode?: boolean; online?: boolean; error?: string }>("prepare_stream");
export const rpcPauseDownload = callable<[number], boolean>("pause_download");
export const rpcResumeDownload = callable<[number], boolean>("resume_download");
export const rpcDeleteDownload = callable<[number], boolean>("delete_download");
export const rpcGetLibrary = callable<[], LibraryItem[]>("get_library");
export const rpcDeleteLibraryItem = callable<[number], boolean>("delete_library_item");
export const rpcPlayMedia = callable<[string], boolean>("play_media");
export const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
export const rpcSaveSettings = callable<[string], boolean>("save_settings");
export const rpcGetStatus = callable<[], Record<string, any>>("get_status");
export const rpcCheckJacred = callable<[string], boolean>("check_jacred");
export const rpcClearCache = callable<[], boolean>("clear_cache");
export const rpcInhibitSleep = callable<[], { success: boolean; error?: string }>("inhibit_sleep");
export const rpcUninhibitSleep = callable<[], { success: boolean; error?: string }>("uninhibit_sleep");

// ── Catalog Fetcher ────────────────────────────────────────────
export async function fetchCatalog(
  endpoint: string,
  mediaType: CatalogCategory = "movie",
  page: number = 1
): Promise<MediaItem[]> {
  try {
    let url = "";
    if (mediaType === "cartoon") {
      if (endpoint === "watching_today") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&sort_by=revenue.desc&page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&vote_count.gte=200&sort_by=vote_average.desc&page=${page}`;
      }
    } else if (mediaType === "anime") {
      if (endpoint === "watching_today") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_count.desc&page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&vote_count.gte=100&sort_by=vote_average.desc&page=${page}`;
      }
    } else if (mediaType === "tv") {
      if (endpoint === "watching_today") {
        url = `${API_BASE}/tmdb/tv/airing_today?page=${page}`;
      } else if (endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/trending/tv/day?page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/trending/tv/week?page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/tv/top_rated?page=${page}`;
      } else if (endpoint === "popular") {
        url = `${API_BASE}/tmdb/tv/popular?page=${page}`;
      }
    } else {
      // movie
      if (endpoint === "watching_today") {
        url = `${API_BASE}/tmdb/movie/now_playing?page=${page}`;
      } else if (endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/trending/movie/day?page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/trending/movie/week?page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/movie/top_rated?page=${page}`;
      } else if (endpoint === "popular") {
        url = `${API_BASE}/tmdb/movie/popular?page=${page}`;
      }
    }

    if (!url) return [];

    const res = await fetch(url);
    if (!res.ok) {
      return getCachedCatalog(endpoint, mediaType) || [];
    }
    const data = await res.json();
    const inferredType = mediaType === "cartoon" ? "movie" : mediaType === "anime" ? "tv" : mediaType;
    const items = (data.results || []).map((item: any) => ({
      ...item,
      title: item.title || item.name || "Без названия",
      release_date: item.release_date || item.first_air_date || "",
      media_type: item.media_type || inferredType,
    }));
    if (items.length > 0) {
      setCachedCatalog(endpoint, mediaType, items);
    }
    return items;
  } catch {
    return getCachedCatalog(endpoint, mediaType) || [];
  }
}

// ── Search Catalog ─────────────────────────────────────────────
export async function searchCatalog(query: string): Promise<MediaItem[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`${API_BASE}/tmdb/search/multi?query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((i: any) => i.media_type === "movie" || i.media_type === "tv")
      .map((item: any) => ({
        ...item,
        title: item.title || item.name || "Без названия",
        release_date: item.release_date || item.first_air_date || "",
      }));
  } catch {
    return [];
  }
}

// ── Torrent Search & Filtering Helpers ─────────────────────────
function extractYears(title: string): number[] {
  const cleaned = title.replace(/\b(1080[pi]?|2160[pi]?|720[pi]?|1920|1440[pi]?)\b/gi, "");
  const matches = cleaned.match(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g);
  return matches ? matches.map(Number) : [];
}

function isTvRelease(title: string): boolean {
  const tvPatterns = [
    /\b[sS]\d+/i,
    /(?:^|[^\p{L}\p{N}])(сезон|сезона|сезоны|сезонов|сери[яий]|серия|серии|серий|эпизод|эпизоды|мини[- ]?сериал|сериал)(?:$|[^\p{L}\p{N}])/iu,
    /\b\d+\s*из\s*\d+\b/i,
  ];
  return tvPatterns.some((p) => p.test(title));
}

function isCollection(title: string): boolean {
  return /(?:^|[^\p{L}\p{N}])(коллекция|трилогия|квадрология|антология|collection|anthology|trilogy|quadrilogy)(?:$|[^\p{L}\p{N}])/iu.test(title);
}

function isUnwantedSequel(torrentTitle: string, targetTitle: string): boolean {
  if (!targetTitle) return false;
  const targetHasNumber = /(?:^|[^\p{L}\p{N}])(2|3|4|5|6|7|8|9|II|III|IV|V)(?:$|[^\p{L}\p{N}])/iu.test(targetTitle);
  if (targetHasNumber) return false;

  const escaped = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sequelRegex = new RegExp(
    "(?:^|[^\\p{L}\\p{N}])" + escaped + "\\s+(?:[2-9]|10|II|III|IV|VI?|VII|VIII)(?:$|[^\\p{L}\\p{N}])",
    "iu"
  );
  return sequelRegex.test(torrentTitle);
}

function filterTorrents(
  items: any[],
  targetTitle: string,
  targetYear?: string,
  mediaType: "movie" | "tv" = "movie",
  originalTitle?: string
): any[] {
  const targetY = targetYear ? parseInt(targetYear, 10) : NaN;
  const isTargetMovie = mediaType === "movie";
  const isTargetTv = mediaType === "tv";

  return items.filter((t) => {
    const title = t.title || "";

    if (isTargetMovie && isTvRelease(title)) {
      return false;
    }
    if (isTargetTv && !isTvRelease(title) && !isCollection(title)) {
      return false;
    }
    if (isTargetMovie && isCollection(title) && !isCollection(targetTitle)) {
      return false;
    }
    if (isUnwantedSequel(title, targetTitle) || (originalTitle && isUnwantedSequel(title, originalTitle))) {
      return false;
    }
    if (!isNaN(targetY)) {
      const years = extractYears(title);
      if (years.length > 0) {
        if (isTargetMovie) {
          const hasMatchingYear = years.some((y) => Math.abs(y - targetY) <= 1);
          if (!hasMatchingYear) return false;
        } else if (isTargetTv) {
          const hasValidTvYear = years.some((y) => y >= targetY - 1);
          if (!hasValidTvYear) return false;
        }
      } else {
        if (targetY >= 2025) return false;
      }
    }

    return true;
  });
}

export async function searchTorrents(
  title: string,
  year?: string,
  mediaType: "movie" | "tv" = "movie",
  originalTitle?: string
): Promise<TorrentItem[]> {
  try {
    const cat = mediaType === "movie" ? "2000" : "5000";

    const fetchQ = async (q: string): Promise<any[]> => {
      try {
        const res = await fetch(`${API_BASE}/jacred/search?query=${encodeURIComponent(q)}&category=${cat}`);
        if (!res.ok) return [];
        return (await res.json()) || [];
      } catch {
        return [];
      }
    };

    let rawCandidates: any[] = [];
    const primaryQuery = year ? `${title} ${year}` : title;
    const res1 = await fetchQ(primaryQuery);
    rawCandidates.push(...res1);

    if (rawCandidates.length < 5 && year) {
      const res2 = await fetchQ(title);
      rawCandidates.push(...res2);
    }

    if (rawCandidates.length < 5 && originalTitle && originalTitle.toLowerCase() !== title.toLowerCase()) {
      const origQuery = year ? `${originalTitle} ${year}` : originalTitle;
      const res3 = await fetchQ(origQuery);
      rawCandidates.push(...res3);
      if (rawCandidates.length < 5 && year) {
        const res4 = await fetchQ(originalTitle);
        rawCandidates.push(...res4);
      }
    }

    const filtered = filterTorrents(rawCandidates, title, year, mediaType, originalTitle);

    const seen = new Set<string>();
    const deduplicated: TorrentItem[] = [];

    for (const t of filtered) {
      const key = t.magnet || t.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduplicated.push({
        ...t,
        seeds: t.seeds ?? t.seeders ?? 0,
        peers: t.peers ?? 0,
        size: typeof t.size === "number" ? formatBytes(t.size) : t.size,
        quality: t.quality || "",
      });
    }

    deduplicated.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
    return deduplicated;
  } catch {
    return [];
  }
}

export async function getLibraryItemDetails(id: number): Promise<LibraryItem | null> {
  try {
    const res = await fetch(`${API_BASE}/library/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
