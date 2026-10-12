import { useEffect, useRef } from "react";
import { getActiveDocument } from "../runtime/activeDoc";
import { subscribeControllerInput } from "../runtime/controllerInput";
import { isNativeScreensaverActive } from "../runtime/screensaverInhibitor";

/**
 * Хук паузы при бездействии (Idle Pause)
 * Экономия заряда батареи и ресурсов CPU Steam Deck.
 *
 * Если пользователь не взаимодействует с приложением в течение IDLE_TIMEOUT_MS:
 * - на контейнер навешивается CSS-класс `pj-idle` (замораживающий анимации и шиммеры);
 * - вызываются опциональные коллбэки onIdle / onActive.
 *
 * При первом же нажатии кнопки геймпада, стика или касании трекпада/мыши:
 * - класс мгновенно снимается;
 * - таймер бездействия перезапускается.
 */

export const IDLE_TIMEOUT_MS = 60_000; // 60 секунд бездействия
export const IDLE_CLASS = "pj-idle";

// Минимальный интервал между перезапусками таймера при потоке pointermove
const REARM_MIN_GAP_MS = 1000;

// Список нативных событий пользовательского ввода
const DOM_INPUT_EVENTS = [
  "vgp_ondirection",
  "vgp_onok",
  "vgp_onmenubutton",
  "keydown",
  "pointerdown",
  "pointermove",
  "wheel",
];

interface UseIdlePauseOptions {
  onIdle?: () => void;
  onActive?: () => void;
  enabled?: boolean;
}

export function useIdlePause(
  containerEl: HTMLElement | null,
  options?: UseIdlePauseOptions
): void {
  const { onIdle, onActive, enabled = true } = options || {};
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  useEffect(() => {
    if (!enabled || !containerEl) return;

    const doc = containerEl.ownerDocument || getActiveDocument(containerEl);
    const win = doc?.defaultView || window;
    if (!doc || !win) return;

    let timer: number | null = null;
    let lastArmTime = 0;
    let isIdle = false;

    const setIdle = () => {
      timer = null;
      if (!isIdle) {
        isIdle = true;
        containerEl.classList.add(IDLE_CLASS);
        onIdleRef.current?.();
      }
    };

    const arm = () => {
      if (timer !== null) {
        win.clearTimeout(timer);
      }
      timer = win.setTimeout(setIdle, IDLE_TIMEOUT_MS);
    };

    const onUserInput = () => {
      // Если активен системный скринсейвер SteamOS — не сбрасываем состояние idle
      if (isNativeScreensaverActive()) {
        return;
      }

      const now = Date.now();
      // Защита от шторма событий pointermove
      if (timer !== null && now - lastArmTime < REARM_MIN_GAP_MS) {
        return;
      }
      lastArmTime = now;

      if (isIdle) {
        isIdle = false;
        containerEl.classList.remove(IDLE_CLASS);
        onActiveRef.current?.();
      }

      arm();
    };

    // Периодическая проверка активности системного скринсейвера SteamOS (каждые 10 сек)
    const screensaverCheckTimer = win.setInterval(() => {
      if (isNativeScreensaverActive() && !isIdle) {
        setIdle();
      }
    }, 10000);

    // 1. Слушаем события DOM (включая нативные GamepadUI vgp_ondirection, pointerdown и т.д.)
    for (const ev of DOM_INPUT_EVENTS) {
      doc.addEventListener(ev, onUserInput, { capture: true, passive: true });
    }

    // 2. Слушаем кнопки контроллера через shared bridge SteamClient
    const unsubController = subscribeControllerInput(() => {
      onUserInput();
    });

    lastArmTime = Date.now();
    arm();

    return () => {
      for (const ev of DOM_INPUT_EVENTS) {
        doc.removeEventListener(ev, onUserInput, true);
      }
      unsubController();
      win.clearInterval(screensaverCheckTimer);
      if (timer !== null) {
        win.clearTimeout(timer);
      }
      containerEl.classList.remove(IDLE_CLASS);
    };
  }, [containerEl, enabled]);
}
