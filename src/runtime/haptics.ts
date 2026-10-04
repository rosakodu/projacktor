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

function getTargetControllers(): number[] {
  const g = globalThis as any;
  const csCandidates = [
    g.ControllerStore,
    g.opener?.ControllerStore,
    g.parent?.ControllerStore,
    g.top?.ControllerStore,
    g.__projacktor_input_bp_view?.ControllerStore,
    g.__projacktor_input_bp_view?.opener?.ControllerStore,
  ];

  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    if (docView) {
      csCandidates.push(docView.ControllerStore);
      csCandidates.push(docView.opener?.ControllerStore);
      csCandidates.push(docView.parent?.ControllerStore);
      csCandidates.push(docView.top?.ControllerStore);
    }
  } catch {}

  const indices = new Set<number>();

  for (const cs of csCandidates) {
    if (cs && typeof cs.GetControllers === "function") {
      try {
        const list = cs.GetControllers();
        if (Array.isArray(list)) {
          for (const c of list) {
            if (c && typeof c.nControllerIndex === "number") {
              indices.add(c.nControllerIndex);
            }
          }
        }
      } catch {}
    }
  }

  // Always include native Steam Deck hardware index 15 and primary slots 0, 1
  indices.add(15);
  indices.add(0);

  return Array.from(indices);
}

let lastHapticAt = 0;
const MIN_HAPTIC_INTERVAL_MS = 35; // prevent motor queue saturation

/**
 * Triggers a tactile haptic pulse on Steam Deck trackpads and connected gamepads.
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
  let pulseMicroSec = 25000;
  let eType = 1; // 1 = Tick, 2 = Click, 6 = Rumble
  let gain = 0;
  let vibPattern: number | number[] = 10;

  switch (strength) {
    case "light":
      intensity = 1;
      pulseMicroSec = 20000;
      eType = 1; // tick
      gain = -3;
      vibPattern = 10;
      break;
    case "medium":
      intensity = 2;
      pulseMicroSec = 35000;
      eType = 2; // click
      gain = -1;
      vibPattern = 20;
      break;
    case "heavy":
      intensity = 3;
      pulseMicroSec = 25000;
      eType = 2; // strong click
      gain = 0;
      vibPattern = 35;
      break;
    case "click":
      intensity = 2;
      pulseMicroSec = 25000;
      eType = 2; // click
      gain = 0;
      vibPattern = [15, 25, 20];
      break;
  }

  // 1. Native SteamOS GamepadUI API (Steam Deck trackpads & Steam Input controllers)
  try {
    const input = getInputApi();
    if (input) {
      const controllers = getTargetControllers();
      // pad locations: 1=left, 2=right, [1, 2]=both
      const locs = pad === "left" ? [1] : pad === "right" ? [2] : [1, 2];

      for (const controllerIdx of controllers) {
        for (const loc of locs) {
          try {
            if (typeof input.ForceSimpleHapticEvent === "function") {
              input.ForceSimpleHapticEvent(controllerIdx, loc, eType, intensity, gain);
            }
          } catch {}
          try {
            if (typeof input.TriggerSimpleHapticEvent === "function") {
              input.TriggerSimpleHapticEvent(controllerIdx, loc, eType, intensity, gain);
            }
          } catch {}
          try {
            if (typeof input.TriggerHapticPulse === "function") {
              input.TriggerHapticPulse(controllerIdx, loc, pulseMicroSec, pulseMicroSec);
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Native SteamOS GamepadUI Navigation Sound
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

  // 3. HTML5 Gamepad API fallback for external controllers
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        const duration = strength === "heavy" ? 60 : strength === "medium" ? 40 : 25;
        const mag = strength === "heavy" ? 0.35 : strength === "medium" ? 0.2 : 0.1;
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          const actuator = (gp as any)?.vibrationActuator;
          if (actuator && typeof actuator.playEffect === "function") {
            try {
              actuator.playEffect("dual-rumble", {
                startDelay: 0,
                duration,
                weakMagnitude: mag,
                strongMagnitude: mag * 0.4,
              });
            } catch {}
          }
        }
      }
    }
  } catch {}

  // 4. Standard Web Vibration API fallback
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(vibPattern);
    }
  } catch {}
}

/**
 * Triggers a soft, subtle heartbeat haptic pulse specifically tuned
 * for pulsating logos (completely silent: gentle tactile impulse on both trackpads,
 * without any beeps, tones, mechanical loud clicks, or audio sounds).
 * Works across Steam Deck trackpads, connected gamepads (DualSense/Xbox), and Web Vibration.
 *
 * @param phase 'primary' for the main heartbeat peak, 'secondary' for the softer follow-up peak.
 */
export function triggerHeartbeatHaptic(phase: "primary" | "secondary" = "primary"): void {
  const isPrimary = phase === "primary";

  // 1. SteamOS Input API (Steam Deck trackpads & Steam Input connected controllers)
  // Uses eType = 1 (Tick - SimpleHapticTickWorkItem), which gives a pure tactile tap with NO acoustic beeping/tone
  try {
    const input = getInputApi();
    if (input) {
      const controllers = getTargetControllers();
      // Pads 1 (left) and 2 (right)
      const pads = [1, 2];

      const fireTick = (intensity: number, gain: number) => {
        for (const controllerIdx of controllers) {
          for (const pad of pads) {
            try {
              if (typeof input.ForceSimpleHapticEvent === "function") {
                input.ForceSimpleHapticEvent(controllerIdx, pad, 1, intensity, gain);
              }
            } catch {}
            try {
              if (typeof input.TriggerSimpleHapticEvent === "function") {
                input.TriggerSimpleHapticEvent(controllerIdx, pad, 1, intensity, gain);
              }
            } catch {}
          }
        }
      };

      if (isPrimary) {
        // Primary heartbeat beat: velvety double-thump (main pulse + micro follow-up after 35ms)
        fireTick(2, -2);
        setTimeout(() => {
          fireTick(1, -5);
        }, 35);
      } else {
        // Secondary heartbeat beat: single soft pulse
        fireTick(1, -4);
      }
    }
  } catch (e) {
    console.warn("[Projacktor Haptics] Error in triggerHeartbeatHaptic:", e);
  }

  // 2. HTML5 Gamepad API (External controllers: DualSense, Xbox, Switch Pro, etc.)
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        const duration = isPrimary ? 65 : 40;
        const weak = isPrimary ? 0.22 : 0.12; // gentle high-frequency motor
        const strong = isPrimary ? 0.08 : 0.03; // delicate low-frequency rumble

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
      navigator.vibrate(isPrimary ? 18 : 10);
    }
  } catch {}
}
