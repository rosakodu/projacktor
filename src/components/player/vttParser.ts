/** WebVTT subtitle parser and cue merge utilities */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export const parseVttTimestamp = (timeStr: string): number => {
  const parts = timeStr.trim().split(":");
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    hours = parseFloat(parts[0]) || 0;
    minutes = parseFloat(parts[1]) || 0;
    seconds = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]) || 0;
    seconds = parseFloat(parts[1]) || 0;
  } else {
    seconds = parseFloat(parts[0]) || 0;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

export const parseWebVTT = (vtt: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  if (!vtt) return cues;
  const lines = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split("-->");
      if (parts.length === 2) {
        const startRaw = parts[0].trim();
        const endRaw = parts[1].trim().split(/\s+/)[0];
        const start = parseVttTimestamp(startRaw);
        const end = parseVttTimestamp(endRaw);
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
          const clean = lines[i]
            .replace(/<[^>]+>/g, "")
            .replace(/\{[^}]+\}/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
          if (clean) textLines.push(clean);
          i++;
        }
        if (textLines.length > 0 && end > start) {
          cues.push({ start, end, text: textLines.join("\n") });
        }
        continue;
      }
    }
    i++;
  }
  return cues;
};

export const mergeCues = (prev: SubtitleCue[], next: SubtitleCue[]): SubtitleCue[] => {
  if (prev.length === 0) return next;
  if (next.length === 0) return prev;
  const map = new Map<string, SubtitleCue>();
  for (const c of prev) map.set(`${c.start.toFixed(2)}_${c.end.toFixed(2)}`, c);
  for (const c of next) map.set(`${c.start.toFixed(2)}_${c.end.toFixed(2)}`, c);
  return Array.from(map.values()).sort((a, b) => a.start - b.start);
};
