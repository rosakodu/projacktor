import { FC, memo, useEffect, useCallback, useRef } from "react";
import { Focusable } from "@decky/ui";
import { rpcInhibitSleep, rpcUninhibitSleep } from "../api";
import { subscribeControllerInput } from "../runtime/controllerInput";

interface MagicBlackOverlayProps {
  onDismiss: () => void;
}

export const MagicBlackOverlay: FC<MagicBlackOverlayProps> = memo(({ onDismiss }) => {
  const dismissedRef = useRef(false);
  const delayedReadyRef = useRef(false);

  const handleDismiss = useCallback(() => {
    if (!delayedReadyRef.current) return;
    if (dismissedRef.current) return;
    dismissedRef.current = true;

    // Release sleep inhibitor
    try {
      rpcUninhibitSleep();
    } catch {}

    // Restore SteamOS idle suspension if available
    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(true);
    } catch {}

    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    // 1. Inhibit sleep during MagicBlack background download
    try {
      rpcInhibitSleep();
    } catch {}

    try {
      (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(false);
    } catch {}

    // 2. Delay ready flag by 250ms to prevent the triggering button press from immediately dismissing
    const timer = setTimeout(() => {
      delayedReadyRef.current = true;
    }, 250);

    // 3. SteamUI NavigationManager catch-all gamepad listener (matches MagicBlackDecky)
    let releaseNavManager: (() => void) | null = null;
    try {
      const navManager = (window as any)?.SteamUIStore?.NavigationManager;
      if (navManager?.SetCatchAllGamepadInput) {
        const res = navManager.SetCatchAllGamepadInput(() => {
          handleDismiss();
        });
        if (typeof res === "function") {
          releaseNavManager = res;
        } else {
          releaseNavManager = () => {
            try {
              navManager.SetCatchAllGamepadInput(null);
            } catch {}
          };
        }
      }
    } catch {}

    // 4. Raw controller input listener
    const unController = subscribeControllerInput((e) => {
      if (e.pressed) {
        handleDismiss();
      }
    });

    // 5. DOM keyboard, pointer, and touch listeners
    const onKey = () => handleDismiss();
    const onPointer = () => handleDismiss();
    const onTouch = () => handleDismiss();

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("touchstart", onTouch, true);

    return () => {
      clearTimeout(timer);
      unController();
      if (releaseNavManager) releaseNavManager();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("touchstart", onTouch, true);

      try {
        rpcUninhibitSleep();
      } catch {}
      try {
        (window as any)?.SteamClient?.System?.SetIdleSuspensionEnabled?.(true);
      } catch {}
    };
  }, [handleDismiss]);

  return (
    <Focusable
      noFocusRing
      className="projacktor-magicblack-overlay"
      onActivate={handleDismiss}
      onClick={handleDismiss}
      onTouchStart={handleDismiss}
      onCancelButton={handleDismiss}
      onButtonDown={handleDismiss}
    >
      {null}
    </Focusable>
  );
});
