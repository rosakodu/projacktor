import { MediaItem } from "../types";
import { getBackdropUrl } from "../api/utils";

type BackdropListener = (url: string | null, movie: MediaItem | null) => void;

let currentUrl: string | null = null;
let currentMovie: MediaItem | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<BackdropListener>();

function notify() {
  for (const listener of listeners) {
    try {
      listener(currentUrl, currentMovie);
    } catch (e) {
      console.error("[BackdropBus] listener error:", e);
    }
  }
}

export function setBackdropMovie(movie: MediaItem | null, immediate = false) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const apply = () => {
    currentMovie = movie;
    if (!movie) {
      currentUrl = null;
    } else {
      const path = movie.backdrop_path || movie.poster_path;
      currentUrl = path ? getBackdropUrl(path) : null;
    }
    notify();
  };

  if (immediate) {
    apply();
  } else {
    debounceTimer = setTimeout(apply, 90);
  }
}

export function setBackdropUrl(url: string | null) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  currentUrl = url;
  currentMovie = null;
  notify();
}

export function getCurrentBackdrop(): { url: string | null; movie: MediaItem | null } {
  return { url: currentUrl, movie: currentMovie };
}

export function subscribeBackdrop(listener: BackdropListener): () => void {
  listeners.add(listener);
  // Немедленный вызов при подписке для синхронизации
  listener(currentUrl, currentMovie);
  return () => {
    listeners.delete(listener);
  };
}
