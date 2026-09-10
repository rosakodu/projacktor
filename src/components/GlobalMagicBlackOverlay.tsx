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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "none",
        userSelect: "none",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
      onClick={onDismiss}
      onTouchStart={onDismiss}
      onPointerDown={onDismiss}
      onMouseDown={onDismiss}
    >
      <div className="projacktor-magicblack-banner">
        <div className="projacktor-magicblack-title">🌙 Экран выключен (MagicBlack OLED)</div>
        <div className="projacktor-magicblack-sub">
          Идёт фоновая загрузка • Нажмите любую кнопку для включения
        </div>
      </div>
    </div>
  );
});

export const GlobalMagicBlackOverlay: FC = memo(() => {
  const [active, setActive] = useState(isMagicBlack());
  const readyRef = useRef(false);

  useEffect(() => {
    return subscribeMagicBlack((newActive) => {
      setActive(newActive);
    });
  }, []);

  const dismiss = useCallback(() => {
    if (!readyRef.current) return;
    setMagicBlack(false);
  }, []);

  useEffect(() => {
    if (!active) {
      readyRef.current = false;
      return;
    }

    // Delay accepting dismiss by 180ms to prevent the activating button press from immediately dismissing
    const timer = setTimeout(() => {
      readyRef.current = true;
    }, 180);

    // 1. Hook SteamUI NavigationManager catch-all gamepad listener
    let releaseNav: (() => void) | null = null;
    try {
      const nav =
        (window as any)?.SteamUIStore?.NavigationManager ||
        (window.parent as any)?.SteamUIStore?.NavigationManager ||
        (window.top as any)?.SteamUIStore?.NavigationManager ||
        (window as any)?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamUIStore?.NavigationManager;

      if (nav?.SetCatchAllGamepadInput) {
        const res = nav.SetCatchAllGamepadInput(() => {
          dismiss();
        });
        if (typeof res === "function") {
          releaseNav = res;
        } else {
          releaseNav = () => {
            try {
              nav.SetCatchAllGamepadInput(null);
            } catch {}
          };
        }
      }
    } catch {}

    // 2. Raw controller input listener (D-pad, sticks, bumpers, triggers, face buttons, grips)
    const unController = subscribeControllerInput((e) => {
      if (e.pressed) {
        dismiss();
      }
    });

    // 3. DOM keyboard, touch, and pointer events across available windows
    const onAction = () => dismiss();

    const targets: EventTarget[] = [window];
    try {
      if (window.parent && window.parent !== window) targets.push(window.parent);
      if (window.top && window.top !== window && window.top !== window.parent) targets.push(window.top);
      const bpWin = (window as any)?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
      if (bpWin && !targets.includes(bpWin)) targets.push(bpWin);
    } catch {}

    for (const t of targets) {
      try {
        t.addEventListener("keydown", onAction as any, true);
        t.addEventListener("pointerdown", onAction as any, true);
        t.addEventListener("touchstart", onAction as any, true);
        t.addEventListener("mousedown", onAction as any, true);
      } catch {}
    }

    return () => {
      clearTimeout(timer);
      unController();
      if (releaseNav) releaseNav();
      for (const t of targets) {
        try {
          t.removeEventListener("keydown", onAction as any, true);
          t.removeEventListener("pointerdown", onAction as any, true);
          t.removeEventListener("touchstart", onAction as any, true);
          t.removeEventListener("mousedown", onAction as any, true);
        } catch {}
      }
    };
  }, [active, dismiss]);

  if (!active) return null;

  return <BlackBackdrop onDismiss={dismiss} />;
});
