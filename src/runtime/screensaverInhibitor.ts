import { useEffect } from "react";
import { rpcInhibitSleep, rpcUninhibitSleep, rpcPingSleepInhibit } from "../api";

let screensaverService: any = null;
let settingsModule: any = null;
let activeNotificationHandle: any = null;
let wakeLockSentinel: any = null;
let heartbeatTimer: any = null;
let isInhibiting = false;
let originalSettings: Record<string, number | undefined> = {};
let settingsOverridden = false;
const IDLE_KEYS = [
  "system_idle_screensaver_ac_sec", "system_idle_screensaver_battery_sec",
  "system_idle_suspend_ac_sec", "system_idle_suspend_battery_sec",
];

export function isNativeScreensaverActive(): boolean {
  try {
    const ctrl = (globalThis as any).FocusNavController;
    const ctx = ctrl?.m_ActiveContext ?? ctrl?.m_LastActiveContext;
    const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
    return !!trees.find((t) => t?.m_ID === "ScreensaverPopup")?.BIsActive?.();
  } catch {
    return false;
  }
}

function getWebpackChunk(): any {
  const win = typeof window !== "undefined" ? (window as any) : null;
  return win?.webpackChunksteamui || win?.opener?.webpackChunksteamui || win?.top?.webpackChunksteamui;
}

export function getSteamModules(): { screensaverService: any; settingsModule: any } {
  if (screensaverService && settingsModule) return { screensaverService, settingsModule };
  try {
    const chunk = getWebpackChunk();
    if (chunk && typeof chunk.push === "function") {
      chunk.push([[Symbol()], {}, (require: any) => {
        if (require && typeof require.c === "object") {
          for (const id in require.c) {
            const exp = require.c[id]?.exports;
            if (!exp) continue;
            if (!screensaverService) {
              screensaverService = typeof exp.ForceScreensaver === "function" ? exp : (typeof exp.b3?.ForceScreensaver === "function" ? exp.b3 : null);
            }
            if (!settingsModule) {
              settingsModule = (exp.clientSettings || exp.rV?.clientSettings) && typeof exp.qt === "function" ? exp : null;
            }
            if (screensaverService && settingsModule) break;
          }
        }
        if (!screensaverService) try { screensaverService = require("2099")?.b3; } catch {}
        if (!settingsModule) try { settingsModule = require("39828"); } catch {}
      }]);
    }
  } catch (e) {
    console.warn("[ScreensaverInhibitor] Failed to load Steam modules:", e);
  }
  return { screensaverService, settingsModule };
}

function overrideIdleSettings() {
  if (settingsOverridden) return;
  try {
    const { settingsModule } = getSteamModules();
    const cs = settingsModule?.rV?.clientSettings || settingsModule?.clientSettings;
    if (settingsModule?.qt && cs) {
      originalSettings = {};
      for (const k of IDLE_KEYS) {
        if (typeof cs[k] === "number" && cs[k] > 0) { originalSettings[k] = cs[k]; settingsModule.qt(k, 0); }
      }
      settingsOverridden = true;
    }
  } catch {}
}

function restoreIdleSettings() {
  if (!settingsOverridden) return;
  try {
    const { settingsModule } = getSteamModules();
    if (settingsModule?.qt) {
      for (const [k, v] of Object.entries(originalSettings)) {
        if (typeof v === "number") settingsModule.qt(k, v);
      }
    }
  } catch {}
  originalSettings = {};
  settingsOverridden = false;
}

async function acquireWakeLock() {
  try {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockSentinel.addEventListener?.("release", () => { wakeLockSentinel = null; });
    }
  } catch {}
}

function releaseWakeLock() {
  try { wakeLockSentinel?.release?.().catch(() => {}); wakeLockSentinel = null; } catch {}
}

function setupActiveNotification() {
  if (activeNotificationHandle) return;
  const { screensaverService } = getSteamModules();
  if (screensaverService?.RegisterForNotifyActiveStateChanged) {
    try {
      activeNotificationHandle = screensaverService.RegisterForNotifyActiveStateChanged((notif: any) => {
        if (isInhibiting && notif?.Body?.()?.active?.()) screensaverService.ForceScreensaver({ enabled: false }).catch(() => {});
      });
    } catch {}
  }
}

function teardownActiveNotification() {
  try { activeNotificationHandle?.unregister?.(); } catch {}
  activeNotificationHandle = null;
}

function pingAndResetIdle() {
  if (!isInhibiting) return;
  rpcPingSleepInhibit().catch(() => {});
  const { screensaverService } = getSteamModules();
  screensaverService?.ForceScreensaver?.({ enabled: false })?.catch?.(() => {});
  if (isNativeScreensaverActive()) {
    try {
      const ctrl = (globalThis as any).FocusNavController;
      const ctx = ctrl?.m_ActiveContext ?? ctrl?.m_LastActiveContext;
      const popup = (ctx?.m_rgGamepadNavigationTrees ?? []).find((t: any) => t?.m_ID === "ScreensaverPopup");
      popup?.Deactivate?.();
    } catch {}
  }
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(pingAndResetIdle, 25000);
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

export function startInhibiting() {
  if (isInhibiting) return;
  isInhibiting = true;
  rpcInhibitSleep("video").catch(() => {});
  pingAndResetIdle();
  startHeartbeat();
  overrideIdleSettings();
  setupActiveNotification();
  acquireWakeLock();
}

export function stopInhibiting() {
  if (!isInhibiting) return;
  isInhibiting = false;
  stopHeartbeat();
  rpcUninhibitSleep("video").catch(() => {});
  restoreIdleSettings();
  teardownActiveNotification();
  releaseWakeLock();
}

if (typeof window !== "undefined") window.addEventListener("beforeunload", () => stopInhibiting());

export function useScreensaverInhibitor(active: boolean = true) {
  useEffect(() => {
    if (active) startInhibiting(); else stopInhibiting();
    const handleVisibility = () => {
      if (!document.hidden && active) { acquireWakeLock(); overrideIdleSettings(); pingAndResetIdle(); }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopInhibiting();
    };
  }, [active]);
}
