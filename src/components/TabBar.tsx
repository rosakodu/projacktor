import { FC, memo, useCallback, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";
import { playNavSound } from "../runtime/navSound";
import { getActiveDocument } from "../runtime/activeDoc";


export interface TabConfig {
  id: string;
  title: string;
}

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onPrevTab: () => void;
  onNextTab: () => void;
}

export const TabBar: FC<TabBarProps> = memo(
  ({ tabs, activeTab, onSelectTab, onPrevTab, onNextTab }) => {
    const navRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    const lastDownAtRef = useRef(0);
    const lastStepAtRef = useRef(0);

    const moveFocusDown = useCallback(() => {
      const now = Date.now();
      if (now - lastDownAtRef.current < 200) return;
      lastDownAtRef.current = now;

      const doc = getActiveDocument(navRef.current);
      if (!doc) return;
      doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));

      // 1. Try focusing the first movie card in the active shelf
      const firstCard = doc.querySelector<HTMLElement>(
        ".projacktor-shelf-row .projacktor-card, .projacktor-card"
      );
      if (firstCard) {
        firstCard.focus();
        firstCard.classList.add("gpfocus");
        return;
      }
      // 2. Fallback for search, library, or settings views
      const fallback = doc.querySelector<HTMLElement>(
        ".projacktor-library-content .projacktor-magicblack-btn, .projacktor-library-content .projacktor-lib-card, .projacktor-library-content .projacktor-icon-btn, .projacktor-library-content .projacktor-empty-lib, .projacktor-content input, .projacktor-content button, .projacktor-content .DialogButton, .projacktor-content .ds-btn, .projacktor-content [tabindex='0']"
      );
      if (fallback) {
        fallback.focus();
        fallback.classList.add("gpfocus");
      }
    }, []);

    const stepTab = useCallback(
      (dir: 1 | -1) => {
        const now = Date.now();
        if (now - lastStepAtRef.current < 180) return;
        lastStepAtRef.current = now;

        const doc = getActiveDocument(navRef.current);
        if (!doc) return;

        const tabEls = Array.from(doc.querySelectorAll<HTMLElement>(".projacktor-tab-item"));
        if (!tabEls.length) return;

        const active = doc.activeElement;
        const curIdx = tabEls.findIndex((t) => t === active || t.contains(active as Node));

        let nextIdx: number;
        if (curIdx === -1) {
          nextIdx = dir > 0 ? 0 : tabEls.length - 1;
        } else {
          nextIdx = curIdx + dir;
          if (nextIdx < 0) nextIdx = tabEls.length - 1;
          if (nextIdx >= tabEls.length) nextIdx = 0;
        }

        const target = tabEls[nextIdx];
        if (target) {
          doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          const tabId = tabs[nextIdx]?.id;
          if (tabId && tabId !== activeTab) {
            playNavSound();
            onSelectTab(tabId);
          }
        }
      },
      [tabs, activeTab, onSelectTab]
    );

    // Глобальный перехват стрелок на документе при фокусе в панели табов
    useEffect(() => {
      const navEl = navRef.current;
      if (!navEl) return;
      const doc = getActiveDocument(navEl);
      if (!doc) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isModalOpen()) return;
        const active = doc.activeElement;
        const isNavFocused = !!(
          active &&
          (navEl.contains(active) || active.classList?.contains("projacktor-tab-item"))
        );
        if (!isNavFocused) return;

        if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          stepTab(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          stepTab(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          moveFocusDown();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      doc.addEventListener("keydown", handleKeyDown, true);
      return () => {
        doc.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [stepTab, moveFocusDown]);

    const handleTabSelectImmediate = useCallback(
      (tabId: string, shouldMoveDown = false) => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        playNavSound();
        onSelectTab(tabId);
        if (shouldMoveDown) {
          moveFocusDown();
        }
      },
      [onSelectTab, moveFocusDown]
    );

    // Listen to Controller events when TabBar is focused
    useEffect(() => {
      let lastDownAt = 0;
      let lastSideAt = 0;
      const un = subscribeControllerInput((e) => {
        if (isModalOpen()) return;
        if (!e.pressed) return;

        const doc = getActiveDocument(navRef.current);
        const active = doc?.activeElement;
        const isNavFocused = !!(
          active &&
          (active.closest?.(".projacktor-nav-bar") || active.classList?.contains("projacktor-tab-item"))
        );
        if (!isNavFocused) return;

        // DPAD LEFT or LEFTSTICK LEFT
        if (
          e.button === RawButton.DPAD_LEFT ||
          e.button === RawButton.LEFTSTICK_LEFT ||
          e.button === 7 ||
          e.button === 22
        ) {
          const now = Date.now();
          if (now - lastSideAt < 220) return;
          lastSideAt = now;
          stepTab(-1);
          return;
        }

        // DPAD RIGHT or LEFTSTICK RIGHT
        if (
          e.button === RawButton.DPAD_RIGHT ||
          e.button === RawButton.LEFTSTICK_RIGHT ||
          e.button === 5 ||
          e.button === 23
        ) {
          const now = Date.now();
          if (now - lastSideAt < 220) return;
          lastSideAt = now;
          stepTab(1);
          return;
        }

        // DPAD DOWN or LEFTSTICK DOWN: move focus to content
        if (
          e.button === RawButton.DPAD_DOWN ||
          e.button === RawButton.LEFTSTICK_DOWN ||
          e.button === 6 ||
          e.button === 21
        ) {
          const now = Date.now();
          if (now - lastDownAt < 250) return;
          lastDownAt = now;
          moveFocusDown();
        }
      });
      return un;
    }, [moveFocusDown, stepTab]);

    return (
      <div
        ref={navRef}
        className="projacktor-nav-bar"
      >
        {/* L1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill"
          onClick={onPrevTab}
          role="button"
          tabIndex={-1}
          aria-label="Предыдущая вкладка (L1)"
        >
          L1
        </div>

        {/* Tabs Track */}
        <Focusable
          ref={trackRef}
          flow-children="horizontal"
          noFocusRing
          className="projacktor-tabs-track"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Focusable
                key={tab.id}
                role="tab"
                noFocusRing
                aria-selected={isActive}
                className={`projacktor-tab-item ${isActive ? "active" : ""}`}
                onActivate={() => handleTabSelectImmediate(tab.id, true)}
                onClick={() => handleTabSelectImmediate(tab.id, false)}
                onGamepadDirection={(evt: any) => {
                  const btn = evt?.detail?.button;
                  if (btn === 9) {
                    try {
                      evt?.preventDefault?.();
                      evt?.stopPropagation?.();
                    } catch {}
                  } else if (btn === 10) {
                    try {
                      evt?.preventDefault?.();
                      evt?.stopPropagation?.();
                    } catch {}
                    moveFocusDown();
                  }
                }}
              >
                {tab.title}
              </Focusable>
            );
          })}
        </Focusable>

        {/* R1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill"
          onClick={onNextTab}
          role="button"
          tabIndex={-1}
          aria-label="Следующая вкладка (R1)"
        >
          R1
        </div>
      </div>
    );
  }
);
