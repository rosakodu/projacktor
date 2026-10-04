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

  // 2. Native SteamOS GamepadUI Haptic & Sound integration
  try {
    const g = globalThis as any;
    const store =
      g.SteamUIStore?.m_GamepadUIAudioStore ||
      g.opener?.SteamUIStore?.m_GamepadUIAudioStore ||
      g.parent?.SteamUIStore?.m_GamepadUIAudioStore;
    if (store && typeof store.PlayNavSound === "function") {
      const soundType = strength === "click" || strength === "heavy" ? 10 : 15;
      store.PlayNavSound(soundType);
    }
  } catch {}

  // 3. Standard Web Vibration API fallback / complement
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(vibPattern);
    }
  } catch {}
}

/**
 * Triggers a soft, subtle heartbeat haptic pulse specifically tuned
 * for pulsating logos (without playing navigation UI audio sounds).
 * Works across Steam Deck trackpads, connected gamepads (DualSense/Xbox), and Web Vibration.
 *
 * @param phase 'primary' for the main heartbeat peak, 'secondary' for the softer follow-up peak.
 */
export function triggerHeartbeatHaptic(phase: "primary" | "secondary" = "primary"): void {
  const isPrimary = phase === "primary";
  // Microseconds for trackpad actuator pulse: very delicate, velvety tick
  const pulseMicroSec = isPrimary ? 180 : 110;
  const intensity = 1;
  const eType = 3; // light tick

  // 1. SteamOS Input API (Steam Deck trackpads & Steam Input connected controllers)
  try {
    const input = getInputApi();
    if (input) {
      const locs = [3, 1, 2]; // both, left, right trackpads/actuators
      // Send to controller index 0 (main Steam Deck / primary gamepad)
      // and index 1-2 if external controllers are attached via Steam Input
      for (let controllerIdx = 0; controllerIdx <= 2; controllerIdx++) {
        if (typeof input.TriggerHapticPulse === "function") {
          for (const loc of locs) {
            try {
              input.TriggerHapticPulse(controllerIdx, loc, pulseMicroSec, pulseMicroSec);
            } catch {}
          }
        }
        if (typeof input.TriggerSimpleHapticEvent === "function") {
          for (const loc of locs) {
            try {
              input.TriggerSimpleHapticEvent(controllerIdx, loc, eType, intensity, 0);
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 2. HTML5 Gamepad API (External controllers: DualSense, Xbox, Switch Pro, etc.)
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        const duration = isPrimary ? 60 : 40;
        const weak = isPrimary ? 0.12 : 0.07; // high-frequency delicate motor
        const strong = isPrimary ? 0.03 : 0.01; // barely perceptible low rumble

        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          const actuator = (gp as any)?.vibrationActuator;
          if (actuator && typeof actuator.playEffect === "function") {
            try {
              actuator.playEffect("dual-rumble", {
                startDelay: 0,
                duration,
                weakMagnitude: weak,
                strongMagnitude: strong,
              });
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 3. Web Vibration API fallback
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(isPrimary ? 12 : 8);
    }
  } catch {}
}
