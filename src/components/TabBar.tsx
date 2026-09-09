import { FC, memo, useCallback, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";

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

    const moveFocusDown = useCallback(() => {
      // 1. Try focusing the first movie card in the active shelf
      const firstCard = document.querySelector<HTMLElement>(
        ".projacktor-shelf-row .projacktor-card, .projacktor-card"
      );
      if (firstCard) {
        firstCard.focus();
        return;
      }
      // 2. Fallback for search, library, or settings views
      const fallback = document.querySelector<HTMLElement>(
        ".projacktor-content input, .projacktor-content button, .projacktor-content .ds-btn, .projacktor-content .projacktor-lib-card"
      );
      if (fallback) {
        fallback.focus();
      }
    }, []);

    // Listen to Controller events when TabBar is focused
    useEffect(() => {
      let lastDownAt = 0;
      const un = subscribeControllerInput((e) => {
        if (isModalOpen()) return;
        if (!e.pressed) return;

        const navEl = navRef.current;
        const active = document.activeElement;
        const isNavFocused = !!(navEl && active && navEl.contains(active));
        if (!isNavFocused) return;

        // DPAD DOWN or LEFTSTICK DOWN: move focus to content
        if (
          e.button === RawButton.DPAD_DOWN ||
          e.button === RawButton.LEFTSTICK_DOWN ||
          e.button === 6 ||
          e.button === 21
        ) {
          const now = Date.now();
          if (now - lastDownAt < 180) return;
          lastDownAt = now;
          moveFocusDown();
        }
      });
      return un;
    }, [moveFocusDown]);

    return (
      <Focusable
        ref={navRef}
        flow-children="horizontal"
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
        <div className="projacktor-tabs-track">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Focusable
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={`projacktor-tab-item ${isActive ? "active" : ""}`}
                onActivate={() => {
                  onSelectTab(tab.id);
                  moveFocusDown();
                }}
                onClick={() => onSelectTab(tab.id)}
                onFocus={() => {
                  if (activeTab !== tab.id) {
                    onSelectTab(tab.id);
                  }
                }}
                onGamepadDirection={(evt: any) => {
                  const btn = evt?.detail?.button;
                  // If pressing DOWN on gamepad (10, 6, 21): move focus to content
                  if (btn === 10 || btn === 6 || btn === 21) {
                    try {
                      evt?.preventDefault?.();
                      evt?.stopPropagation?.();
                    } catch {}
                    moveFocusDown();
                  }
                }}
                onKeyDown={(e: any) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    moveFocusDown();
                  }
                }}
              >
                {tab.title}
              </Focusable>
            );
          })}
        </div>

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
      </Focusable>
    );
  }
);
