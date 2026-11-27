import { MediaItem } from "../types";
import { API_BASE } from "../api/utils";
import { getLocale } from "../i18n/state";
import { getUserSettings } from "../runtime/userSettings";
import { fetchAgeRating } from "./mediaService";

export type DiscoverSortBy =
  | "popularity.desc"
  | "vote_average.desc"
  | "primary_release_date.desc"
  | "revenue.desc";

export type DiscoverAgeRating = "6+" | "12+" | "16+" | "18+";

export interface DiscoverFilters {
  mediaType: "movie" | "tv" | "all";
  genreId?: number;
  yearFrom?: number;
  yearTo?: number;
  ratingMin?: number;
  ageRating?: DiscoverAgeRating;
  sortBy?: DiscoverSortBy;
  country?: string;
  page?: number;
}

export const GENRE_LIST: { id: number; nameRu: string; nameEn: string }[] = [
  { id: 28, nameRu: "Боевик", nameEn: "Action" },
  { id: 12, nameRu: "Приключения", nameEn: "Adventure" },
  { id: 16, nameRu: "Мультфильм", nameEn: "Animation" },
  { id: 35, nameRu: "Комедия", nameEn: "Comedy" },
  { id: 80, nameRu: "Криминал", nameEn: "Crime" },
  { id: 99, nameRu: "Документальный", nameEn: "Documentary" },
  { id: 18, nameRu: "Драма", nameEn: "Drama" },
  { id: 10751, nameRu: "Семейный", nameEn: "Family" },
  { id: 14, nameRu: "Фэнтези", nameEn: "Fantasy" },
  { id: 36, nameRu: "История", nameEn: "History" },
  { id: 27, nameRu: "Ужасы", nameEn: "Horror" },
  { id: 10402, nameRu: "Музыка", nameEn: "Music" },
  { id: 9648, nameRu: "Детектив", nameEn: "Mystery" },
  { id: 10749, nameRu: "Мелодрама", nameEn: "Romance" },
  { id: 878, nameRu: "Фантастика", nameEn: "Sci-Fi" },
  { id: 53, nameRu: "Триллер", nameEn: "Thriller" },
  { id: 10752, nameRu: "Военный", nameEn: "War" },
  { id: 37, nameRu: "Вестерн", nameEn: "Western" },
];

export const COUNTRY_LIST: { code: string; nameRu: string; nameEn: string }[] = [
  { code: "RU", nameRu: "Россия", nameEn: "Russia" },
  { code: "US", nameRu: "США", nameEn: "USA" },
  { code: "GB", nameRu: "Великобритания", nameEn: "United Kingdom" },
  { code: "FR", nameRu: "Франция", nameEn: "France" },
  { code: "DE", nameRu: "Германия", nameEn: "Germany" },
  { code: "KR", nameRu: "Южная Корея", nameEn: "South Korea" },
  { code: "JP", nameRu: "Япония", nameEn: "Japan" },
  { code: "IN", nameRu: "Индия", nameEn: "India" },
  { code: "ES", nameRu: "Испания", nameEn: "Spain" },
  { code: "IT", nameRu: "Италия", nameEn: "Italy" },
  { code: "CN", nameRu: "Китай", nameEn: "China" },
  { code: "TR", nameRu: "Турция", nameEn: "Turkey" },
];

export const SORT_OPTIONS: {
  value: DiscoverSortBy;
  labelRu: string;
  labelEn: string;
}[] = [
  { value: "popularity.desc", labelRu: "По популярности", labelEn: "By popularity" },
  { value: "vote_average.desc", labelRu: "По рейтингу", labelEn: "By rating" },
  { value: "primary_release_date.desc", labelRu: "По дате выхода", labelEn: "By release date" },
  { value: "revenue.desc", labelRu: "По сборам", labelEn: "By revenue" },
];

const KIDS_EXCLUDED_GENRES = new Set([27, 10752]);

const TV_SORT_MAP: Record<DiscoverSortBy, string> = {
  "popularity.desc": "popularity.desc",
  "vote_average.desc": "vote_average.desc",
  "primary_release_date.desc": "first_air_date.desc",
  "revenue.desc": "popularity.desc",
};

