import { rpcInhibitSleep, rpcUninhibitSleep } from "../api";

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let activeState = false;

export function isMagicBlack(): boolean {
  return activeState;
}

export function setMagicBlack(active: boolean): void {
  if (activeState === active) return;
  activeState = active;

  if (active) {
    // 1. Immediately remove focus from any element so no focus outline/border remains
    try {
      if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === "function") {
        (document.activeElement as HTMLElement).blur();
      }
    } catch {}

    // 2. Also reset focus in SteamUI NavigationManager if available
    try {
      const nav =
        (window as any)?.SteamUIStore?.NavigationManager ||
        (window.parent as any)?.SteamUIStore?.NavigationManager ||
        (window.top as any)?.SteamUIStore?.NavigationManager;
      nav?.ResetFocus?.();
    } catch {}

    // 3. Add global class to suppress any residual borders/focus-rings across all documents
    try {
      document.documentElement.classList.add("projacktor-magicblack-active");
      document.body.classList.add("projacktor-magicblack-active");
      if (window.parent && window.parent.document) {
        window.parent.document.documentElement.classList.add("projacktor-magicblack-active");
        window.parent.document.body.classList.add("projacktor-magicblack-active");
      }
    } catch {}

    // 4. Inhibit system sleep and disable idle suspension
    try {
      rpcInhibitSleep();
    } catch {}
    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(false);
    } catch {}
  } else {
    // Dismissing MagicBlack
    try {
      document.documentElement.classList.remove("projacktor-magicblack-active");
      document.body.classList.remove("projacktor-magicblack-active");
      if (window.parent && window.parent.document) {
        window.parent.document.documentElement.classList.remove("projacktor-magicblack-active");
        window.parent.document.body.classList.remove("projacktor-magicblack-active");
      }
    } catch {}
    try {
      rpcUninhibitSleep();
    } catch {}
    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(true);
    } catch {}
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
