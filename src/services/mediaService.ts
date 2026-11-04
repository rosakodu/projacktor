import { MediaItem, CatalogCategory } from "../types";
import { API_BASE, isGhostCatalogItem } from "../api/utils";
import { getCachedCatalog, setCachedCatalog } from "../api/cache";
import { getLocale } from "../i18n/state";
import { getUserSettings } from "../runtime/userSettings";

const ageRatingCache = new Map<string, string>();
const ageRatingPending = new Map<string, Promise<string | null>>();
const RATING_MAP: Record<string, string> = {
  "TV-MA": "18+", "NC-17": "18+", "R": "18+", "18": "18+", "TV-14": "16+", "PG-13": "16+", "15": "16+",
  "TV-PG": "12+", "PG": "6+", "12": "12+", "12A": "12+", "TV-G": "6+", "TV-Y7": "6+", "TV-Y": "0+", "G": "0+", "U": "0+",
};

export async function fetchAgeRating(id: number, mediaType?: "movie" | "tv"): Promise<string | null> {
  const isTv = mediaType === "tv";
  const cacheKey = `${isTv ? "tv" : "movie"}_${id}`;
  if (ageRatingCache.has(cacheKey)) return ageRatingCache.get(cacheKey) || null;
  if (ageRatingPending.has(cacheKey)) return ageRatingPending.get(cacheKey)!;

  const p = (async () => {
    try {
      const endpoint = isTv ? `tv/${id}/content_ratings` : `movie/${id}/release_dates`;
      const res = await fetch(`${API_BASE}/tmdb/${endpoint}`);
      if (!res.ok) return null;
      const results: any[] = (await res.json()).results || [];
      const getCert = (cc: string) => isTv
        ? results.find((r) => r.iso_3166_1 === cc && r.rating)?.rating
        : results.find((r) => r.iso_3166_1 === cc)?.release_dates?.find((d: any) => d.certification)?.certification;
      const raw = getCert("RU") || getCert("US") || getCert("GB");
      let found = raw ? (RATING_MAP[raw] || raw) : null;
      if (found) {
        if (/^\d+$/.test(found)) found = `${found}+`;
        ageRatingCache.set(cacheKey, found);
        return found;
      }
      return null;
    } catch {
      return null;
    } finally {
      ageRatingPending.delete(cacheKey);
    }
  })();
  ageRatingPending.set(cacheKey, p);
  return p;
}

function buildCatalogUrl(ep: string, cat: CatalogCategory, page: number, isKids: boolean, today: string): string {
  const kMC = isKids ? "&certification_country=US&certification.lte=PG&without_genres=27,10752" : "";
  const kTC = isKids ? "&certification_country=US&certification.lte=TV-PG&without_genres=27,10752,10767,10763" : "";
  if (cat === "home") {
    if (isKids) return `${API_BASE}/tmdb/discover/movie?sort_by=popularity.desc&page=${page}${kMC}`;
    if (ep === "watching_today") return `${API_BASE}/tmdb/trending/all/day?page=${page}`;
    if (ep.startsWith("trending")) return `${API_BASE}/tmdb/trending/all/week?page=${page}`;
    return ep === "top_rated" ? `${API_BASE}/tmdb/movie/top_rated?page=${page}` : `${API_BASE}/tmdb/trending/all/day?page=${page}`;
  }
  if (cat === "cartoon") {
    const cert = isKids ? "&certification_country=US&certification.lte=PG" : "";
    return `${API_BASE}/tmdb/discover/movie?with_genres=16${cert}&primary_release_date.lte=${today}&sort_by=${ep === "top_rated" ? "vote_average.desc" : "popularity.desc"}&page=${page}`;
  }
  if (cat === "anime") {
    const cert = isKids ? "&certification_country=US&certification.lte=TV-PG" : "";
    return `${API_BASE}/tmdb/discover/tv?with_genres=16${cert}&with_original_language=ja&first_air_date.lte=${today}&sort_by=${ep === "top_rated" ? "vote_average.desc" : "popularity.desc"}&page=${page}`;
  }
  if (cat === "tv") {
    if (isKids) return `${API_BASE}/tmdb/discover/tv?sort_by=${ep === "top_rated" ? "vote_average.desc" : "popularity.desc"}&page=${page}${kTC}`;
    const m: Record<string, string> = { watching_today: "tv/airing_today", trending_today: "trending/tv/day", trending_week: "trending/tv/week", trending: "trending/tv/week", top_rated: "tv/top_rated", popular: "tv/popular" };
    return `${API_BASE}/tmdb/${m[ep] || "tv/popular"}?page=${page}`;
  }
  if (isKids) return `${API_BASE}/tmdb/discover/movie?sort_by=${ep === "top_rated" ? "vote_average.desc" : "popularity.desc"}&page=${page}${kMC}`;
  const m: Record<string, string> = { watching_today: "movie/now_playing", trending_today: "trending/movie/day", trending_week: "trending/movie/week", trending: "trending/movie/week", top_rated: "movie/top_rated", popular: "movie/popular" };
  return `${API_BASE}/tmdb/${m[ep] || "movie/popular"}?page=${page}`;
}

