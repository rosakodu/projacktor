import { callable } from "@decky/api";
import {
  MediaItem,
  TorrentItem,
  DownloadItem,
  LibraryItem,
  EpisodeItem,
  CatalogCategory,
  WatchlistItem,
  WatchHistoryItem,
} from "../types";
import { API_BASE, formatBytes } from "./utils";
import { getCachedCatalog, setCachedCatalog } from "./cache";
import { getLocale } from "../i18n/state";

// ── RPC Functions ──────────────────────────────────────────────
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
export const rpcDownloadEpisode = callable<[number, number], { success: boolean; gid?: string; error?: string }>("download_episode");
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
export const rpcPlayMedia = callable<[string], boolean>("play_media");
export const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
export const rpcSaveSettings = callable<[string], boolean>("save_settings");
export const rpcGetStatus = callable<[], Record<string, any>>("get_status");
export const rpcCheckJacred = callable<[string], boolean>("check_jacred");
export const rpcClearCache = callable<[], boolean>("clear_cache");
export interface StorageDrive {
  id: string;
  name: string;
  path: string;
  total: number;
  used: number;
  free: number;
  is_removable: boolean;
  writable?: boolean;
}

export interface DiskSpaceInfo {
  total: number;
  used: number;
  free: number;
  path: string;
  drives: StorageDrive[];
}

export const rpcGetDiskSpace = callable<[], DiskSpaceInfo>("get_disk_space");
export const rpcGetStorageDrives = callable<[], StorageDrive[]>("get_storage_drives");
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
    const today = new Date().toISOString().split("T")[0];
    if (mediaType === "cartoon") {
      if (endpoint === "watching_today" || endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&primary_release_date.lte=${today}&vote_count.gte=10&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&primary_release_date.lte=${today}&vote_count.gte=50&sort_by=vote_count.desc&page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&vote_count.gte=200&sort_by=vote_average.desc&page=${page}`;
      } else {
        url = `${API_BASE}/tmdb/discover/movie?with_genres=16&primary_release_date.lte=${today}&vote_count.gte=10&sort_by=popularity.desc&page=${page}`;
      }
    } else if (mediaType === "anime") {
      if (endpoint === "watching_today" || endpoint === "trending_today") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&first_air_date.lte=${today}&vote_count.gte=10&sort_by=popularity.desc&page=${page}`;
      } else if (endpoint === "trending_week" || endpoint === "trending") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&first_air_date.lte=${today}&vote_count.gte=50&sort_by=vote_count.desc&page=${page}`;
      } else if (endpoint === "top_rated") {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&vote_count.gte=100&sort_by=vote_average.desc&page=${page}`;
      } else {
        url = `${API_BASE}/tmdb/discover/tv?with_genres=16&with_original_language=ja&first_air_date.lte=${today}&vote_count.gte=10&sort_by=popularity.desc&page=${page}`;
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

    const isEn = getLocale() === "en";
    const langParam = isEn ? "en-US" : "ru-RU";
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}language=${langParam}`;

    const res = await fetch(url);
    if (!res.ok) {
      return getCachedCatalog(endpoint, mediaType) || [];
    }
    const data = await res.json();
    const inferredType = mediaType === "cartoon" ? "movie" : mediaType === "anime" ? "tv" : mediaType;
    const items = (data.results || []).map((item: any) => ({
      ...item,
      title: item.title || item.name || (isEn ? "Untitled" : "Без названия"),
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
    const isEn = getLocale() === "en";
    const langParam = isEn ? "en-US" : "ru-RU";
    const res = await fetch(
      `${API_BASE}/tmdb/search/multi?query=${encodeURIComponent(query)}&language=${langParam}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((i: any) => i.media_type === "movie" || i.media_type === "tv")
      .map((item: any) => ({
        ...item,
        title: item.title || item.name || (isEn ? "Untitled" : "Без названия"),
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
    /\b\d+\s*[xX]\s*\d+\b/i,
    /(?:^|[^\p{L}\p{N}])(сезон|сезона|сезоны|сезонов|сери[яий]|серия|серии|серий|эпизод|эпизоды|мини[- ]?сериал|сериал)(?:$|[^\p{L}\p{N}])/iu,
    /\b\d+\s*из\s*\d+\b/i,
    /(?:\[|\()\s*(?!\d{4})\d{1,3}\s*[\s_-]+\s*(?!\d{4})\d{1,3}\s*(?:\]|\))/,
    /\[\s*(?:TV|ТВ|OVA|OAD|Special|Спешл)\b/i,
    /\b(?:s\d+|season\s*\d+)\b/i,
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
    if (isTargetMovie && isCollection(title) && !isCollection(targetTitle)) {
      return false;
    }
    if (isTargetMovie) {
      if (isUnwantedSequel(title, targetTitle) || (originalTitle && isUnwantedSequel(title, originalTitle))) {
        return false;
      }
    }
    if (isTargetTv) {
      const isExplicitSingleMovie = /\b(полнометражный\s*фильм|фильм\b|movie\b)\b/i.test(title) && !isTvRelease(title) && !isCollection(title);
      if (isExplicitSingleMovie) {
        return false;
      }
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
      }
    }

    return true;
  });
}

const hasCJK = (str: string) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(str);

