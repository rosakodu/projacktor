/**
 * Haptic feedback utility for Steam Deck Gamepad UI.
 * Interacts with SteamClient.Input.TriggerSimpleHapticEvent / TriggerHapticPulse
 * to provide tactile rumble on Steam Deck trackpads.
 */

export type HapticStrength = "light" | "medium" | "heavy" | "click";
export type HapticPad = "both" | "left" | "right";

function getInputApi(): any {
  const g = globalThis as any;
  const candidates: any[] = [];
  const tryPush = (v: any) => {
    if (v && (typeof v.TriggerSimpleHapticEvent === "function" || typeof v.TriggerHapticPulse === "function")) {
      candidates.push(v);
    }
  };

  tryPush(g.opener?.SteamClient?.Input);
  tryPush(g.parent?.opener?.SteamClient?.Input);
  tryPush(g.top?.opener?.SteamClient?.Input);
  tryPush(g.__projacktor_input_bp_view?.opener?.SteamClient?.Input);
  tryPush(g.__projacktor_input_bp_view?.SteamClient?.Input);
  tryPush(g.SteamClient?.Input);

  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    if (docView) {
      tryPush(docView.opener?.SteamClient?.Input);
      tryPush(docView.parent?.opener?.SteamClient?.Input);
      tryPush(docView.top?.opener?.SteamClient?.Input);
      tryPush(docView.SteamClient?.Input);
    }
  } catch {}

  try {
    const ui = g.SteamUIStore || g.opener?.SteamUIStore;
    const wins = ui?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        tryPush(w?.BrowserWindow?.opener?.SteamClient?.Input);
        tryPush(w?.BrowserWindow?.SteamClient?.Input);
      }
    }
  } catch {}

  return candidates[0] || null;
}

let lastHapticAt = 0;
const MIN_HAPTIC_INTERVAL_MS = 35; // prevent motor queue saturation

/**
 * Triggers a tactile haptic pulse on Steam Deck trackpads.
 *
 * @param strength 'light' for ticks/steps, 'medium' for bumper jumps, 'heavy' for fast seek, 'click' for 100% notch.
 * @param pad 'both' (both pads), 'left' (left trackpad), or 'right' (right trackpad).
 * @param force bypass throttle check (e.g. for definite notch click).
 */
export function triggerHaptic(
  strength: HapticStrength = "light",
  pad: HapticPad = "both",
  force: boolean = false
): void {
  const now = performance.now();
  if (!force && now - lastHapticAt < MIN_HAPTIC_INTERVAL_MS) {
    return;
  }
  lastHapticAt = now;

  let intensity = 1;
  let pulseMicroSec = 180;
  let eType = 3; // default: tick (3)
  let vibPattern: number | number[] = 10;

  switch (strength) {
    case "light":
      intensity = 1;
      pulseMicroSec = 200;
      eType = 3; // tick
      vibPattern = 10;
      break;
    case "medium":
      intensity = 2;
      pulseMicroSec = 360;
      eType = 6; // rumble
      vibPattern = 20;
      break;
    case "heavy":
      intensity = 3;
      pulseMicroSec = 540;
      eType = 6; // strong rumble
      vibPattern = 35;
      break;
    case "click":
      intensity = 3;
      pulseMicroSec = 450;
      eType = 2; // click
      vibPattern = [15, 25, 20];
      break;
  }

  // 1. Native SteamOS GamepadUI API
  try {
    const input = getInputApi();
    if (input) {
      // Determine pad locations (supports 1=left, 2=right, 3=both and legacy indices)
      const locs = pad === "left" ? [1, 3] : pad === "right" ? [2, 4] : [3, 1, 2];

      if (typeof input.TriggerSimpleHapticEvent === "function") {
        for (const loc of locs) {
          try {
            input.TriggerSimpleHapticEvent(0, loc, eType, intensity, 0);
          } catch {}
        }
      }
      if (typeof input.TriggerHapticPulse === "function") {
        for (const loc of locs) {
          try {
            input.TriggerHapticPulse(0, loc, pulseMicroSec, pulseMicroSec);
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Standard Web Vibration API fallback / complement
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(vibPattern);
    }
  } catch {}
}
