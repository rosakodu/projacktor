/**
 * Haptic feedback utility for Steam Deck Gamepad UI and connected controllers.
 * Interacts with SteamClient.Input.TriggerSimpleHapticEvent and HTML5 Gamepad API
 * to provide tactile rumble on Steam Deck trackpads and external controllers.
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

/**
 * Returns active controller indices (Steam Deck hardware index 15, default slot 0,
 * and any connected external controllers recognized by Steam).
 */
export function getTargetControllers(): number[] {
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
    if (!cs) continue;
    if (Array.isArray(cs.m_controllerList)) {
      for (const c of cs.m_controllerList) {
        if (c && typeof c.nControllerIndex === "number") {
          indices.add(c.nControllerIndex);
        }
      }
    }
    if (typeof cs.GetControllers === "function") {
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

  // Steam Deck's internal controller index is 15. Default slot is 0.
  indices.add(15);
  indices.add(0);

  return Array.from(indices);
}

let lastHapticAt = 0;
const MIN_HAPTIC_INTERVAL_MS = 35; // prevent motor queue saturation

/**
 * Triggers a tactile haptic pulse on Steam Deck trackpads during navigation.
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
  let eType = 1; // 1 = Tick, 2 = Click
  let gain = 0;
  let vibPattern: number | number[] = 10;

  switch (strength) {
    case "light":
      intensity = 1;
      eType = 1; // silent tick
      gain = -2;
      vibPattern = 10;
      break;
    case "medium":
      intensity = 2;
      eType = 1; // tick
      gain = 0;
      vibPattern = 20;
      break;
    case "heavy":
      intensity = 2;
      eType = 2; // click
      gain = 0;
      vibPattern = 35;
      break;
    case "click":
      intensity = 2;
      eType = 2; // click
      gain = 0;
      vibPattern = [15, 25, 20];
      break;
  }

  // 1. Native SteamOS GamepadUI API (Steam Deck trackpads: 0=Left, 1=Right, 2=Both)
  try {
    const input = getInputApi();
    if (input && typeof input.TriggerSimpleHapticEvent === "function") {
      const controllers = getTargetControllers();
      // Pad locations: 0=Left, 1=Right, 2=Stereo pair (both)
      const locs = pad === "left" ? [0] : pad === "right" ? [1] : [2];

      for (const controllerIdx of controllers) {
        for (const loc of locs) {
          try {
            input.TriggerSimpleHapticEvent(controllerIdx, loc, eType, intensity, gain);
          } catch {}
        }
      }
    }
  } catch {}

  // 2. HTML5 Gamepad API fallback for external connected gamepads
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        const duration = strength === "heavy" ? 50 : strength === "medium" ? 35 : 20;
        const mag = strength === "heavy" ? 0.3 : strength === "medium" ? 0.18 : 0.08;
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

  // 3. Web Vibration API fallback
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(vibPattern);
    }
  } catch {}
}

/**
 * Triggers a spatial stereo heartbeat haptic pulse specifically tuned
 * for pulsating movie logos (completely silent: rolling tactile wave from left to right
 * trackpad on Steam Deck, dual-frequency motor depth on external gamepads, without any beeps or sounds).
 *
 * @param phase 'primary' for the main heartbeat peak (stereo wave + micro-thump), 'secondary' for the soft diastolic echo.
 */
export function triggerHeartbeatHaptic(phase: "primary" | "secondary" = "primary"): void {
  const isPrimary = phase === "primary";

  // 1. SteamOS Input API (Steam Deck trackpads: 0=Left, 1=Right, 2=Stereo pair)
  // Uses eType = 1 (Tick / SimpleHapticTickWorkItem) for clean, silent tactile physical feedback
  try {
    const input = getInputApi();
    if (input && typeof input.TriggerSimpleHapticEvent === "function") {
      const controllers = getTargetControllers();

      if (isPrimary) {
        // Phase 1 (Systole): Rolling spatial stereo wave from left to right trackpad + grounding closing thump
        for (const controllerIdx of controllers) {
          // Left trackpad initiates the pulse
          try {
            input.TriggerSimpleHapticEvent(controllerIdx, 0, 1, 2, 0);
          } catch {}

          // 24ms: Right trackpad responds (creates a physical tactile wave rolling across the Deck)
          setTimeout(() => {
            try {
              input.TriggerSimpleHapticEvent(controllerIdx, 1, 1, 2, 0);
            } catch {}
          }, 24);

          // 75ms: Grounding soft micro-thump on both trackpads (the "dub" of systolic heartbeat)
          setTimeout(() => {
            try {
              input.TriggerSimpleHapticEvent(controllerIdx, 2, 1, 1, -2);
            } catch {}
          }, 75);
        }
      } else {
        // Phase 2 (Diastole): Gentle resonant breath across both trackpads simultaneously
        for (const controllerIdx of controllers) {
          try {
            input.TriggerSimpleHapticEvent(controllerIdx, 2, 1, 1, -1);
          } catch {}
        }
      }
    }
  } catch (e) {
    console.warn("[Projacktor Haptics] Error in triggerHeartbeatHaptic SteamOS:", e);
  }

  // 2. HTML5 Gamepad API (External controllers: DualSense, Xbox, Switch Pro, etc.)
  // Heavy low-frequency motor on the left, refined high-frequency motor on the right
  try {
    if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
      const gamepads = navigator.getGamepads();
      if (gamepads) {
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          const actuator = (gp as any)?.vibrationActuator;
          if (actuator && typeof actuator.playEffect === "function") {
            if (isPrimary) {
              // Heavy motor initiates deep pulse
              actuator
                .playEffect("dual-rumble", {
                  startDelay: 0,
                  duration: 65,
                  strongMagnitude: 0.36,
                  weakMagnitude: 0.08,
                })
                .catch(() => {});

              // High-frequency motor adds crisp wave peak after 24ms
              setTimeout(() => {
                actuator
                  .playEffect("dual-rumble", {
                    startDelay: 0,
                    duration: 55,
                    strongMagnitude: 0.08,
                    weakMagnitude: 0.32,
                  })
                  .catch(() => {});
              }, 24);

              // Soft closing micro-echo after 75ms
              setTimeout(() => {
                actuator
                  .playEffect("dual-rumble", {
                    startDelay: 0,
                    duration: 35,
                    strongMagnitude: 0.04,
                    weakMagnitude: 0.14,
                  })
                  .catch(() => {});
              }, 75);
            } else {
              // Gentle diastolic breath
              actuator
                .playEffect("dual-rumble", {
                  startDelay: 0,
                  duration: 50,
                  strongMagnitude: 0.12,
                  weakMagnitude: 0.14,
                })
                .catch(() => {});
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Projacktor Haptics] Error in triggerHeartbeatHaptic Gamepad API:", e);
  }

  // 3. Web Vibration API fallback
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(isPrimary ? [28, 20, 16] : 18);
    }
  } catch {}
}
