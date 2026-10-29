export type Locale = "ru" | "en";

export function detectSteamLanguage(): string {
  try {
    if (typeof window !== "undefined") {
      const w = window as any;
      const locMgr = w.LocalizationManager;
      if (typeof locMgr?.m_strLanguage === "string" && locMgr.m_strLanguage.trim()) {
        return locMgr.m_strLanguage.trim().toLowerCase();
      }
      if (Array.isArray(locMgr?.m_rgLocalesToUse) && locMgr.m_rgLocalesToUse[0]) {
        return String(locMgr.m_rgLocalesToUse[0]).trim().toLowerCase();
      }
      if (typeof w.SteamClient?.Settings?.GetCurrentLanguage === "function") {
        const l = w.SteamClient.Settings.GetCurrentLanguage();
        if (typeof l === "string" && l.trim()) return l.trim().toLowerCase();
      }
      if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language.toLowerCase();
      }
    }
  } catch {}
  return "";
}

export function getInitialLocale(): Locale {
  const lang = detectSteamLanguage();
  if (lang) {
    return lang.startsWith("en") || lang === "english" ? "en" : "ru";
  }
  return "ru";
}

let currentLocale: Locale = getInitialLocale();
const listeners = new Set<(loc: Locale) => void>();

export function setLocale(loc: Locale) {
  if (currentLocale !== loc) {
    currentLocale = loc;
    listeners.forEach((fn) => fn(loc));
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function subscribeLocale(listener: (loc: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
