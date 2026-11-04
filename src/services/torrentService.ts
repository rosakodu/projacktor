import { TorrentItem } from "../types";
import { API_BASE, formatBytes } from "../api/utils";

const extractYears = (t: string) => (t.replace(/\b(1080[pi]?|2160[pi]?|720[pi]?|1920|1440[pi]?)\b/gi, "").match(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g) || []).map(Number);
const hasCJK = (s: string) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(s);
const isCollection = (t: string) => /(?:^|[^\p{L}\p{N}])(коллекция|трилогия|квадрология|антология|collection|anthology|trilogy|quadrilogy)(?:$|[^\p{L}\p{N}])/iu.test(t);

export function isTvRelease(title: string): boolean {
  return [/\b[sS]\d+/i, /\b\d+\s*[xX]\s*\d+\b/i, /(?:^|[^\p{L}\p{N}])(сезон|сезона|сезоны|сезонов|сери[яий]|серия|серии|серий|эпизод|эпизоды|мини[- ]?сериал|сериал)(?:$|[^\p{L}\p{N}])/iu, /\b\d+\s*из\s*\d+\b/i, /(?:\[|\()\s*(?!\d{4})\d{1,3}\s*[\s_-]+\s*(?!\d{4})\d{1,3}\s*(?:\]|\))/, /\[\s*(?:TV|ТВ|OVA|OAD|Special|Спешл)\b/i, /\b(?:s\d+|season\s*\d+)\b/i].some((p) => p.test(title));
}

function isUnwantedSequel(tTitle: string, targetTitle: string): boolean {
  if (!targetTitle || /(?:^|[^\p{L}\p{N}])(2|3|4|5|6|7|8|9|II|III|IV|V)(?:$|[^\p{L}\p{N}])/iu.test(targetTitle)) return false;
  const escaped = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[^\\p{L}\\p{N}])" + escaped + "\\s+(?:[2-9]|10|II|III|IV|VI?|VII|VIII)(?:$|[^\\p{L}\\p{N}])", "iu").test(tTitle);
}

