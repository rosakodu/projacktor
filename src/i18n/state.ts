export type Locale = "ru" | "en";

let currentLocale: Locale = "ru";
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
