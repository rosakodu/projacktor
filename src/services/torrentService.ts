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

export function cleanTitleForMatching(title: string): string {
  if (!title) return "";
  return title.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function extractTitleTokens(title: string): string[] {
  const cleaned = cleanTitleForMatching(title);
  return cleaned ? cleaned.split(" ").filter(Boolean) : [];
}

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const LAT_TO_CYR: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и",
  j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р",
  s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "й", z: "з",
};

export function transliterateText(text: string): string {
  if (!text) return "";
  const lower = text.toLowerCase().replace(/ё/g, "е");
  const hasCyr = /[а-я]/i.test(lower);
  const hasLat = /[a-z]/i.test(lower);
  if (hasCyr && !hasLat) {
    return lower.split("").map((ch) => CYR_TO_LAT[ch] || ch).join("");
  }
  if (hasLat && !hasCyr) {
    return lower.split("").map((ch) => LAT_TO_CYR[ch] || ch).join("");
  }
  return "";
}

const SEASON_EPISODE_WORDS = new Set([
  "сезон", "сезона", "сезоны", "сезонов", "season", "seasons", "s",
  "серия", "серии", "серий", "серию", "эпизод", "эпизоды", "episode", "episodes", "ep",
  "из", "part", "часть", "й", "го", "я", "е", "му", "м", "st", "nd", "rd", "th"
]);

export function matchesWordBoundary(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const tokens = extractTitleTokens(phrase);
  if (!tokens.length) return false;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = "(?:^|[^\\p{L}\\p{N}])" + escaped.join("[^\\p{L}\\p{N}]+") + "(?:$|[^\\p{L}\\p{N}])";
  return new RegExp(pattern, "iu").test(text);
}

export function extractSegmentTitle(segment: string): string {
  if (!segment) return "";
  let s = segment.trim();
  s = s.replace(/^\s*(?:\[[^\]]+\]\s*)+/, "");
  s = s.replace(/^\s*(?:сериал|мини[- ]сериал|телесериал|х\/?ф|т\/?с|фильм|мультсериал|мультфильм|м\/?ф|аниме)\s*[:\-–—]?\s*/iu, "");
  s = s.split(/\b(?:s\d+(?:e\d+)?(?:-s?\d+)?(?:-e?\d+)?|season\s*\d+|\d+[-_ ]?(?:й|го|я|е|му|м|st|nd|rd|th)?\s*сезон|сезон\s*\d+|сери[яий]|эпизод|\d+\s*из\s*\d+|\d{1,2}x\d{1,2}|e\d+|ep\d+)\b/iu)[0];
  s = s.split(/\b(?:2160p|1080p|720p|480p|4k|uhd|fhd|hd|web-?dl|webrip|bdrip|hdrip|bluray|remux|dvdrip|camrip|tsrip)\b/iu)[0];
  s = s.split(/(?<!^)[\(\[]/)[0];
  return s.replace(/^[\s:.\-_–—]+|[\s:.\-_–—]+$/g, "");
}

export function isMatchingTitle(torrentTitle: string, targetTitle: string, originalTitle?: string): boolean {
  if (!torrentTitle || !targetTitle) return false;

  const rawCandidates = [targetTitle];
  if (originalTitle && originalTitle.trim() && originalTitle.trim() !== targetTitle.trim()) {
    rawCandidates.push(originalTitle);
  }

  const candidates: string[][] = [];
  const candKeys = new Set<string>();

  for (const rc of rawCandidates) {
    const tokens = extractTitleTokens(rc);
    if (tokens.length) {
      const k = tokens.join(" ");
      if (!candKeys.has(k)) { candKeys.add(k); candidates.push(tokens); }
      if (tokens.length > 1 && ["the", "a", "an"].includes(tokens[0])) {
        const noArt = tokens.slice(1);
        const nk = noArt.join(" ");
        if (!candKeys.has(nk)) { candKeys.add(nk); candidates.push(noArt); }
      }
      const trans = transliterateText(rc);
      if (trans) {
        const tTokens = extractTitleTokens(trans);
        const tk = tTokens.join(" ");
        if (tTokens.length && !candKeys.has(tk)) { candKeys.add(tk); candidates.push(tTokens); }
      }
    }
  }

  if (!candidates.length) return false;

  const boundaryMatched = candidates.filter((cand) => matchesWordBoundary(torrentTitle, cand.join(" ")));
  if (!boundaryMatched.length) return false;

  const segments = torrentTitle.split(/[/|\\]/).map((s) => s.trim()).filter(Boolean);
  const segList = segments.length ? segments : [torrentTitle];

  for (const cand of boundaryMatched) {
    const candJoined = cand.join(" ");
    const candCollapsed = cand.join("");

    for (const seg of segList) {
      const segTitle = extractSegmentTitle(seg);
      const segTokens = extractTitleTokens(segTitle);
      if (!segTokens.length) continue;

      const segNoArt = (segTokens.length > 1 && ["the", "a", "an"].includes(segTokens[0])) ? segTokens.slice(1) : segTokens;

      if (segTokens.join(" ") === candJoined || segNoArt.join(" ") === candJoined) {
        return true;
      }
      if (segTokens.join("") === candCollapsed) {
        return true;
      }

      for (const st of [segTokens, segNoArt]) {
        if (st.length > cand.length && st.slice(0, cand.length).join(" ") === candJoined) {
          const remainder = st.slice(cand.length);
          if (
            remainder.every(
              (r) =>
                SEASON_EPISODE_WORDS.has(r) ||
                /^\d+$/.test(r) ||
                /^(?:s\d+(?:e\d+)?(?:-s?\d+)?(?:-e?\d+)?|e\d+|ep\d+|\d+x\d+|\d+-\d+)$/i.test(r)
            )
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function filterTorrents(items: any[], targetTitle: string, targetYear?: string, mediaType: "movie" | "tv" = "movie", originalTitle?: string): any[] {
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
          if (hasLater && !years.some((y) => y >= targetY - 1 && y <= targetY + 15)) return false;
          if (!isS1 && !hasLater && !years.some((y) => Math.abs(y - targetY) <= 1)) return false;
        }
      }
    }
    if (!isMatchingTitle(title, targetTitle, originalTitle)) return false;
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
        let u = `${API_BASE}/jacred/search?query=${encodeURIComponent(q)}${category ? `&category=${category}` : ""}`;
        if (cleanTitle) u += `&title=${encodeURIComponent(cleanTitle)}`;
        if (cleanOrig) u += `&original_title=${encodeURIComponent(cleanOrig)}`;
        if (year) u += `&year=${encodeURIComponent(year)}`;
        if (mediaType) u += `&media_type=${encodeURIComponent(mediaType)}`;
        const res = await fetch(u);
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
        else if (mediaType === "tv" && years.some((y) => y > targetY && y <= targetY + 15)) sc += 3000;
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
