import { useState, useEffect, useCallback, useRef } from "react";
import { MediaItem, CatalogCategory } from "../types";
import { fetchCatalog, getCachedCatalog } from "../api";

export interface CatalogCategoryState {
  watchingItems: MediaItem[];
  trendingItems: MediaItem[];
  topRatedItems: MediaItem[];
  loading: boolean;
  refresh: () => void;
}

export function useCatalogCategory(category: CatalogCategory): CatalogCategoryState {
  const [watchingItems, setWatchingItems] = useState<MediaItem[]>(
    () => getCachedCatalog("watching_today", category) || []
  );
  const [trendingItems, setTrendingItems] = useState<MediaItem[]>(
    () => getCachedCatalog("trending_today", category) || []
  );
  const [topRatedItems, setTopRatedItems] = useState<MediaItem[]>(
    () => getCachedCatalog("top_rated", category) || []
  );

  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getCachedCatalog("watching_today", category);
    return !(cached && cached.length > 0);
  });

  const mountedRef = useRef<boolean>(true);

  const loadData = useCallback(() => {
    mountedRef.current = true;
    let completed = 0;
    const markCompleted = () => {
      completed++;
      if (mountedRef.current && completed >= 1) {
        setLoading(false);
      }
    };

    fetchCatalog("watching_today", category)
      .then((items) => {
        if (mountedRef.current && items.length > 0) {
          setWatchingItems(items);
        }
        markCompleted();
      })
      .catch(markCompleted);

    fetchCatalog("trending_today", category)
      .then((items) => {
        if (mountedRef.current && items.length > 0) {
          setTrendingItems(items);
        }
        markCompleted();
      })
      .catch(markCompleted);

    fetchCatalog("top_rated", category)
      .then((items) => {
        if (mountedRef.current && items.length > 0) {
          setTopRatedItems(items);
        }
        markCompleted();
      })
      .catch(markCompleted);
  }, [category]);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  return {
    watchingItems,
    trendingItems,
    topRatedItems,
    loading,
    refresh: loadData,
  };
}
