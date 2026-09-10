import { FC, memo, useEffect, useState, useCallback, useRef } from "react";
import { isMagicBlack, setMagicBlack, subscribeMagicBlack } from "../runtime/magicBlackBus";
import { subscribeControllerInput } from "../runtime/controllerInput";
import { useUIComposition, UIComposition } from "../runtime/uiComposition";

const BlackBackdrop: FC<{ onDismiss: () => void }> = memo(({ onDismiss }) => {
  // Request Gamescope Overlay composition when mounted
  useUIComposition(UIComposition.Overlay);

  return (
    <div
      className="projacktor-magicblack-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        background: "#000000",
        zIndex: 2147483647,
        cursor: "none",
        userSelect: "none",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
      onClick={onDismiss}
      onTouchStart={onDismiss}
      onPointerDown={onDismiss}
      onMouseDown={onDismiss}
    />
  );
});

function getNavManager(): any {
  try {
    const candidates: any[] = [
      (window as any)?.SteamUIStore?.NavigationManager,
      (window.opener as any)?.SteamUIStore?.NavigationManager,
      (window.parent as any)?.SteamUIStore?.NavigationManager,
      (window.top as any)?.SteamUIStore?.NavigationManager,
      (window as any)?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamUIStore?.NavigationManager,
      (window.opener as any)?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamUIStore?.NavigationManager,
    ];
    const uiStore = (window as any)?.SteamUIStore || (window.opener as any)?.SteamUIStore;
    const wins = uiStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        if (w?.BrowserWindow?.SteamUIStore?.NavigationManager) {
          candidates.push(w.BrowserWindow.SteamUIStore.NavigationManager);
        }
      }
    }
    return candidates.find((nm) => nm && typeof nm.SetCatchAllGamepadInput === "function") || null;
  } catch {
    return null;
  }
}

export const GlobalMagicBlackOverlay: FC = memo(() => {
  const [active, setActive] = useState(isMagicBlack());
  const readyRef = useRef(false);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return subscribeMagicBlack((newActive) => {
      setActive(newActive);
    });
  }, []);

  const dismiss = useCallback(() => {
    if (!readyRef.current) return;
    // Synchronously release gamepad capture and DOM listeners BEFORE changing state
    if (teardownRef.current) {
      teardownRef.current();
      teardownRef.current = null;
    }
    setMagicBlack(false);
  }, []);

  useEffect(() => {
    if (!active) {
      readyRef.current = false;
      return;
    }

    // Delay accepting dismiss by 200ms to prevent the activating button press from immediately waking
    const timer = setTimeout(() => {
      readyRef.current = true;
    }, 200);

    const cleanupFns: Array<() => void> = [];

    // 1. Hook SteamUI NavigationManager catch-all gamepad listener
    try {
      const nav = getNavManager();
      if (nav?.SetCatchAllGamepadInput) {
        // Sanitize: ensure no nulls or non-functions exist in the array
        if (Array.isArray(nav.m_rgCatchAllGamepadInput)) {
          nav.m_rgCatchAllGamepadInput = nav.m_rgCatchAllGamepadInput.filter(
            (fn: any) => typeof fn === "function"
          );
        }

        const catchAllHandler = (_btn: any, pressed: any) => {
          if (pressed === false || pressed === 0) return false;
          dismiss();
          return true; // suppress the wake-up button press from activating UI underneath
        };

        const res = nav.SetCatchAllGamepadInput(catchAllHandler);

        cleanupFns.push(() => {
          try {
            if (res && typeof res.Unregister === "function") {
              res.Unregister();
            } else if (typeof res === "function") {
              res();
            }
          } catch {}
          try {
            if (Array.isArray(nav.m_rgCatchAllGamepadInput)) {
              nav.m_rgCatchAllGamepadInput = nav.m_rgCatchAllGamepadInput.filter(
                (fn: any) => typeof fn === "function" && fn !== catchAllHandler
              );
            }
          } catch {}
        });
      }
    } catch {}

    // 2. Raw controller input listener (D-pad, sticks, bumpers, triggers, face buttons, grips)
    const unController = subscribeControllerInput((e) => {
      if (e.pressed) {
        dismiss();
      }
    });
    cleanupFns.push(unController);

    // 3. DOM keyboard, touch, and pointer events across available windows
    const onAction = () => dismiss();

    const targets: EventTarget[] = [window];
    try {
      if (window.opener && !targets.includes(window.opener)) targets.push(window.opener);
      if (window.parent && window.parent !== window && !targets.includes(window.parent)) targets.push(window.parent);
      if (window.top && window.top !== window && !targets.includes(window.top)) targets.push(window.top);
      const uiStore = (window as any)?.SteamUIStore || (window.opener as any)?.SteamUIStore;
      const bpWin = uiStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
      if (bpWin && !targets.includes(bpWin)) targets.push(bpWin);
      const uiWins = uiStore?.WindowStore?.SteamUIWindows;
      if (Array.isArray(uiWins)) {
        for (const w of uiWins) {
          if (w?.BrowserWindow && !targets.includes(w.BrowserWindow)) targets.push(w.BrowserWindow);
        }
      }
    } catch {}

    for (const t of targets) {
      try {
        t.addEventListener("keydown", onAction as any, true);
        t.addEventListener("pointerdown", onAction as any, true);
        t.addEventListener("touchstart", onAction as any, true);
        t.addEventListener("mousedown", onAction as any, true);
      } catch {}
    }

    cleanupFns.push(() => {
      for (const t of targets) {
        try {
          t.removeEventListener("keydown", onAction as any, true);
          t.removeEventListener("pointerdown", onAction as any, true);
          t.removeEventListener("touchstart", onAction as any, true);
          t.removeEventListener("mousedown", onAction as any, true);
        } catch {}
      }
    });

    const runCleanup = () => {
      clearTimeout(timer);
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {}
      }
    };

    teardownRef.current = runCleanup;

    return () => {
      runCleanup();
      teardownRef.current = null;
    };
  }, [active, dismiss]);

  if (!active) return null;

  return <BlackBackdrop onDismiss={dismiss} />;
});
