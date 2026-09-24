/**
 * Helper to obtain the active Big Picture Gamepad UI window and document.
 * Since Decky plugins run inside SharedJSContext, global `document` is a separate document.
 * The actual gamepad UI elements reside in the SteamUI GamepadUIMainWindow.
 */

export function getActiveWindow(): Window {
  const g = globalThis as any;
  try {
    const bpWin =
      g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ||
      g.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow;
    if (bpWin && bpWin.document) return bpWin;

    const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        if (
          w?.BrowserWindow?.document?.querySelector?.(
            ".projacktor-root, .projacktor-nav-bar, .projacktor-card, .projacktor-modal-root, .projacktor-player-fullscreen"
          )
        ) {
          return w.BrowserWindow;
        }
      }
    }
  } catch {}

  return ((typeof window !== "undefined" ? window : globalThis) as unknown) as Window;
}

export function getActiveDocument(node?: Node | null): Document {
  if (node && node.ownerDocument) {
    return node.ownerDocument;
  }
  const win = getActiveWindow();
  if (win && win.document) {
    return win.document;
  }
  return typeof document !== "undefined" ? document : (null as any);
}

export function getSteamUIStore(): any {
  const g = globalThis as any;
  if (g.SteamUIStore) return g.SteamUIStore;
  if (g.opener?.SteamUIStore) return g.opener.SteamUIStore;
  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    if (docView?.SteamUIStore) return docView.SteamUIStore;
    if (docView?.opener?.SteamUIStore) return docView.opener.SteamUIStore;
  } catch {}
  return null;
}

const g = globalThis as any;

export function markOverlayActive(): void {
  const now = Date.now();
  g.__projacktor_last_overlay_time = now;
  try {
    if (g.opener) g.opener.__projacktor_last_overlay_time = now;
  } catch {}
  try {
    const bp = g.__projacktor_input_bp_view;
    if (bp) bp.__projacktor_last_overlay_time = now;
  } catch {}
}

export function isOverlayActive(): boolean {
  try {
    const store = getSteamUIStore();
    if (!store) return false;
    const win =
      store.GetFocusedWindowInstance?.() ||
      store.WindowStore?.GamepadUIMainWindowInstance ||
      store.WindowStore?.SteamUIWindows?.[0];
    const ms = win?.MenuStore;
    if (ms) {
      if (ms.IsAnySideMenuVisible?.() || (ms.GetOpenSideMenu?.() ?? 0) !== 0 || (ms.m_eOpenSideMenu ?? 0) !== 0) {
        markOverlayActive();
        return true;
      }
    }
    const nm = store.m_GamepadNavigationManager;
    const activeTree = nm?.GetActiveNavTree?.()?.m_ID;
    if (
      activeTree &&
      (activeTree.includes("QuickAccess") ||
        activeTree.includes("MainNav") ||
        activeTree.includes("SideMenu") ||
        activeTree.includes("virtual keyboard"))
    ) {
      markOverlayActive();
      return true;
    }
  } catch {}
  return false;
}

// Continuous background polling to ensure markOverlayActive is refreshed continuously while overlay is open
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    if (isOverlayActive()) {
      markOverlayActive();
    }
  }, 30);
}

export function isOverlayActiveOrRecent(windowMs: number = 1200): boolean {
  if (isOverlayActive()) {
    markOverlayActive();
    return true;
  }
  const lastTime = Math.max(
    g.__projacktor_last_overlay_time || 0,
    g.opener?.__projacktor_last_overlay_time || 0,
    g.__projacktor_input_bp_view?.__projacktor_last_overlay_time || 0
  );
  if (Date.now() - lastTime < windowMs) {
    return true;
  }
  return false;
}

export function isProjacktorActive(): boolean {
  try {
    if (isOverlayActiveOrRecent(800)) {
      return false;
    }

    const doc = getActiveDocument();
    if (!doc) return false;

    // If the document is hidden (e.g. Steam is suspended or minimized)
    if (doc.hidden) {
      markOverlayActive();
      return false;
    }

    const roots = Array.from(
      doc.querySelectorAll<HTMLElement>(
        ".projacktor-app-root, .projacktor-player-fullscreen, .projacktor-modal-root, .projacktor-movie-modal, [class*='projacktor-player'], [class*='projacktor-modal']"
      )
    );
    if (roots.length === 0) return false;

    const isInsideProjacktor = (el: Element | null) => {
      if (!el || el === doc.body || el === doc.documentElement) return true;
      return roots.some((r) => r.contains(el));
    };

    // Check if virtual gamepad focus is active outside Projacktor
    const gpfocus = doc.querySelector(".gpfocus");
    if (gpfocus && !isInsideProjacktor(gpfocus)) {
      markOverlayActive();
      return false;
    }

    // Check if DOM focus is on an external Steam element (e.g. Steam header / tray)
    const active = doc.activeElement;
    if (active && !isInsideProjacktor(active)) {
      markOverlayActive();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}


