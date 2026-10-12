/**
 * deviceState.ts
 *
 * Детекция оборудования, типа экрана и режима ввода (адаптировано из Deck-Shelves runtime/deviceState.ts).
 *
 * 1. Input Mode: `gamepad` vs `pointer`
 *    - Любое нажатие кнопки геймпада / D-Pad переключает режим в 'gamepad'.
 *    - Движение или клик мыши/трекпада переключает режим в 'pointer'.
 *    - Переключение чисто событийно (zero CPU overhead, никаких таймеров).
 *
 * 2. Display State:
 *    - Определение внешнего монитора / док-станции (разрешение > 800p или соотношение сторон).
 */

import { getActiveDocument } from "./activeDoc";
import { subscribeControllerInput } from "./controllerInput";

export type InputMode = "gamepad" | "pointer";

let currentInputMode: InputMode = "gamepad";
const inputModeListeners = new Set<(mode: InputMode) => void>();

function setInputMode(mode: InputMode): void {
  if (mode === currentInputMode) return;
  currentInputMode = mode;
  inputModeListeners.forEach((fn) => {
    try {
      fn(mode);
    } catch {}
  });
}

export function getInputMode(): InputMode {
  return currentInputMode;
}

export function subscribeInputMode(listener: (mode: InputMode) => void): () => void {
  inputModeListeners.add(listener);
  listener(currentInputMode);
  return () => {
    inputModeListeners.delete(listener);
  };
}

let installed = false;
let cleanupFn: (() => void) | null = null;

export function initDeviceState(): () => void {
  if (installed) {
    return cleanupFn || (() => {});
  }
  installed = true;

  const doc = getActiveDocument();

  // 1. События указателя (трекпад / мышь / тачскрин)
  const onPointer = () => setInputMode("pointer");
  if (doc) {
    doc.addEventListener("pointermove", onPointer, { passive: true });
    doc.addEventListener("pointerdown", onPointer, { passive: true });
  }

  // 2. События контроллера Steam Deck
  const unsubController = subscribeControllerInput(() => {
    setInputMode("gamepad");
  });

  // Нативные события геймпада GamepadUI
  const onGamepadEvent = () => setInputMode("gamepad");
  if (doc) {
    doc.addEventListener("vgp_ondirection", onGamepadEvent, { passive: true });
    doc.addEventListener("vgp_onok", onGamepadEvent, { passive: true });
    doc.addEventListener("vgp_onmenubutton", onGamepadEvent, { passive: true });
  }

  cleanupFn = () => {
    installed = false;
    if (doc) {
      doc.removeEventListener("pointermove", onPointer);
      doc.removeEventListener("pointerdown", onPointer);
      doc.removeEventListener("vgp_ondirection", onGamepadEvent);
      doc.removeEventListener("vgp_onok", onGamepadEvent);
      doc.removeEventListener("vgp_onmenubutton", onGamepadEvent);
    }
    unsubController();
  };

  return cleanupFn;
}

/**
 * Проверка, подключен ли внешний дисплей / док-станция
 */
export function isExternalDisplay(): boolean {
  try {
    const w = window.innerWidth || (screen && screen.width) || 1280;
    const h = window.innerHeight || (screen && screen.height) || 800;
    // Нативное разрешение Steam Deck — 1280x800
    return w > 1280 || h > 800;
  } catch {
    return false;
  }
}
