import { callable } from "@decky/api";
import { StorageDrive, DiskSpaceInfo, DaemonStatus } from "./types";

const rpcGetSettings = callable<[], Record<string, any>>("get_settings");
const rpcSaveSettings = callable<[string], boolean>("save_settings");
const rpcCheckJacred = callable<[string], boolean>("check_jacred");
const rpcGetStatus = callable<[], Record<string, any>>("get_status");
const rpcGetDiskSpace = callable<[], DiskSpaceInfo>("get_disk_space");
const rpcGetStorageDrives = callable<[], StorageDrive[]>("get_storage_drives");
const rpcInhibitSleep = callable<[string?], { success: boolean; error?: string }>("inhibit_sleep");
const rpcUninhibitSleep = callable<[string?], { success: boolean; error?: string }>("uninhibit_sleep");
const rpcPingSleepInhibit = callable<[], { success: boolean }>("ping_sleep_inhibit");

export async function loadSettings(): Promise<Record<string, any>> {
  try {
    return (await rpcGetSettings()) || {};
  } catch {
    return {};
  }
}

export async function saveSettings(settings: Record<string, any>): Promise<boolean> {
  try {
    return await rpcSaveSettings(JSON.stringify(settings));
  } catch {
    return false;
  }
}

export async function checkJacredConnection(url: string): Promise<boolean> {
  try {
    return await rpcCheckJacred(url);
  } catch {
    return false;
  }
}

export async function fetchDaemonStatus(): Promise<DaemonStatus> {
  try {
    const st = (await rpcGetStatus()) || {};
    return {
      aria2: Boolean(st.aria2_running ?? st.aria2),
      torrserver: Boolean(st.torrserver_running ?? st.torrserver),
      jacred: Boolean(st.jacred_online ?? st.jacred),
      webserver: Boolean(st.webserver_running ?? st.webserver ?? true),
    };
  } catch {
    return { aria2: false, torrserver: false, jacred: false, webserver: false };
  }
}

export async function fetchDiskSpace(): Promise<DiskSpaceInfo> {
  try {
    return (await rpcGetDiskSpace()) || { total: 0, used: 0, free: 0, path: "", drives: [] };
  } catch {
    return { total: 0, used: 0, free: 0, path: "", drives: [] };
  }
}

export async function fetchStorageDrives(): Promise<StorageDrive[]> {
  try {
    return (await rpcGetStorageDrives()) || [];
  } catch {
    return [];
  }
}

export async function inhibitSleep(reason: string = "projacktor_playback"): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpcInhibitSleep(reason);
  } catch (e: any) {
    return { success: false, error: String(e) };
  }
}

export async function uninhibitSleep(reason: string = "projacktor_playback"): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpcUninhibitSleep(reason);
  } catch (e: any) {
    return { success: false, error: String(e) };
  }
}

export async function pingSleepInhibit(): Promise<{ success: boolean }> {
  try {
    return await rpcPingSleepInhibit();
  } catch {
    return { success: false };
  }
}
