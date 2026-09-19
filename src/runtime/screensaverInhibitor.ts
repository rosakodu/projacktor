/**
 * screensaverInhibitor.ts
 * Подавление заставки Steam Big Picture и ухода экрана в спящий режим во время просмотра видео.
 *
 * 1. Steam Screensaver Service (b3.ForceScreensaver({ enabled: false }))
 * 2. W3C Screen Wake Lock API (navigator.wakeLock.request('screen'))
 */

import { useEffect, useRef } from "react";

let screensaverService: any = null;
let hasSearchedScreensaverService = false;
let activeNotificationHandle: any = null;
let wakeLockSentinel: any = null;
let heartbeatInterval: any = null;
let isInhibiting = false;

/**
 * Динамический поиск внутреннего сервиса Screensaver Steam через webpackChunksteamui.
 * Поиск выполняется единожды с кэшированием результата, чтобы избежать лишней нагрузки на CPU.
 */
export function getScreensaverService(): any {
  if (hasSearchedScreensaverService) return screensaverService;
  hasSearchedScreensaverService = true;

  try {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const chunk = win?.webpackChunksteamui || (document?.defaultView as any)?.webpackChunksteamui;
    if (chunk && typeof chunk.push === "function") {
      chunk.push([[Symbol()], {}, (require: any) => {
        for (const id in require.m) {
          try {
            const m = require(id);
            if (m?.b3?.ForceScreensaver && m?.b3?.GetActiveState) {
              screensaverService = m.b3;
              break;
            }
          } catch {}
        }
      }]);
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] Failed to find Steam screensaver service:", e);
  }
  return screensaverService;
}

/**
 * Запрос W3C Screen Wake Lock (нативно поддерживается CEF/Chromium, 0% CPU)
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
 * Отправка сигнала подавления заставки Steam
 */
function suppressSteamScreensaver() {
  try {
    const service = getScreensaverService();
    if (service?.ForceScreensaver) {
      service.ForceScreensaver({ enabled: false }).catch(() => {});
    }
  } catch {}
}

/**
 * Запуск подавления заставки и ухода экрана в сон
 */
export function startInhibiting() {
  if (isInhibiting) return;
  isInhibiting = true;

  // 1. Подавляем заставку Steam сразу
  suppressSteamScreensaver();

  // 2. Подписываемся на события попытки включения заставки Steam
  const service = getScreensaverService();
  if (service?.RegisterForNotifyActiveStateChanged && !activeNotificationHandle) {
    try {
      activeNotificationHandle = service.RegisterForNotifyActiveStateChanged((notif: any) => {
        if (isInhibiting) {
          const isActive = notif?.Body?.()?.active?.();
          if (isActive) {
            suppressSteamScreensaver();
          }
        }
      });
    } catch (e) {
      console.warn("[ScreensaverInhibitor] Failed to register active state changed listener:", e);
    }
  }

  // 3. Захватываем Screen Wake Lock
  acquireWakeLock();

  // 4. Легковесный heartbeat раз в 60 секунд (только повторный захват wakeLock при необходимости)
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (!isInhibiting) return;
    suppressSteamScreensaver();
    if (!wakeLockSentinel) {
      acquireWakeLock();
    }
  }, 60000);
}

/**
 * Остановка подавления
 */
export function stopInhibiting() {
  if (!isInhibiting) return;
  isInhibiting = false;

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (activeNotificationHandle) {
    try {
      activeNotificationHandle.unregister?.();
    } catch {}
    activeNotificationHandle = null;
  }

  releaseWakeLock();
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

    // При возвращении на вкладку/окно восстанавливаем Wake Lock если видео всё ещё играет
    const handleVisibilityChange = () => {
      if (!document.hidden && isPlayingRef.current) {
        acquireWakeLock();
        suppressSteamScreensaver();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopInhibiting();
    };
  }, [isPlaying]);
}
