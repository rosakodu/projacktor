import { callable } from "@decky/api";
import { clearLocalCache } from "../api/cache";

const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
const rpcSaveSettings = callable<[string], boolean>("save_settings");

export interface UserSettings {
  hapticAndSoundEnabled: boolean;
  kidsMode: boolean;
}

const LOCAL_STORAGE_SETTINGS_KEY = "projacktor_user_prefs";

const defaultSettings: UserSettings = {
  hapticAndSoundEnabled: true,
  kidsMode: false,
};

let currentSettings: UserSettings = (() => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        hapticAndSoundEnabled:
          typeof parsed.hapticAndSoundEnabled === "boolean"
            ? parsed.hapticAndSoundEnabled
            : defaultSettings.hapticAndSoundEnabled,
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
  currentSettings = { ...currentSettings, [key]: value };

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
      if (typeof backend.haptic_and_sound_enabled === "boolean") {
        if (updated.hapticAndSoundEnabled !== backend.haptic_and_sound_enabled) {
          updated.hapticAndSoundEnabled = backend.haptic_and_sound_enabled;
          changed = true;
        }
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
