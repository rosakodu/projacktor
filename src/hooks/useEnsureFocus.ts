import { useEffect } from "react";
import { FOCUS_DELAYS } from "../constants";

/**
 * Executes a focus callback immediately, and retries on cascading intervals
 * if focus could not be acquired (e.g. elements still mounting or animating).
 */
export function useEnsureFocus(
  focusFn: () => boolean,
  deps: unknown[] = [],
  delays: readonly number[] = FOCUS_DELAYS
) {
  useEffect(() => {
    let cancelled = false;
    const safeFocus = () => {
      if (cancelled) return true;
      return focusFn();
    };

    if (!safeFocus()) {
      const timers = delays.map((d) => setTimeout(safeFocus, d));
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }
    return () => {
      cancelled = true;
    };
  }, deps);
}
