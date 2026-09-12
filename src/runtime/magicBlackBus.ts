import { rpcInhibitSleep, rpcUninhibitSleep } from "../api";

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let activeState = false;

let savedFocusElement: HTMLElement | null = null;
let savedWindow: Window | null = null;

export function isMagicBlack(): boolean {
  return activeState;
}

function getAllSteamWindows(): Window[] {
  const wins: Window[] = [window];
  try {
    if (window.opener && !wins.includes(window.opener)) wins.push(window.opener);
    if (window.parent && window.parent !== window && !wins.includes(window.parent)) wins.push(window.parent);
    if (window.top && window.top !== window && !wins.includes(window.top)) wins.push(window.top);
    const uiStore = (window as any)?.SteamUIStore || (window.opener as any)?.SteamUIStore;
    const uiWins = uiStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(uiWins)) {
      for (const w of uiWins) {
        if (w?.BrowserWindow && !wins.includes(w.BrowserWindow)) wins.push(w.BrowserWindow);
      }
    }
    const bpWin = uiStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
    if (bpWin && !wins.includes(bpWin)) wins.push(bpWin);
  } catch {}
  return wins;
}

function findActiveElement(): { el: HTMLElement | null; win: Window | null } {
  try {
    const wins = getAllSteamWindows();
    for (const w of wins) {
      try {
        const el = w.document?.activeElement as HTMLElement;
        if (el && el !== w.document?.body && el.tagName !== "BODY") {
          return { el, win: w };
        }
      } catch {}
    }
  } catch {}
  return { el: null, win: null };
}

function restoreFocus(): void {
  // Give DOM a frame to remove overlay and CSS classes before restoring focus
  setTimeout(() => {
    try {
      const wins = getAllSteamWindows();
      let restored = false;

      // 1. Try saved element first if it is still attached to the document
      if (savedFocusElement && savedWindow && savedWindow.document?.contains(savedFocusElement)) {
        try {
          savedFocusElement.focus?.();
          savedFocusElement.classList.add("gpfocus");
          restored = true;
        } catch {}
      }

      // 2. Fallback: find any suitable focusable element in Projacktor or Steam
      if (!restored) {
        for (const w of wins) {
          try {
            const target = w.document?.querySelector<HTMLElement>(
              ".projacktor-lib-card, .projacktor-card, .projacktor-dl-poster-btn, .projacktor-magicblack-btn, [tabindex=\"0\"], button"
            );
            if (target) {
              target.focus?.();
              target.classList.add("gpfocus");
              restored = true;
              break;
            }
          } catch {}
        }
      }

      // 3. Notify SteamUI NavigationManager to regain focus
      for (const w of wins) {
        try {
          const nm = (w as any)?.SteamUIStore?.NavigationManager;
          if (nm) {
            nm.TakeFocusChangingIFrame?.();
            const tree = nm.GetActiveNavTree?.();
            tree?.TakeFocus?.(0);
          }
        } catch {}
      }
    } catch {}
    savedFocusElement = null;
    savedWindow = null;
  }, 50);
}

export function setMagicBlack(active: boolean): void {
  if (activeState === active) return;
  activeState = active;

  const wins = getAllSteamWindows();

  if (active) {
    // 1. Save currently focused element and window, then blur so no focus outline/border remains
    try {
      const found = findActiveElement();
      savedFocusElement = found.el;
      savedWindow = found.win;
      if (savedFocusElement && typeof savedFocusElement.blur === "function") {
        savedFocusElement.blur();
      }
    } catch {}

    // 2. Add global class to suppress any residual borders/focus-rings across all documents
    for (const w of wins) {
      try {
        w.document?.documentElement?.classList.add("projacktor-magicblack-active");
        w.document?.body?.classList.add("projacktor-magicblack-active");
      } catch {}
    }

    // 3. Inhibit system sleep and disable idle suspension
    try {
      rpcInhibitSleep();
    } catch {}
    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(false);
    } catch {}
  } else {
    // Dismissing MagicBlack:
    // 1. Remove active suppress classes across all windows
    for (const w of wins) {
      try {
        w.document?.documentElement?.classList.remove("projacktor-magicblack-active");
        w.document?.body?.classList.remove("projacktor-magicblack-active");
      } catch {}
    }

    // 2. Uninhibit sleep and re-enable idle suspension
    try {
      rpcUninhibitSleep();
    } catch {}
    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(true);
    } catch {}

    // 3. Restore focus to UI so gamepad buttons and navigation immediately work
    restoreFocus();
  }

  for (const listener of listeners) {
    try {
      listener(active);
    } catch {}
  }
}

export function subscribeMagicBlack(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
