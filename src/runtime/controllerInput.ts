/* Shared bridge for Steam Deck controller buttons.
   Steam routes controller events through SteamClient.Input.RegisterForControllerInputMessages
   in the Big Picture (BP) window context. This helper installs the registration script
   in the BP context, polls events, and exposes a clean subscribe-based API.
   Adapted from Deck-Shelves architecture. */

import { dispatchHomeKey } from "./homeInputBus";

export const RawButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  DPAD_UP: 4,
  DPAD_RIGHT: 5,
  DPAD_DOWN: 6,
  DPAD_LEFT: 7,
  MENU: 8,
  VIEW: 9,
  LEFTPAD_UP: 10,
  LEFTPAD_DOWN: 11,
  LEFTPAD_LEFT: 12,
  LEFTPAD_RIGHT: 13,
  LEFTSTICK_UP: 20,
  LEFTSTICK_DOWN: 21,
  LEFTSTICK_LEFT: 22,
  LEFTSTICK_RIGHT: 23,
  L1: 30,
  R1: 31,
  L2: 28,
  R2: 29,
  L3: 25,
  R3: 41,
  L4: 44,
  R4: 45,
  L5: 32,
  R5: 33,
} as const;

export interface ControllerEvent {
  button: number;
  pressed: boolean;
  slot: number;
}

type Listener = (e: ControllerEvent) => void;

const listeners = new Set<Listener>();
let installed = false;
let unregisterAll: Array<() => void> = [];
let pollTimer: number | null = null;
let pollCursor = 0;
let keyPollCursor = 0;

const DEDUP_WINDOW_MS = 40;
let lastEvKey = "";
let lastEvAt = 0;

function dispatch(ev: ControllerEvent): void {
  const key = `${ev.slot}:${ev.button}:${ev.pressed ? 1 : 0}`;
  const now = Date.now();
  if (key === lastEvKey && now - lastEvAt < DEDUP_WINDOW_MS) return;
  lastEvKey = key;
  lastEvAt = now;

  try {
    const g = globalThis as any;
    g.__projacktor_input_last = ev;
  } catch {}

  for (const l of listeners) {
    try {
      l(ev);
    } catch {}
  }
}

function installBPInjection(): boolean {
  const g = globalThis as any;
  const candidates: any[] = [];
  try {
    if (g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow) {
      candidates.push(g.SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow);
    }
  } catch {}
  try {
    const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      for (const w of wins) {
        if (w?.BrowserWindow) candidates.push(w.BrowserWindow);
      }
    }
  } catch {}
  try {
    const focused = g.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow;
    if (focused) candidates.push(focused);
  } catch {}
  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    if (docView) {
      candidates.push(docView);
      if (docView.opener) candidates.push(docView.opener);
      if (docView.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow) {
        candidates.push(docView.SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow);
      }
      if (docView.opener?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow) {
        candidates.push(docView.opener.SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow);
      }
    }
  } catch {}

  const view = candidates.find((c) => c?.SteamClient?.Input?.RegisterForControllerInputMessages) ?? null;
  if (!view) return false;

  // Injected keydown listener
  try {
    const kbBody = [
      "if (this.__projacktor_bp_keydown_installed) return;",
      "this.__projacktor_bp_keydown_installed = true;",
      "this.__projacktor_bp_keydown_log = [];",
      "var _klog = this.__projacktor_bp_keydown_log;",
      "this.document.addEventListener('keydown', function (e) {",
      "  try {",
      "    _klog.push({ key: e.key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, tag: e.target && e.target.tagName, t: Date.now() });",
      "    if (_klog.length > 100) _klog.shift();",
      "  } catch (err) {}",
      "}, true);",
    ].join("\n");
    const kbFn = new view.Function(kbBody);
    kbFn.call(view);
  } catch {}

  if (view.__projacktor_bp_input_installed) {
    g.__projacktor_input_bp_view = view;
    return true;
  }

  // Injected controller listener
  try {
    const body = [
      "if (this.__projacktor_bp_input_installed) return;",
      "this.__projacktor_bp_input_installed = true;",
      "this.__projacktor_bp_input_log = [];",
      "this.__projacktor_bp_input_regs = [];",
      "var _log = this.__projacktor_bp_input_log;",
      "var _regs = this.__projacktor_bp_input_regs;",
      "var _seen = new Set();",
      "var _tryReg = function (Input, tag) {",
      "  if (!Input) return;",
      "  ['RegisterForControllerInputMessages','RegisterForControllerCommandMessages','RegisterForTouchMenuInputMessages'].forEach(function (m) {",
      "    var fn = Input[m];",
      "    if (typeof fn !== 'function') return;",
      "    if (_seen.has(fn)) return;",
      "    _seen.add(fn);",
      "    try {",
      "      var reg = fn.call(Input, function () {",
      "        var args = Array.prototype.slice.call(arguments);",
      "        _log.push({ s: args[0], b: args[1], p: args[2], src: tag + '.' + m, t: Date.now() });",
      "        if (_log.length > 200) _log.shift();",
      "      });",
      "      _regs.push({ tag: tag, method: m, reg: !!reg });",
      "    } catch (e) { _regs.push({ tag: tag, method: m, err: String(e).slice(0, 100) }); }",
      "  });",
      "};",
      "_tryReg(this.SteamClient && this.SteamClient.Input, 'self');",
      "_tryReg(this.opener && this.opener.SteamClient && this.opener.SteamClient.Input, 'opener');",
      "try {",
      "  var ui = this.SteamUIStore || (this.opener && this.opener.SteamUIStore);",
      "  if (ui) {",
      "    var f = ui.GetFocusedWindowInstance && ui.GetFocusedWindowInstance();",
      "    _tryReg(f && f.BrowserWindow && f.BrowserWindow.SteamClient && f.BrowserWindow.SteamClient.Input, 'focused');",
      "    var ws = ui.WindowStore && ui.WindowStore.SteamUIWindows;",
      "    if (Array.isArray(ws)) ws.forEach(function (w, i) {",
      "      _tryReg(w && w.BrowserWindow && w.BrowserWindow.SteamClient && w.BrowserWindow.SteamClient.Input, 'ui[' + i + ']');",
      "    });",
      "    var gm = ui.WindowStore && ui.WindowStore.GamepadUIMainWindowInstance && ui.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;",
      "    _tryReg(gm && gm.SteamClient && gm.SteamClient.Input, 'gamepadMain');",
      "  }",
      "} catch (e) { _regs.push({ tag: 'walk-err', err: String(e).slice(0, 200) }); }",
    ].join("\n");
    const installFn = new view.Function(body);
    installFn.call(view);
    g.__projacktor_input_bp_view = view;
    return true;
  } catch (e) {
    try {
      g.__projacktor_input_bp_err = String(e).slice(0, 200);
    } catch {}
    return false;
  }
}

