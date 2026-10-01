const STORAGE_KEY = "projacktor_search_history";
const MAX_HISTORY_ITEMS = 15;

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch (e) {
    console.error("[SearchHistory] Failed to read search history:", e);
  }
  return [];
}

export function addSearchHistory(query: string): string[] {
  const clean = (query || "").trim();
  if (!clean) return getSearchHistory();

  try {
    const current = getSearchHistory();
    // Убираем дубликат без учета регистра
    const filtered = current.filter((item) => item.toLowerCase() !== clean.toLowerCase());
    const updated = [clean, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("[SearchHistory] Failed to save search history:", e);
    return getSearchHistory();
  }
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("[SearchHistory] Failed to clear search history:", e);
  }
}
