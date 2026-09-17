/**
 * Haptic feedback utility for Steam Deck Gamepad UI.
 * Interacts with SteamClient.Input.TriggerSimpleHapticEvent / TriggerHapticPulse
 * to provide tactile rumble on Steam Deck trackpads.
 */

export type HapticStrength = "light" | "medium" | "heavy" | "click";
export type HapticPad = "both" | "left" | "right";

function getInputApi(): any {
  const g = globalThis as any;
  if (g.SteamClient?.Input?.TriggerSimpleHapticEvent || g.SteamClient?.Input?.TriggerHapticPulse) {
    return g.SteamClient.Input;
  }
  if (g.opener?.SteamClient?.Input?.TriggerSimpleHapticEvent || g.opener?.SteamClient?.Input?.TriggerHapticPulse) {
    return g.opener.SteamClient.Input;
  }
  try {
    const bp = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamClient?.Input;
    if (bp?.TriggerSimpleHapticEvent || bp?.TriggerHapticPulse) return bp;
  } catch {}
  try {
    const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        const inp = w?.BrowserWindow?.SteamClient?.Input;
        if (inp?.TriggerSimpleHapticEvent || inp?.TriggerHapticPulse) return inp;
      }
    }
  } catch {}
  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    if (docView?.SteamClient?.Input?.TriggerSimpleHapticEvent || docView?.SteamClient?.Input?.TriggerHapticPulse) {
      return docView.SteamClient.Input;
    }
    if (docView?.opener?.SteamClient?.Input?.TriggerSimpleHapticEvent || docView?.opener?.SteamClient?.Input?.TriggerHapticPulse) {
      return docView.opener.SteamClient.Input;
    }
  } catch {}
  return null;
}

let lastHapticAt = 0;
const MIN_HAPTIC_INTERVAL_MS = 35; // prevent motor queue saturation

/**
 * Triggers a tactile haptic pulse on Steam Deck trackpads.
 *
 * @param strength 'light' for ticks/steps, 'medium' for bumper jumps, 'heavy' for fast seek, 'click' for 100% notch.
 * @param pad 'both' (pad 2), 'left' (pad 3), or 'right' (pad 4).
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

  // Steam Deck pad indices: 2 = Both, 3 = Left trackpad, 4 = Right trackpad
  const padIdx = pad === "left" ? 3 : pad === "right" ? 4 : 2;

  let intensity = 1;
  let pulseMicroSec = 160;
  let vibPattern: number | number[] = 10;

  switch (strength) {
    case "light":
      intensity = 1;
      pulseMicroSec = 180;
      vibPattern = 10;
      break;
    case "medium":
      intensity = 2;
      pulseMicroSec = 340;
      vibPattern = 20;
      break;
    case "heavy":
      intensity = 3;
      pulseMicroSec = 520;
      vibPattern = 35;
      break;
    case "click":
      intensity = 3;
      pulseMicroSec = 420;
      vibPattern = [15, 25, 20];
      break;
  }

  // 1. Native SteamOS GamepadUI API
  try {
    const input = getInputApi();
    if (input) {
      if (typeof input.TriggerSimpleHapticEvent === "function") {
        input.TriggerSimpleHapticEvent(0, padIdx, 6, intensity, 0);
      } else if (typeof input.TriggerHapticPulse === "function") {
        input.TriggerHapticPulse(0, padIdx, pulseMicroSec, pulseMicroSec);
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