function getAllInputApis(): any[] {
  const g = globalThis as any;
  const seen = new Set<any>();
  const candidates: any[] = [];
  const tryPush = (v: any) => {
    const fn = v?.RegisterForControllerInputMessages;
    if (!fn || seen.has(fn)) return;
    seen.add(fn);
    candidates.push(v);
  };
  tryPush(g.SteamClient?.Input);
  tryPush(g.opener?.SteamClient?.Input);
  tryPush(g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamClient?.Input);
  try {
    const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      wins.forEach((entry: any) => tryPush(entry?.BrowserWindow?.SteamClient?.Input));
    }
  } catch {}
  try {
    const focused = g.SteamUIStore?.GetFocusedWindowInstance?.();
    tryPush(focused?.BrowserWindow?.SteamClient?.Input);
  } catch {}
  try {
    const docView = (typeof document !== "undefined" ? document.defaultView : null) as any;
    tryPush(docView?.SteamClient?.Input);
    tryPush(docView?.opener?.SteamClient?.Input);
  } catch {}
  return candidates;
}

function startPolling(): void {
  if (pollTimer != null) return;
  const g = globalThis as any;
  pollTimer = g.setInterval?.(() => {
    try {
      const view = g.__projacktor_input_bp_view;
      const log = view?.__projacktor_bp_input_log;
      if (Array.isArray(log)) {
        while (pollCursor < log.length) {
          const entry = log[pollCursor++];
          if (!entry) continue;
          dispatch({ slot: entry.s, button: entry.b, pressed: entry.p });
        }
      }
      const kbLog = view?.__projacktor_bp_keydown_log;
      if (Array.isArray(kbLog)) {
        while (keyPollCursor < kbLog.length) {
          const entry = kbLog[keyPollCursor++];
          if (!entry) continue;
          dispatchHomeKey(entry);
        }
      }
    } catch {}
  }, 25);
}

function ensureInstalled(): void {
  if (installed) return;
  const bpOk = installBPInjection();
  const apis = getAllInputApis();

  for (let i = 0; i < apis.length; i++) {
    const Input = apis[i];
    try {
      const reg = Input.RegisterForControllerInputMessages((slot: number, button: number, pressed: boolean) => {
        dispatch({ slot, button, pressed });
      });
      unregisterAll.push(() => {
        try {
          reg?.unregister?.();
        } catch {}
      });
    } catch {}
  }

  if (bpOk || unregisterAll.length > 0) {
    startPolling();
    installed = true;
  }
}

function pollUntilInstalled(): void {
  if (installed) return;
  ensureInstalled();
  if (installed) return;
  const g = globalThis as any;
  let tries = 0;
  const timer = g.setInterval?.(() => {
    if (installed) {
      try {
        g.clearInterval?.(timer);
      } catch {}
      return;
    }
    tries++;
    ensureInstalled();
    if (installed || tries > 40) {
      try {
        g.clearInterval?.(timer);
      } catch {}
    }
  }, 250);
}

try {
  pollUntilInstalled();
} catch {}

export function subscribeControllerInput(cb: Listener): () => void {
  ensureInstalled();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