export function isExecutableRelease(title: string, magnet?: string): boolean {
  if (!title && !magnet) return false;
  const text = `${title || ""} ${magnet || ""}`;
  return /\.(exe|msi|scr|bat|cmd|pif|vbs|vbe|cpl|com|jar|apk|dmg|pkg)(?:$|[\s\?&"'\)\]_#])/i.test(text)
    || /(?:^|[\s.\[\(_-])exe(?:$|[\s.\]\)_-])/i.test(title || "") || /\b(setup|installer|crack|keygen|patch)\.exe\b/i.test(text);
}

const UNSUPPORTED_MEDIA_REGEX = /(?:\.(rar|zip|7z|tar|gz|bz2|xz|iso|img)(?:$|[\s\?&"'\)\]_#])|\bpart\d+\.rar\b|(?:^|[\s.\[\(_-])(?:rar|zip|7z|iso)(?:$|[\s.\]\)_-])|\b(?:bdmv|dvd-?9|dvd-?5|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100|bd25|bd50|bd66|bd100)\b|(?:^|[\s.\[\(_-])(?:bdmv|dvd9|dvd5|bd-?25|bd-?50|bd-?66|bd-?100)(?:$|[\s.\]\)_-])|(?:uhd\s*)?blu-?ray[\s._\-\(\[]*(?:full|complete|образ|disc|disk|диск)|dvd[\s._\-\(\[]*(?:disc|disk|диск)|(?:полный|образ)\s*диск[а]?)/iu;

export function isUnsupportedMediaRelease(title: string, magnet?: string): boolean {
  if (!title && !magnet) return false;
  const combined = `${title || ""} ${magnet || ""}`;
  if (UNSUPPORTED_MEDIA_REGEX.test(combined)) return true;
  const lower = combined.toLowerCase();
  if ((lower.includes("blu-ray") || lower.includes("bluray")) && !/\b(remux|rip)\b/i.test(lower)) {
    if (/blu-?ray[\s._\-\(\[]*(?:\d+p|\d+i|cee|eur|rus|3d|custom)/i.test(lower)) return true;
  }
  return false;
}

export function parseQuality(title: string, existing?: string): string {
  const t = (title || "").toLowerCase();
  let res = t.includes("2160p") || t.includes("4k") || t.includes("4к") || t.includes("uhd") ? "4K" : t.includes("1080p") || t.includes("fhd") ? "1080p" : t.includes("720p") || t.includes("hd") ? "720p" : "";
  if (/\b(telesync|tsrip|hdts|hd-ts)\b|(?:\s|^|[\[\(/])ts(?:\s|$|[\]\)/])/i.test(t)) return res ? `TS ${res}` : "TS";
  if (/\b(camrip|hdcam)\b|(?:\s|^|[\[\(/])cam(?:\s|$|[\]\)/])/i.test(t)) return res ? `CAM ${res}` : "CAM";
  if (/\b(telecine)\b|(?:\s|^|[\[\(/])tc(?:\s|$|[\]\)/])/i.test(t)) return res ? `TC ${res}` : "TC";
  if (existing?.trim() && !existing.trim().toLowerCase().startsWith("http")) return existing.trim();
  if (res) return res;
  return t.includes("web-dl") || t.includes("webrip") ? "WEB-DL" : t.includes("bdrip") || t.includes("bdremux") || t.includes("bluray") ? "BDRip" : t.includes("hdrip") ? "HDRip" : t.includes("dvd") ? "DVD" : "";
}

function filterTorrents(items: any[], targetTitle: string, targetYear?: string, mediaType: "movie" | "tv" = "movie", originalTitle?: string): any[] {
  const targetY = targetYear ? parseInt(targetYear, 10) : NaN;
  const isTargetMovie = mediaType === "movie", isTargetTv = mediaType === "tv";
  return items.filter((t) => {
    const title = t.title || "";
    if (isExecutableRelease(title, t.magnet) || isUnsupportedMediaRelease(title, t.magnet)) return false;
    if (isTargetMovie && (isTvRelease(title) || (isCollection(title) && !isCollection(targetTitle)))) return false;
    if (isTargetMovie && (isUnwantedSequel(title, targetTitle) || (originalTitle && isUnwantedSequel(title, originalTitle)))) return false;
    if (isTargetTv && /\b(полнометражный\s*фильм|фильм\b|movie\b)\b/i.test(title) && !isTvRelease(title) && !isCollection(title)) return false;
    if (!isNaN(targetY)) {
      const years = extractYears(title);
      if (years.length > 0) {
        if (isTargetMovie && !years.some((y) => Math.abs(y - targetY) <= 1)) return false;
        if (isTargetTv) {
          const isS1 = /\b(s0?1\b|1\s*сезон|сезон\s*0?1|season\s*0?1|1[-_ ]?й\s*сезон)\b/i.test(title);
          const hasLater = /\b(s0?[2-9]\b|s[1-9]\d\b|[2-9]\s*сезон|сезон\s*[2-9]|season\s*[2-9])\b/i.test(title);
          if (isS1 && !hasLater && !years.some((y) => Math.abs(y - targetY) <= 1)) return false;
          if (hasLater && !years.some((y) => y >= targetY - 1 && y <= targetY + 12)) return false;
          if (!isS1 && !hasLater && !years.some((y) => Math.abs(y - targetY) <= 1)) return false;
        }
      }
    }
    if (originalTitle?.trim() && !hasCJK(originalTitle)) {
      const cleanOrig = originalTitle.trim().toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9]/g, "");
      const slashParts = title.split("/").map((s: string) => s.trim());
      if (slashParts.length >= 2) {
        const latin = slashParts.find((p: string) => /^[a-zA-Z0-9\s:.'!?-]+$/.test(p) && !extractYears(p).length);
        if (latin) {
          const normPart = latin.toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9]/g, "");
          if (normPart.length >= 3 && cleanOrig.length >= 3 && normPart !== cleanOrig && !normPart.startsWith(cleanOrig) && !cleanOrig.startsWith(normPart)) return false;
        }
      }
    }
    return true;
  });
}

const torrentSearchCache = new Map<string, { time: number; data: TorrentItem[] }>();

export async function searchTorrents(title: string, year?: string, mediaType: "movie" | "tv" = "movie", originalTitle?: string): Promise<TorrentItem[]> {
  try {
    const cleanTitle = title.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim();
    const cleanOrig = (originalTitle && !hasCJK(originalTitle)) ? originalTitle.replace(/[№#]/g, " ").replace(/\s+/g, " ").trim() : "";
    const cacheKey = `${cleanTitle}_${year || ""}_${mediaType}_${cleanOrig}`.toLowerCase();
    const cached = torrentSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.time < 600000 && cached.data.length > 0) return cached.data;

    const cat = mediaType === "movie" ? "2000,5070" : "5000,5070";
    const fetchQ = async (q: string, category: string = cat): Promise<any[]> => {
      try {
        const res = await fetch(`${API_BASE}/jacred/search?query=${encodeURIComponent(q)}${category ? `&category=${category}` : ""}`);
        return res.ok ? (await res.json()) || [] : [];
      } catch { return []; }
    };

    let raw: any[] = [];
    const qList = [cleanTitle, cleanOrig].filter(Boolean);
    (await Promise.allSettled(qList.map((q) => fetchQ(q)))).forEach((r) => { if (r.status === "fulfilled" && Array.isArray(r.value)) raw.push(...r.value); });
    if (raw.length < 6 && year) {
      const qYear = [`${cleanTitle} ${year}`, cleanOrig ? `${cleanOrig} ${year}` : ""].filter(Boolean);
      (await Promise.allSettled(qYear.map((q) => fetchQ(q)))).forEach((r) => { if (r.status === "fulfilled" && Array.isArray(r.value)) raw.push(...r.value); });
    }
    if (raw.length === 0) {
      const fb = await fetchQ(cleanTitle, "");
      if (Array.isArray(fb)) raw.push(...fb);
    }

    const filtered = filterTorrents(raw, cleanTitle, year, mediaType, originalTitle);
    const seen = new Set<string>();
    const deduplicated: TorrentItem[] = [];
    for (const t of filtered) {
      if (isExecutableRelease(t.title, t.magnet) || isUnsupportedMediaRelease(t.title, t.magnet)) continue;
      const sCount = Number(t.seeds ?? t.seeders ?? 0);
      if (sCount <= 0) continue;
      const key = t.magnet || t.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduplicated.push({ ...t, seeds: sCount, peers: t.peers ?? 0, size: typeof t.size === "number" ? formatBytes(t.size) : t.size, quality: parseQuality(t.title || "", t.quality), pub_date: t.pub_date || t.PublishDate || t.pubdate || "" });
    }

    const targetY = year ? parseInt(year, 10) : NaN;
    const score = (t: any): number => {
      let sc = 0; const years = extractYears(t.title || "");
      if (!isNaN(targetY)) {
        if (years.includes(targetY)) sc += 10000;
        else if (years.some((y) => Math.abs(y - targetY) <= 1)) sc += 6000;
        else if (mediaType === "tv" && years.some((y) => y > targetY && y <= targetY + 6)) sc += 3000;
        else if (years.length > 0) sc -= 10000;
      }
      const q = parseQuality(t.title || "", t.quality);
      if (q.includes("1080p")) sc += 500; else if (q.includes("4K")) sc += 400; else if (q.includes("720p")) sc += 200;
      if (q.includes("CAM") || q.includes("TS")) sc -= 3000;
      return sc + Math.min(Number(t.seeds ?? 0), 100) * 5;
    };

    deduplicated.sort((a, b) => score(b) - score(a));
    if (deduplicated.length > 0) torrentSearchCache.set(cacheKey, { time: Date.now(), data: deduplicated });
    return deduplicated;
  } catch { return []; }
}
