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

export function isProjacktorActive(): boolean {
  try {
    const doc = getActiveDocument();
    if (!doc) return false;

    // If the document is hidden (e.g. Steam is suspended or minimized)
    if (doc.hidden) return false;

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
      return false;
    }

    // Check if DOM focus is on an external Steam element (e.g. Steam header / tray)
    const active = doc.activeElement;
    if (active && !isInsideProjacktor(active)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

