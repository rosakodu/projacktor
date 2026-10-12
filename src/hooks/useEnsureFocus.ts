import { useEffect } from "react";
import { FOCUS_DELAYS } from "../constants";
import { getActiveDocument } from "../runtime/activeDoc";

/**
 * Executes a focus callback immediately, and retries on cascading intervals
 * if focus could not be acquired (e.g. elements still mounting or animating).
 *
 * Интегрирована защита из Deck-Shelves:
 * Если во время каскадных попыток пользователь нажал на стик или D-Pad (vgp_ondirection),
 * все дальнейшие попытки немедленно отменяются, чтобы не мешать естественному управлению.
 */
export function useEnsureFocus(
  focusFn: () => boolean,
  deps: unknown[] = [],
  delays: readonly number[] = FOCUS_DELAYS
) {
  useEffect(() => {
    let cancelled = false;
    const doc = getActiveDocument();

    const onDirection = () => {
      cancelled = true;
    };

    if (doc) {
      doc.addEventListener("vgp_ondirection", onDirection, { capture: true, once: true });
    }

    const safeFocus = () => {
      if (cancelled) return true;
      return focusFn();
    };

    let timers: ReturnType<typeof setTimeout>[] = [];

    if (!safeFocus()) {
      timers = delays.map((d) => setTimeout(safeFocus, d));
    }

    return () => {
      cancelled = true;
      if (doc) {
        doc.removeEventListener("vgp_ondirection", onDirection, true);
      }
      timers.forEach(clearTimeout);
    };
  }, deps);
}
