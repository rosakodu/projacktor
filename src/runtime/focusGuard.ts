/**
 * focusGuard.ts
 *
 * Архитектурный модуль защиты фокуса GamepadUI (адаптировано из Deck-Shelves core/focusRestore.ts).
 *
 * Проблема:
 * В SteamOS Big Picture через ~0.8–1.8 секунды после монтирования страницы
 * встроенный нативный обработчик SteamUI может попытаться забрать фокус на
 * первую системную кнопку, поисковую строку или сбросить его в body.
 *
 * Решение:
 * 1. Мониторинг нативного события `vgp_ondirection`:
 *    Если пользователь нажал любую стрелку D-Pad или отклонил аналоговый стик,
 *    это однозначно доказывает, что пользователь сейчас управляет интерфейсом.
 *    Любой активный цикл автоматического восстановления фокуса немедленно
 *    прерывается (`abort()`), чтобы никогда не бороться с движениями пользователя!
 *
 * 2. Мягкое подтверждение фокуса (scheduleConfirmation):
 *    После начального захвата фокуса нужным элементом проверяется, не сбросил ли
 *    SteamUI фокус в течение контрольного окна (~1500мс). Если фокус улетел
 *    не по вине пользователя, он возвращается на сохранённый элемент.
 */

import { getActiveDocument } from "./activeDoc";

let activeAbortController: AbortController | null = null;

export interface FocusGuardOptions {
  /** Максимальное время проверки (мс) */
  timeoutMs?: number;
  /** Интервал повторных проверок (мс) */
  intervalMs?: number;
  /** Максимальное количество мягких повторных возвратов фокуса */
  maxRetakes?: number;
}

/**
 * Запуск цикла защиты фокуса на целевом элементе или функции поиска элемента.
 */
export function beginFocusGuard(
  targetOrFinder: HTMLElement | (() => HTMLElement | null),
  options?: FocusGuardOptions
): () => void {
  const { timeoutMs = 2000, intervalMs = 200, maxRetakes = 3 } = options || {};

  // Отменяем любой предыдущий цикл защиты
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  const abort = new AbortController();
  activeAbortController = abort;

  const doc = getActiveDocument();
  if (!doc) return () => {};

  let userNavigated = false;

  // Если пользователь физически нажал направление на геймпаде — стоп!
  const onDirection = () => {
    userNavigated = true;
    abort.abort();
  };

  doc.addEventListener("vgp_ondirection", onDirection, { capture: true, once: true });

  const cleanup = () => {
    doc.removeEventListener("vgp_ondirection", onDirection, true);
  };

  abort.signal.addEventListener("abort", cleanup, { once: true });

  const getTarget = (): HTMLElement | null => {
    return typeof targetOrFinder === "function" ? targetOrFinder() : targetOrFinder;
  };

  const applyFocus = (el: HTMLElement): boolean => {
    try {
      doc.querySelectorAll(".gpfocus").forEach((f) => {
        if (f !== el) f.classList.remove("gpfocus");
      });
      el.focus();
      el.classList.add("gpfocus", "gpfocuswithin");
      if (typeof (el as any).TakeFocus === "function") {
        (el as any).TakeFocus(0);
      }
      return true;
    } catch {
      return false;
    }
  };

  let reTakes = 0;
  const startTime = Date.now();

  const check = () => {
    if (abort.signal.aborted || userNavigated || activeAbortController !== abort) {
      cleanup();
      return;
    }

    const target = getTarget();
    if (target && doc.contains(target)) {
      const isFocused =
        doc.activeElement === target ||
        target.classList.contains("gpfocus") ||
        target.contains(doc.activeElement);

      if (!isFocused && reTakes < maxRetakes) {
        reTakes++;
        applyFocus(target);
      }
    }

    if (Date.now() - startTime < timeoutMs) {
      setTimeout(check, intervalMs);
    } else {
      cleanup();
    }
  };

  // Первый запуск
  const initialTarget = getTarget();
  if (initialTarget) {
    applyFocus(initialTarget);
  }
  setTimeout(check, intervalMs);

  return () => {
    abort.abort();
  };
}
