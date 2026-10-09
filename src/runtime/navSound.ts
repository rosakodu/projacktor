/**
 * Sound utility for Steam Deck Gamepad UI navigation
 * Plays native Steam tab transition sound / navigation sound
 */

import { getUserSettings } from "./userSettings";

let navAudio: HTMLAudioElement | null = null;
let lastPlayAt = 0;
const COOLDOWN_MS = 120;

function isInsideProjacktor(): boolean {
  try {
    const doc = (window as any).document;
    if (
      doc?.querySelector?.(
        ".projacktor-app-root, .projacktor-nav-bar, .projacktor-card, .projacktor-content, .projacktor-settings-card, .projacktor-toggle-row"
      )
    ) {
      return true;
    }
    const wins = (window as any).SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        if (
          w?.BrowserWindow?.document?.querySelector?.(
            ".projacktor-app-root, .projacktor-nav-bar, .projacktor-card, .projacktor-content, .projacktor-settings-card, .projacktor-toggle-row"
          )
        ) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

function installSteamAudioGuard() {
  try {
    const stores: any[] = [];
    const pushStore = (s: any) => {
      if (s && !stores.includes(s)) stores.push(s);
    };

    pushStore((window as any).SteamUIStore?.m_GamepadUIAudioStore);
    pushStore((window as any).opener?.SteamUIStore?.m_GamepadUIAudioStore);
    pushStore((window as any).top?.SteamUIStore?.m_GamepadUIAudioStore);

    const wins = (window as any).SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        pushStore(w?.BrowserWindow?.SteamUIStore?.m_GamepadUIAudioStore);
      }
    }

    for (const store of stores) {
      if (!store) continue;

      // 1. Guard AudioPlaybackManager on prototype & instance
      const apm = store.m_AudioPlaybackManager;
      if (apm) {
        const apmProto = Object.getPrototypeOf(apm);
        const patchApm = (targetObj: any) => {
          if (!targetObj || targetObj.__projacktorGuardInstalled) return;
          targetObj.__projacktorGuardInstalled = true;
          const origPlay = targetObj.PlayAudioURL;
          targetObj.PlayAudioURL = function (url: string, ...args: any[]) {
            if (!getUserSettings().hapticAndSoundEnabled && isInsideProjacktor()) {
              return Promise.resolve();
            }
            if (typeof url === "string" && url.includes("deck_ui_bumper_end")) {
              return Promise.resolve();
            }
            const now = Date.now();
            if (now - lastPlayAt < 180) {
              if (
                typeof url === "string" &&
                (url.includes("deck_ui_tab_transition") || url.includes("deck_ui_navigation"))
              ) {
                return Promise.resolve();
              }
            }
            return origPlay ? origPlay.apply(this, [url, ...args]) : Promise.resolve();
          };
        };

        patchApm(apm);
        if (apmProto) patchApm(apmProto);
      }

      // 2. Guard Store prototype getter & instance for PlayNavSound
      if (!store.__projacktorGuardInstalled) {
        store.__projacktorGuardInstalled = true;

        const storeProto = Object.getPrototypeOf(store);
        if (storeProto) {
          const protoDesc = Object.getOwnPropertyDescriptor(storeProto, "PlayNavSound");
          if (protoDesc && protoDesc.configurable) {
            const origGetter = protoDesc.get;
            Object.defineProperty(storeProto, "PlayNavSound", {
              get() {
                const boundOrig = origGetter ? origGetter.call(this) : null;
                return function (this: any, type: any, ...args: any[]) {
                  if (!getUserSettings().hapticAndSoundEnabled && isInsideProjacktor()) {
                    return;
                  }
                  if (type === 25 || type === "FailedNav") return;
                  return boundOrig ? boundOrig.apply(this, [type, ...args]) : undefined;
                };
              },
              configurable: true,
            });
          }
        }

        const origPlayNavSound = store.PlayNavSound;
        store.PlayNavSound = function (type: any, ...args: any[]) {
          if (!getUserSettings().hapticAndSoundEnabled && isInsideProjacktor()) {
            return;
          }
          if (type === 25 || type === "FailedNav") return;
          const now = Date.now();
          if (now - lastPlayAt < 180) {
            if (
              type === 20 ||
              type === 15 ||
              type === "ChangeTabs" ||
              type === "BasicNav"
            ) {
              return;
            }
          }
          return origPlayNavSound ? origPlayNavSound.apply(this, [type, ...args]) : undefined;
        };

        const origPlayNavSoundInternal = store.PlayNavSoundInternal;
        store.PlayNavSoundInternal = function (type: any, ...args: any[]) {
          if (!getUserSettings().hapticAndSoundEnabled && isInsideProjacktor()) {
            return;
          }
          if (type === 25 || type === "FailedNav") return;
          const now = Date.now();
          if (now - lastPlayAt < 180) {
            if (
              type === 20 ||
              type === 15 ||
              type === "ChangeTabs" ||
              type === "BasicNav"
            ) {
              return;
            }
          }
          return origPlayNavSoundInternal ? origPlayNavSoundInternal.apply(this, [type, ...args]) : undefined;
        };
      }
    }
  } catch {}
}