const AGE_CERT_MAP: Record<
  DiscoverAgeRating,
  { movie: { param: string; value: string }; tv: { param: string; value: string } }
> = {
  "6+": {
    movie: { param: "certification.lte", value: "PG" },
    tv: { param: "certification.lte", value: "TV-G" },
  },
  "12+": {
    movie: { param: "certification.lte", value: "PG-13" },
    tv: { param: "certification.lte", value: "TV-PG" },
  },
  "16+": {
    movie: { param: "certification.lte", value: "R" },
    tv: { param: "certification.lte", value: "TV-14" },
  },
  "18+": {
    movie: { param: "certification", value: "R|NC-17" },
    tv: { param: "certification", value: "TV-MA" },
  },
};

function buildDiscoverUrl(
  type: "movie" | "tv",
  filters: DiscoverFilters,
  lang: string,
): string {
  const params = new URLSearchParams();
  const requestedSort = filters.sortBy || "popularity.desc";
  const sortBy = type === "tv" ? TV_SORT_MAP[requestedSort] || "popularity.desc" : requestedSort;
  params.set("language", lang);
  params.set("page", String(filters.page || 1));
  params.set("sort_by", sortBy);

  if (filters.genreId) params.set("with_genres", String(filters.genreId));
  if (filters.ratingMin !== undefined) {
    params.set("vote_average.gte", String(filters.ratingMin));
  }
  if (filters.ageRating) {
    const cert = AGE_CERT_MAP[filters.ageRating][type];
    params.set("certification_country", "US");
    params.set(cert.param, cert.value);
  }

  const datePrefix = type === "movie" ? "primary_release_date" : "first_air_date";
  if (filters.yearFrom) params.set(`${datePrefix}.gte`, `${filters.yearFrom}-01-01`);
  if (filters.yearTo) params.set(`${datePrefix}.lte`, `${filters.yearTo}-12-31`);

  if (filters.country) {
    params.set(type === "movie" ? "region" : "with_origin_country", filters.country);
  }

  return `${API_BASE}/tmdb/discover/${type}?${params.toString()}`;
}

async function fetchDiscover(
  type: "movie" | "tv",
  filters: DiscoverFilters,
): Promise<MediaItem[]> {
  try {
    const isEn = getLocale() === "en";
    const lang = isEn ? "en-US" : "ru-RU";
    const url = buildDiscoverUrl(type, filters, lang);
    const isKids = getUserSettings().kidsMode;

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    let raw: any[] = data.results || [];
    if (isKids) {
      raw = raw.filter(
        (i: any) =>
          !i.adult &&
          (!Array.isArray(i.genre_ids) ||
            !i.genre_ids.some((g: number) => KIDS_EXCLUDED_GENRES.has(g))),
      );
    }

    let ratingMap: Map<string, string | null> | null = null;
    if (isKids && raw.length > 0) {
      const ratings = await Promise.all(
        raw.map(async (i: any) => ({
          key: `${type}_${i.id}`,
          rating: await fetchAgeRating(i.id, type).catch(() => null),
        })),
      );
      ratingMap = new Map(ratings.map((r) => [r.key, r.rating]));
      raw = raw.filter((i: any) => {
        const r = ratingMap!.get(`${type}_${i.id}`);
        return !r || (!r.includes("18") && !r.includes("16"));
      });
    }

    return raw.map((item: any) => ({
      ...item,
      title: item.title || item.name || (isEn ? "Untitled" : "Без названия"),
      release_date: item.release_date || item.first_air_date || "",
      media_type: type,
      age_rating: ratingMap?.get(`${type}_${item.id}`) || item.age_rating,
    }));
  } catch {
    return [];
  }
}

export async function discoverMedia(
  filters: DiscoverFilters,
): Promise<MediaItem[]> {
  if (filters.mediaType === "all") {
    const [movies, tvShows] = await Promise.all([
      fetchDiscover("movie", filters),
      fetchDiscover("tv", filters),
    ]);
    return [...movies, ...tvShows].sort(
      (a, b) => ((b as any).popularity ?? 0) - ((a as any).popularity ?? 0),
    );
  }

  return fetchDiscover(filters.mediaType, filters);
}
