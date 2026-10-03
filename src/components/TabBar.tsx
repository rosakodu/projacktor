import { FC, memo, useCallback } from "react";
import { Focusable, GamepadButton } from "@decky/ui";
import { playNavSound } from "../runtime/navSound";
import { triggerHaptic } from "../runtime/haptics";
import { useI18n } from "../i18n";
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
  onNavigateDown?: () => void;
}

export const TabBar: FC<TabBarProps> = memo(
  ({ tabs, activeTab, onSelectTab, onPrevTab, onNextTab, onNavigateDown }) => {
    const { t } = useI18n();

    const focusTabElement = useCallback((tabId: string) => {
      const doc = getActiveDocument() || document;
      const target = doc.querySelector<HTMLElement>(`.projacktor-tab-item[data-tab-id="${tabId}"]`);
      if (target) {
        doc.querySelectorAll(".gpfocus, .gpfocuswithin").forEach((el) => {
          el.classList.remove("gpfocus");
          el.classList.remove("gpfocuswithin");
        });
      }
    }, []);

    const handleTabClick = useCallback(
      (tabId: string) => {
        triggerHaptic("medium", "both");
        playNavSound();
        onSelectTab(tabId);
        focusTabElement(tabId);
      },
      [onSelectTab, focusTabElement]
    );

    const handleTabDirection = useCallback(
      (idx: number, evt: any) => {
        const btn = evt?.detail?.button;
        if (btn === 9 || btn === GamepadButton.DIR_UP) {
          // DPAD_UP: Блокируем выход в верхний бар Steam
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          return false;
        }

        if (btn === 10 || btn === GamepadButton.DIR_DOWN) {
          // DPAD_DOWN: Переход в контент текущей активной вкладки
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          if (onNavigateDown) {
            onNavigateDown();
          }
          return false;
        }

        if (btn === 11 || btn === GamepadButton.DIR_LEFT) {
          // DPAD_LEFT: Переход на предыдущую вкладку
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          const prevIdx = idx > 0 ? idx - 1 : tabs.length - 1;
          const prevTabConfig = tabs[prevIdx];
          if (prevTabConfig) {
            handleTabClick(prevTabConfig.id);
          }
          return false;
        }

        if (btn === 12 || btn === GamepadButton.DIR_RIGHT) {
          // DPAD_RIGHT: Переход на следующую вкладку
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          const nextIdx = idx < tabs.length - 1 ? idx + 1 : 0;
          const nextTabConfig = tabs[nextIdx];
          if (nextTabConfig) {
            handleTabClick(nextTabConfig.id);
          }
          return false;
        }

        return undefined;
      },
      [tabs, handleTabClick, onNavigateDown]
    );

    const handleTabKeyDown = useCallback(
      (idx: number, e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          if (onNavigateDown) {
            onNavigateDown();
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          const prevIdx = idx > 0 ? idx - 1 : tabs.length - 1;
          const prevTabConfig = tabs[prevIdx];
          if (prevTabConfig) {
            handleTabClick(prevTabConfig.id);
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          const nextIdx = idx < tabs.length - 1 ? idx + 1 : 0;
          const nextTabConfig = tabs[nextIdx];
          if (nextTabConfig) {
            handleTabClick(nextTabConfig.id);
          }
        }
      },
      [tabs, handleTabClick, onNavigateDown]
    );

    return (
      <div className="projacktor-nav-bar">
        {/* L1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill l1"
          onClick={() => {
            triggerHaptic("medium", "both");
            onPrevTab();
          }}
          role="button"
          aria-label={t("prevTab")}
        >
          L1
        </div>

        {/* Tabs Track */}
        <Focusable flow-children="row" noFocusRing className="projacktor-tabs-track">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            return (
              <Focusable
                key={tab.id}
                role="tab"
                tabIndex={-1}
                noFocusRing
                data-tab-id={tab.id}
                aria-selected={isActive}
                className={`projacktor-tab-item ${isActive ? "active" : ""}`}
                onClick={() => handleTabClick(tab.id)}
                onActivate={() => handleTabClick(tab.id)}
                onGamepadDirection={(evt: any) => handleTabDirection(idx, evt)}
                onKeyDown={(e: any) => handleTabKeyDown(idx, e)}
              >
                {tab.title}
              </Focusable>
            );
          })}
        </Focusable>

        {/* R1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill r1"
          onClick={() => {
            triggerHaptic("medium", "both");
            onNextTab();
          }}
          role="button"
          aria-label={t("nextTab")}
        >
          R1
        </div>
      </div>
    );
  }
);
