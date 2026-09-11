export const API_BASE = "http://127.0.0.1:8400/api";

export function getImageUrl(path: string | null | undefined): string {
  if (!path) {
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='225' viewBox='0 0 150 225'><rect width='150' height='225' fill='%231b2838'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2366c0f4' font-family='sans-serif' font-size='14'>Projacktor</text></svg>";
  }
  const cleanPath = path.startsWith("http") ? path : path.startsWith("/") ? path : `/${path}`;
  if (cleanPath.startsWith("http")) {
    return `${API_BASE}/image?url=${encodeURIComponent(cleanPath)}`;
  }
  return `${API_BASE}/image?path=${encodeURIComponent(cleanPath)}&size=w342`;
}

export function getBackdropUrl(path: string | null | undefined): string {
  if (!path) return "";
  const cleanPath = path.startsWith("http") ? path : path.startsWith("/") ? path : `/${path}`;
  if (cleanPath.startsWith("http")) {
    return `${API_BASE}/image?url=${encodeURIComponent(cleanPath)}`;
  }
  return `${API_BASE}/image?path=${encodeURIComponent(cleanPath)}&size=w780`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 КБ/с";
  if (bytesPerSec < 1048576) {
    return (bytesPerSec / 1024).toFixed(1) + " КБ/с";
  }
  return (bytesPerSec / 1048576).toFixed(1) + " МБ/с";
}

export function sortEpisodes<T extends { name?: string; path?: string }>(episodes: T[]): T[] {
  if (!Array.isArray(episodes)) return [];
  const getSortKey = (ep: T) => {
    const name = ep.name || ep.path || "";
    // 1. S01E02, s1e2, s01.e02
    const sExMatch = name.match(/[sS](\d+)[\.\s_-]*[eE](\d+)/);
    if (sExMatch) {
      return { season: parseInt(sExMatch[1], 10), episode: parseInt(sExMatch[2], 10), name };
    }
    // 2. 1x02, 01x02
    const xMatch = name.match(/(\d+)[xX](\d+)/);
    if (xMatch) {
      return { season: parseInt(xMatch[1], 10), episode: parseInt(xMatch[2], 10), name };
    }
    // 3. Season / Сезон
    const sMatch = name.match(/(?:[sS]eason|[сС]езон)\s*(\d+)/i);
    const season = sMatch ? parseInt(sMatch[1], 10) : 1;
    // 4. Episode / Серия / Сер / Эпизод
    const eMatch = name.match(/(?:[eE]pisode|[eE]p\.?|[сС]ерия|[сС]ер\.?|[эЭ]пизод)\s*(\d+)/i);
    if (eMatch) {
      return { season, episode: parseInt(eMatch[1], 10), name };
    }
    const eMatch2 = name.match(/(\d+)\s*(?:серия|сер|выпуск|эпизод)/i);
    if (eMatch2) {
      return { season, episode: parseInt(eMatch2[1], 10), name };
    }
    return { season, episode: 999999, name };
  };

  return [...episodes].sort((a, b) => {
    const keyA = getSortKey(a);
    const keyB = getSortKey(b);
    if (keyA.season !== keyB.season) return keyA.season - keyB.season;
    if (keyA.episode !== keyB.episode) return keyA.episode - keyB.episode;
    return keyA.name.localeCompare(keyB.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

