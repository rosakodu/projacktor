/**
 * screensaverInhibitor.ts
 * Подавление заставки Steam Big Picture и ухода экрана в спящий режим во время просмотра видео.
 *
 * 1. Временное отключение idle-таймеров Steam (system_idle_screensaver_*_sec = 0) с восстановлением при паузе/выходе.
 * 2. Реактивное подавление заставки через Steam Screensaver Service (ForceScreensaver({ enabled: false })).
 * 3. W3C Screen Wake Lock API (navigator.wakeLock.request('screen')).
 *
 * Никаких искусственных событий мыши (0% нагрузки на CPU, UI контролов не всплывает).
 */

import { useEffect, useRef } from "react";

let screensaverService: any = null;
let settingsModule: any = null;
let activeNotificationHandle: any = null;
let wakeLockSentinel: any = null;
let isInhibiting = false;
let originalSettings: Record<string, number | undefined> = {};
let settingsOverridden = false;

/**
 * Получение webpackChunksteamui из текущего окна или родительского/opener (SharedJSContext)
 */
function getWebpackChunk(): any {
  const win = typeof window !== "undefined" ? (window as any) : null;
  return (
    win?.webpackChunksteamui ||
    win?.opener?.webpackChunksteamui ||
    win?.parent?.webpackChunksteamui ||
    win?.top?.webpackChunksteamui ||
    (document?.defaultView as any)?.webpackChunksteamui ||
    (document?.defaultView as any)?.opener?.webpackChunksteamui
  );
}

/**
 * Получение внутренних сервисов Steam Screensaver и настроек (прямой импорт по ID без перебора модулей)
 */
export function getSteamModules(): { screensaverService: any; settingsModule: any } {
  if (screensaverService && settingsModule) {
    return { screensaverService, settingsModule };
  }
  try {
    const chunk = getWebpackChunk();
    if (chunk && typeof chunk.push === "function") {
      chunk.push([[Symbol()], {}, (require: any) => {
        try {
          if (!screensaverService) {
            screensaverService = require("2099")?.b3;
          }
        } catch {}
        try {
          if (!settingsModule) {
            settingsModule = require("39828");
          }
        } catch {}
      }]);
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] Failed to load Steam modules:", e);
  }
  return { screensaverService, settingsModule };
}

/**
 * Временное отключение idle таймеров Steam (0 = Disabled в Steam)
 */
function overrideIdleSettings() {
  if (settingsOverridden) return;
  try {
    const { settingsModule } = getSteamModules();
    if (settingsModule?.qt && settingsModule?.rV?.clientSettings) {
      const keys = [
        "system_idle_screensaver_ac_sec",
        "system_idle_screensaver_battery_sec",
        "system_idle_suspend_ac_sec",
        "system_idle_suspend_battery_sec",
      ];
      originalSettings = {};
      for (const key of keys) {
        const val = settingsModule.rV.clientSettings[key];
        if (typeof val === "number" && val > 0) {
          originalSettings[key] = val;
          settingsModule.qt(key, 0);
        }
      }
      settingsOverridden = true;
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] overrideIdleSettings failed:", e);
  }
}

/**
 * Восстановление оригинальных настроек idle таймеров Steam
 */
function restoreIdleSettings() {
  if (!settingsOverridden) return;
  try {
    const { settingsModule } = getSteamModules();
    if (settingsModule?.qt) {
      for (const [key, val] of Object.entries(originalSettings)) {
        if (typeof val === "number") {
          settingsModule.qt(key, val);
        }
      }
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] restoreIdleSettings failed:", e);
  } finally {
    originalSettings = {};
    settingsOverridden = false;
  }
}

/**
 * Запрос W3C Screen Wake Lock
 */
async function acquireWakeLock() {
  try {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockSentinel.addEventListener?.("release", () => {
        wakeLockSentinel = null;
      });
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] wakeLock.request failed:", e);
  }
}

/**
 * Освобождение W3C Screen Wake Lock
 */
function releaseWakeLock() {
  try {
    if (wakeLockSentinel) {
      wakeLockSentinel.release?.().catch(() => {});
      wakeLockSentinel = null;
    }
  } catch {}
}

/**
 * Настройка реактивного подавления при попытке запуска заставки Steam
 */
function setupActiveNotification() {
  if (activeNotificationHandle) return;
  const { screensaverService } = getSteamModules();
  if (screensaverService?.RegisterForNotifyActiveStateChanged) {
    try {
      activeNotificationHandle = screensaverService.RegisterForNotifyActiveStateChanged((notif: any) => {
        if (isInhibiting) {
          const isActive = notif?.Body?.()?.active?.();
          if (isActive) {
            screensaverService.ForceScreensaver({ enabled: false }).catch(() => {});
          }
        }
      });
    } catch (e) {
      console.warn("[ScreensaverInhibitor] RegisterForNotifyActiveStateChanged error:", e);
    }
  }
}

function teardownActiveNotification() {
  if (activeNotificationHandle) {
    try {
      activeNotificationHandle.unregister?.();
    } catch {}
    activeNotificationHandle = null;
  }
}

/**
 * Запуск подавления заставки и ухода экрана в сон
 */
export function startInhibiting() {
  if (isInhibiting) return;
  isInhibiting = true;

  // 1. Отключаем таймеры заставки и сна в Steam
  overrideIdleSettings();

  // 2. Сбрасываем заставку, если она уже включена
  const { screensaverService } = getSteamModules();
  if (screensaverService?.ForceScreensaver) {
    screensaverService.ForceScreensaver({ enabled: false }).catch(() => {});
  }

  // 3. Подписываемся на реактивное подавление попыток активации
  setupActiveNotification();

  // 4. Захватываем нативный Screen Wake Lock
  acquireWakeLock();
}

/**
 * Остановка подавления и восстановление системных таймеров
 */
export function stopInhibiting() {
  if (!isInhibiting) return;
  isInhibiting = false;

  // 1. Восстанавливаем оригинальные таймеры Steam
  restoreIdleSettings();

  // 2. Отписываемся от уведомлений
  teardownActiveNotification();

  // 3. Освобождаем Wake Lock
  releaseWakeLock();
}

// Защита от потери настроек при закрытии окна
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    restoreIdleSettings();
    releaseWakeLock();
    teardownActiveNotification();
  });
}

/**
 * React-хук для автоматического управления подавлением во время воспроизведения
 */
export function useScreensaverInhibitor(isPlaying: boolean) {
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (isPlaying) {
      startInhibiting();
    } else {
      stopInhibiting();
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && isPlayingRef.current) {
        acquireWakeLock();
        overrideIdleSettings();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopInhibiting();
    };
  }, [isPlaying]);
}