export function suppressSteamNavSounds() {
  installSteamAudioGuard();
  try {
    const store =
      (window as any).SteamUIStore?.m_GamepadUIAudioStore ||
      (window as any).opener?.SteamUIStore?.m_GamepadUIAudioStore;
    if (store && typeof store.SuppressImminentNavSound === "function") {
      store.SuppressImminentNavSound();
      setTimeout(() => {
        try {
          store.SuppressImminentNavSound();
        } catch {}
      }, 15);
      setTimeout(() => {
        try {
          store.SuppressImminentNavSound();
        } catch {}
      }, 45);
      setTimeout(() => {
        try {
          store.SuppressImminentNavSound();
        } catch {}
      }, 90);
    }
  } catch {}
}

export function playNavSound() {
  if (!getUserSettings().hapticAndSoundEnabled) {
    return;
  }
  const now = Date.now();
  if (now - lastPlayAt < COOLDOWN_MS) {
    return;
  }
  lastPlayAt = now;

  // Suppress any native Steam GamepadUI nav sounds around this tab transition
  suppressSteamNavSounds();

  try {
    if (!navAudio) {
      navAudio = new Audio("/sounds/deck_ui_tab_transition_01.wav");
      navAudio.volume = 0.6;
      navAudio.onerror = () => {
        try {
          navAudio = new Audio("/sounds/deck_ui_navigation.wav");
          navAudio.volume = 0.6;
        } catch {}
      };
    }
    navAudio.currentTime = 0;
    const playPromise = navAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch {}
}

let cardNavAudio: HTMLAudioElement | null = null;
let lastCardPlayAt = 0;
const CARD_SOUND_COOLDOWN_MS = 60;

export function playCardNavSound() {
  if (!getUserSettings().hapticAndSoundEnabled) {
    return;
  }
  const now = Date.now();
  if (now - lastCardPlayAt < CARD_SOUND_COOLDOWN_MS) {
    return;
  }
  lastCardPlayAt = now;

  try {
    const store =
      (window as any).SteamUIStore?.m_GamepadUIAudioStore ||
      (window as any).opener?.SteamUIStore?.m_GamepadUIAudioStore;
    if (store && typeof store.PlayNavSound === "function") {
      store.PlayNavSound(15);
      return;
    }
  } catch {}

  try {
    if (!cardNavAudio) {
      cardNavAudio = new Audio("/sounds/deck_ui_navigation.wav");
      cardNavAudio.volume = 0.6;
    }
    cardNavAudio.currentTime = 0;
    const playPromise = cardNavAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch {}
}

export const playTabSound = playNavSound;

// Automatically install guard on module load
try {
  installSteamAudioGuard();
} catch {}