export function parseQuality(title: string, existingQuality?: string): string {
  const t = (title || "").toLowerCase();
  const isTs = /\b(telesync|tsrip|hdts|hd-ts)\b|(?:\s|^|[\[\(/])ts(?:\s|$|[\]\)/])/i.test(t);
  const isCam = /\b(camrip|hdcam)\b|(?:\s|^|[\[\(/])cam(?:\s|$|[\]\)/])/i.test(t);
  const isTc = /\b(telecine)\b|(?:\s|^|[\[\(/])tc(?:\s|$|[\]\)/])/i.test(t);

  let res = "";
  if (t.includes("2160p") || t.includes("4k") || t.includes("uhd")) res = "4K";
  else if (t.includes("1080p") || t.includes("fhd")) res = "1080p";
  else if (t.includes("720p") || t.includes("hd")) res = "720p";

  if (isTs) return res ? `TS ${res}` : "TS";
  if (isCam) return res ? `CAM ${res}` : "CAM";
  if (isTc) return res ? `TC ${res}` : "TC";

  if (existingQuality && existingQuality.trim()) {
    const eq = existingQuality.trim();
    if (!eq.toLowerCase().startsWith("http")) {
      return eq;
    }
  }

  if (res) return res;
  if (t.includes("web-dl") || t.includes("webrip")) return "WEB-DL";
  if (t.includes("bdrip") || t.includes("bdremux") || t.includes("bluray")) return "BDRip";
  if (t.includes("hdrip")) return "HDRip";
  if (t.includes("dvd")) return "DVD";

  return "";
}

export async function searchTorrents(
  title: string,
  year?: string,
  mediaType: "movie" | "tv" = "movie",
  originalTitle?: string
): Promise<TorrentItem[]> {
  try {
    const cat = mediaType === "movie" ? "2000,5070" : "5000,5070";

    const fetchQ = async (q: string, category: string = cat): Promise<any[]> => {
      try {
        const catParam = category ? `&category=${category}` : "";
        const res = await fetch(`${API_BASE}/jacred/search?query=${encodeURIComponent(q)}${catParam}`);
        if (!res.ok) return [];
        return (await res.json()) || [];
      } catch {
        return [];
      }
    };

    const cleanTitle = title.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();

    const queries = new Set<string>();
    queries.add(cleanTitle);

    const hasOriginal = originalTitle && originalTitle.trim() && originalTitle.toLowerCase() !== cleanTitle.toLowerCase();
    let cleanOrig = "";
    if (hasOriginal && !hasCJK(originalTitle)) {
      cleanOrig = originalTitle.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();
      queries.add(cleanOrig);
    }

    if (year) {
      queries.add(`${cleanTitle} ${year}`);
      if (cleanOrig) {
        queries.add(`${cleanOrig} ${year}`);
      }
    }

    const colonIdx = cleanTitle.indexOf(":");
    if (colonIdx > 2) {
      const shortTitle = cleanTitle.substring(0, colonIdx).trim();
      if (shortTitle.length >= 3) {
        queries.add(shortTitle);
      }
    }

    const queryList = Array.from(queries).slice(0, 4);
    let rawCandidates: any[] = [];

    // Последовательный опрос с ранним выходом, чтобы избежать Cloudflare 429 Too Many Requests
    for (let i = 0; i < queryList.length; i++) {
      const q = queryList[i];
      try {
        const res = await fetchQ(q);
        if (Array.isArray(res) && res.length > 0) {
          rawCandidates.push(...res);
          // Если уже найдено достаточно раздач (>= 5), прекращаем нагружать сервер
          if (rawCandidates.length >= 8) {
            break;
          }
        }
      } catch (err) {
        // Одиночная ошибка запроса не должна ломать весь поиск
      }
      // Небольшая пауза между запросами для сглаживания нагрузки
      if (i < queryList.length - 1 && rawCandidates.length < 8) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (rawCandidates.length === 0 && queryList.length > 0) {
      try {
        const fallbackRes = await fetchQ(queryList[0], "");
        if (Array.isArray(fallbackRes)) {
          rawCandidates.push(...fallbackRes);
        }
      } catch {}
    }

    const filtered = filterTorrents(rawCandidates, cleanTitle, year, mediaType, originalTitle);

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
        quality: parseQuality(t.title || "", t.quality),
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

export async function fetchMovieLogo(
  tmdbId: number,
  mediaType: string = "movie"
): Promise<string | null> {
  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(
      `${API_BASE}/tmdb/${type}/${tmdbId}/images?include_image_language=ru,en,null`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const logos = data.logos || [];
    if (!logos.length) return null;

    // Приоритет языка логотипа в зависимости от выбранной локали
    const isEn = getLocale() === "en";
    const primaryLang = isEn ? "en" : "ru";
    const fallbackLang = isEn ? "ru" : "en";

    const pLogo = logos.find((l: any) => l.iso_639_1 === primaryLang);
    if (pLogo?.file_path) return pLogo.file_path;

    const fLogo = logos.find((l: any) => l.iso_639_1 === fallbackLang);
    if (fLogo?.file_path) return fLogo.file_path;

    // Логотип без языка или с наивысшим рейтингом
    logos.sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0));
    return logos[0]?.file_path || null;
  } catch {
    return null;
  }
}
