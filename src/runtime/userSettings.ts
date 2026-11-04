import { callable } from "@decky/api";
import { clearLocalCache } from "../api/cache";

const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
const rpcSaveSettings = callable<[string], boolean>("save_settings");

export interface UserSettings {
  hapticAndSoundEnabled: boolean;
  soundEffectsEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  kidsMode: boolean;
}

const LOCAL_STORAGE_SETTINGS_KEY = "projacktor_user_prefs";

const defaultSettings: UserSettings = {
  hapticAndSoundEnabled: true,
  soundEffectsEnabled: true,
  hapticFeedbackEnabled: true,
  kidsMode: false,
};

let currentSettings: UserSettings = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const leg =
        typeof parsed.hapticAndSoundEnabled === "boolean"
          ? parsed.hapticAndSoundEnabled
          : defaultSettings.hapticAndSoundEnabled;
      const sound =
        typeof parsed.soundEffectsEnabled === "boolean"
          ? parsed.soundEffectsEnabled
          : leg;
      const haptic =
        typeof parsed.hapticFeedbackEnabled === "boolean"
          ? parsed.hapticFeedbackEnabled
          : leg;
      return {
        hapticAndSoundEnabled: sound && haptic,
        soundEffectsEnabled: sound,
        hapticFeedbackEnabled: haptic,
        kidsMode:
          typeof parsed.kidsMode === "boolean"
            ? parsed.kidsMode
            : defaultSettings.kidsMode,
      };
    }
  } catch {}
  return { ...defaultSettings };
})();

const listeners = new Set<(s: UserSettings) => void>();

export function getUserSettings(): UserSettings {
  return currentSettings;
}

export function subscribeUserSettings(cb: (s: UserSettings) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners() {
  const snapshot = { ...currentSettings };
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      console.error("[userSettings] listener error:", e);
    }
  });
}

export function setUserSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): void {
  if (currentSettings[key] === value) return;
  const oldKidsMode = currentSettings.kidsMode;
  const updated = { ...currentSettings, [key]: value };

  if (key === "soundEffectsEnabled") {
    updated.hapticAndSoundEnabled = Boolean(value) && updated.hapticFeedbackEnabled;
  } else if (key === "hapticFeedbackEnabled") {
    updated.hapticAndSoundEnabled = updated.soundEffectsEnabled && Boolean(value);
  } else if (key === "hapticAndSoundEnabled") {
    updated.soundEffectsEnabled = Boolean(value);
    updated.hapticFeedbackEnabled = Boolean(value);
  }

  currentSettings = updated;

  try {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(currentSettings));
  } catch {}

  notifyListeners();

  // Если меняется детский режим - сбрасываем кэш каталога, чтобы витрина сразу отфильтровалась
  if (key === "kidsMode" && oldKidsMode !== value) {
    clearLocalCache();
  }

  // Синхронизируем с бэкендом
  rpcSaveSettings(
    JSON.stringify({
      haptic_and_sound_enabled: currentSettings.hapticAndSoundEnabled,
      sound_effects_enabled: currentSettings.soundEffectsEnabled,
      haptic_feedback_enabled: currentSettings.hapticFeedbackEnabled,
      kids_mode: currentSettings.kidsMode,
    })
  ).catch(() => {});
}

export async function initUserSettings(): Promise<UserSettings> {
  try {
    const backend = await rpcGetSettings();
    if (backend) {
      let changed = false;
      const updated = { ...currentSettings };
      const legacyVal =
        typeof backend.haptic_and_sound_enabled === "boolean"
          ? backend.haptic_and_sound_enabled
          : undefined;

      if (typeof backend.sound_effects_enabled === "boolean") {
        if (updated.soundEffectsEnabled !== backend.sound_effects_enabled) {
          updated.soundEffectsEnabled = backend.sound_effects_enabled;
          changed = true;
        }
      } else if (legacyVal !== undefined) {
        if (updated.soundEffectsEnabled !== legacyVal) {
          updated.soundEffectsEnabled = legacyVal;
          changed = true;
        }
      }

      if (typeof backend.haptic_feedback_enabled === "boolean") {
        if (updated.hapticFeedbackEnabled !== backend.haptic_feedback_enabled) {
          updated.hapticFeedbackEnabled = backend.haptic_feedback_enabled;
          changed = true;
        }
      } else if (legacyVal !== undefined) {
        if (updated.hapticFeedbackEnabled !== legacyVal) {
          updated.hapticFeedbackEnabled = legacyVal;
          changed = true;
        }
      }

      const syncLegacy = updated.soundEffectsEnabled && updated.hapticFeedbackEnabled;
      if (updated.hapticAndSoundEnabled !== syncLegacy) {
        updated.hapticAndSoundEnabled = syncLegacy;
        changed = true;
      }

      if (typeof backend.kids_mode === "boolean") {
        if (updated.kidsMode !== backend.kids_mode) {
          updated.kidsMode = backend.kids_mode;
          changed = true;
        }
      }
      if (changed) {
        currentSettings = updated;
        try {
          localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(currentSettings));
        } catch {}
        notifyListeners();
      }
    }
  } catch {}
  return currentSettings;
}
