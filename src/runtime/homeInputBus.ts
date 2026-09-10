/* Central bus for gamepad and directional events in Projacktor.
   Adapted from Deck-Shelves homeInputBus.
   Captures events from Decky Focusable (onButtonDown, onGamepadDirection)
   and exposes typed subscription streams. */


import { isMagicBlack } from "./magicBlackBus";

export const DeckyButton = {
  INVALID: 0,
  OK: 1,
  CANCEL: 2,
  SECONDARY: 3,
  OPTIONS: 4,
  L1: 5,
  R1: 6,
  L2: 7,
  R2: 8,
  DPAD_UP: 9,
  DPAD_DOWN: 10,
  DPAD_LEFT: 11,
  DPAD_RIGHT: 12,
  SELECT: 13,
  START: 14,
} as const;

export interface HomeButtonEvent {
  button: number;
}

export interface KeyEvent {
  key: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  tag?: string;
}

type ButtonListener = (e: HomeButtonEvent) => void;
type KeyListener = (e: KeyEvent) => void;

const buttonListeners = new Set<ButtonListener>();
const keyListeners = new Set<KeyListener>();

export function subscribeHomeButton(cb: ButtonListener): () => void {
  buttonListeners.add(cb);
  return () => {
    buttonListeners.delete(cb);
  };
}

export function dispatchHomeButtonDown(evt: { detail?: { button?: number } } | any): void {
  const button = evt?.detail?.button;
  if (typeof button !== "number") return;
  try {
    (globalThis as any).__projacktor_home_btn_last = { button, t: Date.now() };
  } catch {}
  for (const l of buttonListeners) {
    try {
      l({ button });
    } catch {}
  }
}

export function dispatchHomeDirection(evt: { detail?: { button?: number } } | any): void {
  const button = evt?.detail?.button;
  if (typeof button !== "number") return;
  try {
    (globalThis as any).__projacktor_home_dir_last = { button, t: Date.now() };
  } catch {}
  for (const l of buttonListeners) {
    try {
      l({ button });
    } catch {}
  }
}

export function subscribeHomeKey(cb: KeyListener): () => void {
  keyListeners.add(cb);
  return () => {
    keyListeners.delete(cb);
  };
}

export function dispatchHomeKey(ev: KeyEvent): void {
  try {
    (globalThis as any).__projacktor_home_key_last = ev;
  } catch {}
  for (const l of keyListeners) {
    try {
      l(ev);
    } catch {}
  }
}

export function isModalOpen(): boolean {
  if (isMagicBlack()) return true;
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    ".projacktor-modal-root, .projacktor-player-fullscreen"
  );
}
