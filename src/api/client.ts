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
import { API_BASE, formatBytes, isGhostCatalogItem } from "./utils";
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
    const fetchUrl = `${url}${separator}language=${langParam}`;

    const res = await fetch(fetchUrl);
    if (!res.ok) {
      return getCachedCatalog(endpoint, mediaType) || [];
    }
    const data = await res.json();
    let rawResults: any[] = data.results || [];

    // Строгий фильтр релизов-призраков (невышедшие, < 10 голосов, нелокализованные без перевода)
    let validResults = rawResults.filter((item: any) => !isGhostCatalogItem(item, today, isEn));

    // Если после фильтрации карточек осталось мало (< 15) и мы на 1-й странице, догружаем 2-ю страницу
    if (validResults.length < 15 && page === 1 && !fetchUrl.includes("page=2")) {
      try {
        const page2Url = fetchUrl.replace(/page=1\b/, "page=2");
        if (page2Url !== fetchUrl) {
          const res2 = await fetch(page2Url);
          if (res2.ok) {
            const data2 = await res2.json();
            const page2Valid = (data2.results || []).filter((item: any) => !isGhostCatalogItem(item, today, isEn));
            validResults.push(...page2Valid);
          }
        }
      } catch {}
    }

    const inferredType = mediaType === "cartoon" ? "movie" : mediaType === "anime" ? "tv" : mediaType;
    const items = validResults.map((item: any) => ({
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

export function isTvRelease(title: string): boolean {
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

export function isExecutableRelease(title: string, magnet?: string): boolean {
  if (!title && !magnet) return false;
  const text = `${title || ""} ${magnet || ""}`;

  // 1. Опасные исполняемые расширения файлов (.exe, .msi, .bat, .cmd, .scr, .pif, .vbs, .cpl, .com, .jar, .apk, .dmg, .pkg)
  const dangerousExts = /\.(exe|msi|scr|bat|cmd|pif|vbs|vbe|cpl|com|jar|apk|dmg|pkg)(?:$|[\s\?&"'\)\]_#])/i;
  if (dangerousExts.test(text)) {
    return true;
  }

  // 2. Изолированный тег или маркер [EXE] / (EXE) / .exe в релизе
  const exeTag = /(?:^|[\s.\[\(_-])exe(?:$|[\s.\]\)_-])/i;
  if (exeTag.test(title || "")) {
    return true;
  }

  // 3. Маркеры инсталляторов и кряков
  const malwareKeywords = /\b(setup|installer|crack|keygen|patch)\.exe\b/i;
  if (malwareKeywords.test(text)) {
    return true;
  }

  return false;
}

const UNSUPPORTED_MEDIA_REGEX =
  /(?:\.(rar|zip|7z|tar|gz|bz2|xz|iso|img)(?:$|[\s\?&"'\)\]_#])|\bpart\d+\.rar\b|(?:^|[\s.\[\(_-])(?:rar|zip|7z|iso)(?:$|[\s.\]\)_-])|\b(?:bdmv|dvd-?9|dvd-?5|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100|bd25|bd50|bd66|bd100)\b|(?:^|[\s.\[\(_-])(?:bdmv|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100)(?:$|[\s.\]\)_-])|(?:uhd\s*)?blu-?ray[\s._\-\(\[]*(?:full|complete|образ|disc|disk|диск)|dvd[\s._\-\(\[]*(?:disc|disk|диск)|(?:полный|образ)\s*диск[а]?)/iu;

export function isUnsupportedMediaRelease(title: string, magnet?: string): boolean {
  if (!title && !magnet) return false;
  const combined = `${title || ""} ${magnet || ""}`;
  if (UNSUPPORTED_MEDIA_REGEX.test(combined)) {
    return true;
  }
  const lower = combined.toLowerCase();
  if (lower.includes("blu-ray") || lower.includes("bluray")) {
    if (!/\b(remux|rip)\b/i.test(lower)) {
      if (/blu-?ray[\s._\-\(\[]*(?:\d+p|\d+i|cee|eur|rus|3d|custom)/i.test(lower)) {
        return true;
      }
    }
  }
  return false;
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

    if (isExecutableRelease(title, t.magnet)) {
      return false;
    }
    if (isUnsupportedMediaRelease(title, t.magnet)) {
      return false;
    }

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
          const isSeasonOne = /\b(s0?1\b|1\s*сезон|сезон\s*0?1|season\s*0?1|1[-_ ]?й\s*сезон)\b/i.test(title);
          const hasLaterSeason = /\b(s0?[2-9]\b|s[1-9]\d\b|[2-9]\s*сезон|сезон\s*[2-9]|season\s*[2-9])\b/i.test(title);

          if (isSeasonOne && !hasLaterSeason) {
            // Релиз 1-го сезона сериала: год обязан быть годом старта сериала (±1 год)
            const hasMatchingYear = years.some((y) => Math.abs(y - targetY) <= 1);
            if (!hasMatchingYear) return false;
          } else if (hasLaterSeason) {
            // Релиз последующих сезонов (S02+): год релиза не может быть раньше премьеры
            const hasValidTvYear = years.some((y) => y >= targetY - 1 && y <= targetY + 12);
            if (!hasValidTvYear) return false;
          } else {
            // Релиз без явного номера сезона: если разница лет велика, это чужой проект
            const hasMatchingYear = years.some((y) => Math.abs(y - targetY) <= 1);
            if (!hasMatchingYear) return false;
          }
        }
      }
    }

    // Дополнительная сверка с originalTitle при наличии латинской части в названии релиза
    if (originalTitle && originalTitle.trim() && !hasCJK(originalTitle)) {
      const cleanOrig = originalTitle.trim().toLowerCase();
      const slashParts = title.split("/").map((s: string) => s.trim());
      if (slashParts.length >= 2) {
        const latinPart = slashParts.find((p: string) => /^[a-zA-Z0-9\s:.'!?-]+$/.test(p) && !extractYears(p).length);
        if (latinPart) {
          const normPart = latinPart.toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9]/g, "");
          const normOrig = cleanOrig.replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9]/g, "");
          if (normPart.length >= 3 && normOrig.length >= 3) {
            // Если латинские названия не совпадают и не являются подстроками друг друга
            if (normPart !== normOrig && !normPart.startsWith(normOrig) && !normOrig.startsWith(normPart)) {
              return false;
            }
          }
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
  if (t.includes("2160p") || t.includes("4k") || t.includes("4к") || t.includes("uhd")) res = "4K";
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

const torrentSearchCache = new Map<string, { time: number; data: TorrentItem[] }>();
const TORRENT_CACHE_TTL = 10 * 60 * 1000; // 10 минут

export async function searchTorrents(
  title: string,
  year?: string,
  mediaType: "movie" | "tv" = "movie",
  originalTitle?: string
): Promise<TorrentItem[]> {
  try {
    const cleanTitle = title.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();
    const hasOriginal = originalTitle && originalTitle.trim() && originalTitle.toLowerCase() !== cleanTitle.toLowerCase();
    let cleanOrig = "";
    if (hasOriginal && !hasCJK(originalTitle)) {
      cleanOrig = originalTitle.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();
    }

    const cacheKey = `${cleanTitle}_${year || ""}_${mediaType}_${cleanOrig}`.toLowerCase();
    const cached = torrentSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.time < TORRENT_CACHE_TTL && cached.data.length > 0) {
      return cached.data;
    }

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

    let rawCandidates: any[] = [];

    // Этап 1: Быстрый параллельный опрос основного и оригинального названий (~300-400 мс)
    const stage1Queries = [cleanTitle];
    if (cleanOrig) {
      stage1Queries.push(cleanOrig);
    }

    const stage1Results = await Promise.allSettled(stage1Queries.map((q) => fetchQ(q)));
    for (const r of stage1Results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        rawCandidates.push(...r.value);
      }
    }

    // Этап 2: Если результатов мало (< 6) и указан год — опрашиваем запросы с годом
    if (rawCandidates.length < 6 && year) {
      const stage2Queries = [`${cleanTitle} ${year}`];
      if (cleanOrig) {
        stage2Queries.push(`${cleanOrig} ${year}`);
      }
      const stage2Results = await Promise.allSettled(stage2Queries.map((q) => fetchQ(q)));
      for (const r of stage2Results) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          rawCandidates.push(...r.value);
        }
      }
    }

    // Этап 3: Если раздач вообще не найдено — запасной опрос без фильтра категорий
    if (rawCandidates.length === 0) {
      try {
        const fallbackRes = await fetchQ(cleanTitle, "");
        if (Array.isArray(fallbackRes)) {
          rawCandidates.push(...fallbackRes);
        }
      } catch {}
    }

    const filtered = filterTorrents(rawCandidates, cleanTitle, year, mediaType, originalTitle);

    const seen = new Set<string>();
    const deduplicated: TorrentItem[] = [];

    for (const t of filtered) {
      if (isExecutableRelease(t.title, t.magnet)) continue;
      if (isUnsupportedMediaRelease(t.title, t.magnet)) continue;
      const sCount = Number(t.seeds ?? t.seeders ?? 0);
      if (sCount <= 0) continue;
      const key = t.magnet || t.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduplicated.push({
        ...t,
        seeds: sCount,
        peers: t.peers ?? 0,
        size: typeof t.size === "number" ? formatBytes(t.size) : t.size,
        quality: parseQuality(t.title || "", t.quality),
        pub_date: t.pub_date || t.PublishDate || t.pubdate || "",
      });
    }

    const targetY = year ? parseInt(year, 10) : NaN;

    const scoreTorrent = (t: any): number => {
      let score = 0;
      const title = t.title || "";
      const sCount = Number(t.seeds ?? t.seeders ?? 0);
      const years = extractYears(title);

      if (!isNaN(targetY)) {
        if (years.includes(targetY)) {
          score += 10000; // Точное совпадение года премьеры
        } else if (years.some((y) => Math.abs(y - targetY) <= 1)) {
          score += 6000;  // Год премьеры ± 1
        } else if (mediaType === "tv" && years.some((y) => y > targetY && y <= targetY + 6)) {
          score += 3000;  // Поздний сезон того же сериала
        } else if (years.length > 0) {
          score -= 10000; // Несовпадение года
        }
      }

      // Бонус за соответствие качества
      const q = parseQuality(title, t.quality);
      if (q.includes("1080p")) score += 500;
      else if (q.includes("4K")) score += 400;
      else if (q.includes("720p")) score += 200;

      // Штраф за экранки
      if (q.includes("CAM") || q.includes("TS")) score -= 3000;

      // Нормализованный бонус за сидеров (до 500 очков)
      score += Math.min(sCount, 100) * 5;

      return score;
    };

    deduplicated.sort((a, b) => scoreTorrent(b) - scoreTorrent(a));
    if (deduplicated.length > 0) {
      torrentSearchCache.set(cacheKey, { time: Date.now(), data: deduplicated });
    }
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
    const logos = (data.logos || []) as any[];
    if (!logos.length) return null;

    // Приоритет языка логотипа в зависимости от выбранной локали
    const isEn = getLocale() === "en";
    const primaryLang = isEn ? "en" : "ru";
    const fallbackLang = isEn ? "ru" : "en";

    // Функция оценки качества логотипа:
    // Предпочитает официальные высококачественные логотипы с положительными оценками и правильными пропорциями
    const scoreLogo = (logo: any) => {
      let score = 0;
      const va = logo.vote_average || 0;
      const vc = logo.vote_count || 0;
      score += va * 40;
      score += Math.min(vc, 10) * 10;

      const w = logo.width || 0;
      const h = logo.height || 0;
      if (w >= 1200) score += 20;
      else if (w >= 700) score += 15;
      else if (w >= 450) score += 10;
      else if (w < 400) score -= 40;

      if (h >= 180) score += 15;
      else if (h >= 90) score += 10;
      else if (h < 70) score -= 30;

      const ratio = logo.aspect_ratio || (h > 0 ? w / h : 3.0);
      if (ratio >= 2.0 && ratio <= 6.0) score += 20;
      else if (ratio < 1.3 || ratio > 8.5) score -= 30;

      return score;
    };

    const isAcceptable = (l: any) => {
      const w = l.width || 0;
      const h = l.height || 0;
      const ratio = l.aspect_ratio || (h > 0 ? w / h : 3.0);
      if (w < 400 || h < 70) return false;
      if (ratio < 1.2 || ratio > 9.5) return false;
      return true;
    };

    // 1. Ищем лучший логотип на основном языке (ru)
    const primaryLogos = logos.filter((l) => l.iso_639_1 === primaryLang && isAcceptable(l));
    if (primaryLogos.length > 0) {
      primaryLogos.sort((a, b) => scoreLogo(b) - scoreLogo(a));
      return primaryLogos[0].file_path;
    }

    // 2. Ищем лучший логотип на резервном языке (en)
    const fallbackLogos = logos.filter((l) => l.iso_639_1 === fallbackLang && isAcceptable(l));
    if (fallbackLogos.length > 0) {
      fallbackLogos.sort((a, b) => scoreLogo(b) - scoreLogo(a));
      return fallbackLogos[0].file_path;
    }

    // 3. Международные логотипы без языка
    const otherLogos = logos.filter(isAcceptable);
    if (otherLogos.length > 0) {
      otherLogos.sort((a, b) => scoreLogo(b) - scoreLogo(a));
      return otherLogos[0].file_path;
    }

    // Fallback на первый с наивысшим рейтингом
    logos.sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0));
    return logos[0]?.file_path || null;
  } catch {
    return null;
  }
}