export async function fetchCatalog(endpoint: string, mediaType: CatalogCategory = "movie", page: number = 1): Promise<MediaItem[]> {
  try {
    const isKidsMode = getUserSettings().kidsMode;
    const today = new Date().toISOString().split("T")[0];
    const url = buildCatalogUrl(endpoint, mediaType, page, isKidsMode, today);
    if (!url) return [];
    const isEn = getLocale() === "en";
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}language=${isEn ? "en-US" : "ru-RU"}`);
    if (!res.ok) return getCachedCatalog(endpoint, mediaType) || [];
    const data = await res.json();
    let valid = (data.results || []).filter((item: any) => !isGhostCatalogItem(item, today, isEn));
    if (isKidsMode) valid = valid.filter((i: any) => !i.adult && (!Array.isArray(i.genre_ids) || !i.genre_ids.some((g: number) => [27, 10752].includes(g))));
    const inf = mediaType === "cartoon" ? "movie" : mediaType === "anime" ? "tv" : mediaType === "home" ? undefined : mediaType;
    let items = valid.map((item: any) => ({
      ...item,
      title: item.title || item.name || (isEn ? "Untitled" : "Без названия"),
      release_date: item.release_date || item.first_air_date || "",
      media_type: item.media_type || inf || (item.first_air_date ? "tv" : "movie"),
    }));
    if (isKidsMode && items.length > 0) {
      const ratings = await Promise.all(items.map(async (i: any) => ({ id: i.id, rating: await fetchAgeRating(i.id, i.media_type).catch(() => null) })));
      const rMap = new Map<number, string | null>(ratings.map((r) => [r.id, r.rating]));
      items = items.filter((i: any) => { const r = rMap.get(i.id); return !r || (!r.includes("18") && !r.includes("16")); });
    }
    if (items.length > 0) setCachedCatalog(endpoint, mediaType, items);
    return items;
  } catch {
    return getCachedCatalog(endpoint, mediaType) || [];
  }
}

export async function searchCatalog(query: string): Promise<MediaItem[]> {
  if (!query.trim()) return [];
  try {
    const isEn = getLocale() === "en";
    const res = await fetch(`${API_BASE}/tmdb/search/multi?query=${encodeURIComponent(query)}&language=${isEn ? "en-US" : "ru-RU"}`);
    if (!res.ok) return [];
    const data = await res.json();
    const isKids = getUserSettings().kidsMode;
    let raw = (data.results || []).filter((i: any) => (i.media_type === "movie" || i.media_type === "tv") && (!isKids || (!i.adult && (!Array.isArray(i.genre_ids) || !i.genre_ids.some((g: number) => [27, 10752].includes(g))))));
    if (isKids && raw.length > 0) {
      const ratings = await Promise.all(raw.map(async (i: any) => ({ id: i.id, rating: await fetchAgeRating(i.id, i.media_type).catch(() => null) })));
      const rMap = new Map<number, string | null>(ratings.map((r) => [r.id, r.rating]));
      raw = raw.filter((i: any) => { const r = rMap.get(i.id); return !r || (!r.includes("18") && !r.includes("16")); });
    }
    return raw.map((i: any) => ({ ...i, title: i.title || i.name || (isEn ? "Untitled" : "Без названия"), release_date: i.release_date || i.first_air_date || "", age_rating: ageRatingCache.get(`${i.media_type || "movie"}_${i.id}`) || i.age_rating }));
  } catch {
    return [];
  }
}

export async function fetchMovieLogo(tmdbId: number, mediaType: string = "movie"): Promise<string | null> {
  try {
    const type = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(`${API_BASE}/tmdb/${type}/${tmdbId}/images?include_image_language=ru,en,null`);
    if (!res.ok) return null;
    const logos = ((await res.json()).logos || []) as any[];
    if (!logos.length) return null;
    const isEn = getLocale() === "en";
    const score = (l: any) => {
      const w = l.width || 0, h = l.height || 0, r = l.aspect_ratio || (h > 0 ? w / h : 3.0);
      let s = (l.vote_average || 0) * 40 + Math.min(l.vote_count || 0, 10) * 10;
      if (w >= 1200) s += 20; else if (w >= 700) s += 15; else if (w < 400) s -= 40;
      if (h >= 180) s += 15; else if (h < 70) s -= 30;
      return (r >= 2.0 && r <= 6.0) ? s + 20 : (r < 1.3 || r > 8.5) ? s - 30 : s;
    };
    const isAcc = (l: any) => (l.width || 0) >= 400 && (l.height || 0) >= 70 && (l.aspect_ratio || ((l.width || 0) / (l.height || 1))) >= 1.2;
    for (const lang of [isEn ? "en" : "ru", isEn ? "ru" : "en", null]) {
      const match = logos.filter((l) => (lang === null || l.iso_639_1 === lang) && isAcc(l)).sort((a, b) => score(b) - score(a))[0];
      if (match) return match.file_path;
    }
    return logos.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0]?.file_path || null;
  } catch {
    return null;
  }
}
