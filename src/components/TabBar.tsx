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

    const moveFocusDown = useCallback(() => {
      const now = Date.now();
      if (now - lastDownAtRef.current < 200) return;
      lastDownAtRef.current = now;

      const doc = getActiveDocument(navRef.current);
      if (!doc) return;
      doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));

      let target: HTMLElement | null = null;
      if (activeTab === "library") {
        target = doc.querySelector<HTMLElement>(
          ".projacktor-library-content .projacktor-dl-poster-btn, .projacktor-library-content .projacktor-dl-btn-play, .projacktor-library-content .projacktor-empty-lib"
        );
      } else if (activeTab === "search") {
        target = doc.querySelector<HTMLElement>(
          ".projacktor-content input, .projacktor-content button, .projacktor-content .ds-btn"
        );
      } else if (activeTab === "settings") {
        target = doc.querySelector<HTMLElement>(
          ".projacktor-content button, .projacktor-content input, .projacktor-content .DialogButton, .projacktor-content [tabindex='0']"
        );
      } else {
        target = doc.querySelector<HTMLElement>(
          ".projacktor-shelf-row .projacktor-card, .projacktor-card"
        );
      }

      if (!target) {
        target = doc.querySelector<HTMLElement>(
          ".projacktor-shelf-row .projacktor-card, .projacktor-library-content .projacktor-dl-poster-btn, .projacktor-content input, .projacktor-content button, .projacktor-content [tabindex='0']"
        );
      }

      if (target) {
        target.focus();
        target.classList.add("gpfocus");
        playNavSound();
      }
    }, [activeTab]);

    // Глобальный перехват стрелок на документе при фокусе в панели табов (D-pad не переключает табы)
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

        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          moveFocusDown();
        } else if (
          e.key === "ArrowUp" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight"
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      doc.addEventListener("keydown", handleKeyDown, true);
      return () => {
        doc.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [moveFocusDown]);

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

    // Слушатель событий геймпада при фокусе на TabBar (только спуск вниз, табы управляются L1/R1)
    useEffect(() => {
      let lastDownAt = 0;
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
    }, [moveFocusDown]);

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
                  if (btn === 9 || btn === 11 || btn === 12) {
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
