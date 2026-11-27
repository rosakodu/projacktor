import { FC, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Focusable, GamepadButton } from "@decky/ui";
import { DiscoverFilters } from "../services/discoverService";
import { useI18n } from "../i18n";
import { playCardNavSound } from "../runtime/navSound";
import { triggerHaptic } from "../runtime/haptics";
import { getActiveDocument } from "../runtime/activeDoc";
import { isModalOpen, isPlayerActive } from "../runtime/homeInputBus";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { buildFilterRows } from "./searchFilterPresets";
import { computeCenteredScrollLeft } from "./shelfUtils";

export interface SearchFiltersProps {
  filters: DiscoverFilters;
  onChange: (filters: DiscoverFilters) => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
}

const STEP_COOLDOWN_MS = 140;

function focusChipElement(chip: HTMLElement): void {
  const doc = getActiveDocument(chip);
  doc?.querySelectorAll(".gpfocus").forEach((el) => {
    if (el !== chip) el.classList.remove("gpfocus");
  });
  chip.focus();
  chip.classList.add("gpfocus", "gpfocuswithin");
  try { (chip as any).TakeFocus?.(0); } catch {}

  const row = chip.closest(".projacktor-filter-row") as HTMLElement | null;
  if (row && row.scrollWidth > row.clientWidth) {
    const left = computeCenteredScrollLeft(
      { width: row.clientWidth, scrollWidth: row.scrollWidth },
      { left: chip.offsetLeft, width: chip.offsetWidth }
    );
    row.scrollTo({ left, behavior: "smooth" });
  }
  try { (row || chip).scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
  triggerHaptic("light", "both");
  playCardNavSound();
}

export const SearchFilters: FC<SearchFiltersProps> = memo(({
  filters, onChange, onNavigateUp, onNavigateDown,
}) => {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStepAtRef = useRef<number>(0);

  const updateFilters = useCallback(
    (patch: Partial<DiscoverFilters>) => {
      triggerHaptic("click", "both");
      playCardNavSound();
      onChange({ ...filters, ...patch, page: 1 });
    },
    [filters, onChange]
  );

  const rows = useMemo(
    () => buildFilterRows(filters, locale, t, updateFilters),
    [filters, locale, t, updateFilters]
  );

  const navigate = useCallback((dir: "up" | "down" | "left" | "right"): boolean => {
    const now = Date.now();
    if (now - lastStepAtRef.current < STEP_COOLDOWN_MS) return true;
    lastStepAtRef.current = now;

    const container = containerRef.current;
    if (!container) return false;
    const doc = getActiveDocument(container);
    const active = doc?.activeElement as HTMLElement | null;
    if (!active || !container.contains(active)) return false;

    const currentRow = active.closest(".projacktor-filter-row") as HTMLElement | null;
    if (!currentRow) return false;

    if (dir === "left" || dir === "right") {
      const chips = Array.from(currentRow.querySelectorAll<HTMLElement>(".projacktor-filter-chip"));
      const curIdx = chips.findIndex((c) => c === active || c.contains(active));
      const nextIdx = curIdx + (dir === "right" ? 1 : -1);
      if (nextIdx >= 0 && nextIdx < chips.length) {
        focusChipElement(chips[nextIdx]);
      }
      return true;
    }

    const rowEls = Array.from(container.querySelectorAll<HTMLElement>(".projacktor-filter-row"));
    const curRowIdx = rowEls.indexOf(currentRow);
    if (curRowIdx === -1) return false;

    if (dir === "up" && curRowIdx === 0) {
      onNavigateUp?.();
      return true;
    }
    if (dir === "down" && curRowIdx === rowEls.length - 1) {
      onNavigateDown?.();
      return true;
    }

    const targetRow = rowEls[curRowIdx + (dir === "down" ? 1 : -1)];
    if (!targetRow) return false;
    const targetChip =
      targetRow.querySelector<HTMLElement>(".projacktor-filter-chip.active") ||
      targetRow.querySelector<HTMLElement>(".projacktor-filter-chip");
    if (targetChip) {
      focusChipElement(targetChip);
      return true;
    }
    return false;
  }, [onNavigateUp, onNavigateDown]);

  const handleGamepadDirection = useCallback((evt: any) => {
    const btn = evt?.detail?.button;
    const dir =
      btn === 9 || btn === GamepadButton.DIR_UP ? "up" :
      btn === 10 || btn === GamepadButton.DIR_DOWN ? "down" :
      btn === 11 || btn === GamepadButton.DIR_LEFT ? "left" :
      btn === 12 || btn === GamepadButton.DIR_RIGHT ? "right" : null;
    if (!dir) return undefined;
    try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
    navigate(dir);
    return false;
  }, [navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const dir =
      e.key === "ArrowUp" ? "up" :
      e.key === "ArrowDown" ? "down" :
      e.key === "ArrowLeft" ? "left" :
      e.key === "ArrowRight" ? "right" : null;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(dir);
  }, [navigate]);

  useEffect(() => {
    return subscribeControllerInput((e) => {
      if (!e.pressed || isModalOpen() || isPlayerActive()) return;
      const container = containerRef.current;
      if (!container) return;
      const active = getActiveDocument(container)?.activeElement;
      if (!active || !container.contains(active as Node)) return;

      const b = e.button;
      if (b === RawButton.DPAD_UP || b === RawButton.LEFTSTICK_UP || b === RawButton.LEFTPAD_UP || b === 4 || b === 20) navigate("up");
      else if (b === RawButton.DPAD_DOWN || b === RawButton.LEFTSTICK_DOWN || b === RawButton.LEFTPAD_DOWN || b === 6 || b === 21) navigate("down");
      else if (b === RawButton.DPAD_LEFT || b === RawButton.LEFTSTICK_LEFT || b === RawButton.LEFTPAD_LEFT || b === 7 || b === 22 || b === 12) navigate("left");
      else if (b === RawButton.DPAD_RIGHT || b === RawButton.LEFTSTICK_RIGHT || b === RawButton.LEFTPAD_RIGHT || b === 5 || b === 23 || b === 13) navigate("right");
    });
  }, [navigate]);

  return (
    <div
      ref={containerRef}
      className="projacktor-search-filters"
      onFocusCapture={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          lastStepAtRef.current = Date.now();
        }
      }}
    >
      {rows.map((row) => (
        <Focusable
          key={row.id}
          flow-children="row"
          noFocusRing
          className="projacktor-filter-row"
          onGamepadDirection={handleGamepadDirection}
        >
          <span className="projacktor-filter-label">{row.label}</span>
          {row.chips.map((chip) => (
            <Focusable
              key={chip.key}
              className={`projacktor-filter-chip${chip.isActive ? " active" : ""}`}
              noFocusRing
              tabIndex={0}
              onActivate={chip.onSelect}
              onClick={chip.onSelect}
              onGamepadDirection={handleGamepadDirection}
              onKeyDown={handleKeyDown}
            >
              {chip.label}
            </Focusable>
          ))}
        </Focusable>
      ))}
    </div>
  );
});
