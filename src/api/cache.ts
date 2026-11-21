import { MediaItem, CatalogCategory } from "../types";
import { getLocale } from "../i18n/state";
import { getUserSettings } from "../runtime/userSettings";
import { isGhostCatalogItem } from "./utils";

export function getCatalogCacheScope(): string {
  return `${getLocale()}_${getUserSettings().kidsMode ? "kids" : "all"}`;
}

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
  mediaType: CatalogCategory = "movie",
  page = 1,
  scope = getCatalogCacheScope()
): MediaItem[] | null {
  const cacheKey = `projacktor_cat_v3_${scope}_${mediaType}_${endpoint}_${page}`;
  const mem = catalogMemoryCache.get(cacheKey);
  if (mem && mem.data.length > 0) {
    const valid = mem.data.filter((it) => !isGhostCatalogItem(it));
    return valid.length > 0 ? valid : null;
  }
  try {
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter((it: any) => !isGhostCatalogItem(it));
        if (valid.length > 0) {
          catalogMemoryCache.set(cacheKey, { time: Date.now(), data: valid });
          return valid;
        }
      }
    }
  } catch {}
  return null;
}

export function setCachedCatalog(
  endpoint: string,
  mediaType: CatalogCategory,
  items: MediaItem[],
  page = 1,
  scope = getCatalogCacheScope()
): void {
  const cacheKey = `projacktor_cat_v3_${scope}_${mediaType}_${endpoint}_${page}`;
  const validItems = (items || []).filter((it) => !isGhostCatalogItem(it));
  if (validItems.length > 0) {
    catalogMemoryCache.set(cacheKey, { time: Date.now(), data: validItems });
    try {
      localStorage.setItem(cacheKey, JSON.stringify(validItems));
    } catch {}
  }
}
