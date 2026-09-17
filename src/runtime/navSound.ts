/**
 * Sound utility for Steam Deck Gamepad UI navigation
 * Plays native Steam tab transition sound / navigation sound
 */

let navAudio: HTMLAudioElement | null = null;
let lastPlayAt = 0;
const COOLDOWN_MS = 120;

function installSteamAudioGuard() {
  try {
    const store =
      (window as any).SteamUIStore?.m_GamepadUIAudioStore ||
      (window as any).opener?.SteamUIStore?.m_GamepadUIAudioStore;
    if (store && !store.__projacktorGuardInstalled) {
      store.__projacktorGuardInstalled = true;

      const origPlayNavSound = store.PlayNavSound;
      store.PlayNavSound = function (type: any, ...args: any[]) {
        // Type 25 is FailedNav (deck_ui_bumper_end_02.wav) - never play in Projacktor
        if (type === 25 || type === "FailedNav") return;
        // Suppress Steam's native tab sounds or immediate focus tick right around our tab transition
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
        return origPlayNavSound.apply(this, [type, ...args]);
      };

      const origPlayNavSoundInternal = store.PlayNavSoundInternal;
      store.PlayNavSoundInternal = function (type: any, ...args: any[]) {
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
        return origPlayNavSoundInternal.apply(this, [type, ...args]);
      };

      const apm = store.m_AudioPlaybackManager;
      if (apm && !apm.__projacktorGuardInstalled) {
        apm.__projacktorGuardInstalled = true;
        const origPlayAudioURL = apm.PlayAudioURL;
        apm.PlayAudioURL = function (url: string, ...args: any[]) {
          if (typeof url === "string" && url.includes("deck_ui_bumper_end")) {
            return;
          }
          const now = Date.now();
          if (now - lastPlayAt < 180) {
            if (
              typeof url === "string" &&
              (url.includes("deck_ui_tab_transition") ||
                url.includes("deck_ui_navigation"))
            ) {
              return;
            }
          }
          return origPlayAudioURL.apply(this, [url, ...args]);
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
