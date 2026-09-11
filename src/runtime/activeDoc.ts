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
            ".projacktor-root, .projacktor-nav-bar, .projacktor-card"
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
