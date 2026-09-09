import { MediaItem, CatalogCategory } from "../types";

const catalogMemoryCache = new Map<string, { time: number; data: MediaItem[] }>();

export function clearLocalCache(): void {
  catalogMemoryCache.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("projacktor_cat_")) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

export function getCachedCatalog(
  endpoint: string,
  mediaType: CatalogCategory = "movie"
): MediaItem[] | null {
  const cacheKey = `projacktor_cat_${mediaType}_${endpoint}`;
  const mem = catalogMemoryCache.get(cacheKey);
  if (mem && mem.data.length > 0) {
    return mem.data;
  }
  try {
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        catalogMemoryCache.set(cacheKey, { time: Date.now(), data: parsed });
        return parsed;
      }
    }
  } catch {}
  return null;
}

export function setCachedCatalog(
  endpoint: string,
  mediaType: CatalogCategory,
  items: MediaItem[]
): void {
  const cacheKey = `projacktor_cat_${mediaType}_${endpoint}`;
  if (items.length > 0) {
    catalogMemoryCache.set(cacheKey, { time: Date.now(), data: items });
    try {
      localStorage.setItem(cacheKey, JSON.stringify(items));
    } catch {}
  }
}
