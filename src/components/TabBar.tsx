import { FC, memo, useCallback } from "react";
import { playNavSound } from "../runtime/navSound";

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
    const handleTabClick = useCallback(
      (tabId: string) => {
        playNavSound();
        onSelectTab(tabId);
      },
      [onSelectTab]
    );

    return (
      <div className="projacktor-nav-bar">
        {/* L1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill"
          onClick={onPrevTab}
          role="button"
          aria-label="Предыдущая вкладка (L1)"
        >
          L1
        </div>

        {/* Tabs Track */}
        <div className="projacktor-tabs-track">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={`projacktor-tab-item ${isActive ? "active" : ""}`}
                onClick={() => handleTabClick(tab.id)}
              >
                {tab.title}
              </div>
            );
          })}
        </div>

        {/* R1 Bumper Indicator */}
        <div
          className="projacktor-bumper-pill"
          onClick={onNextTab}
          role="button"
          aria-label="Следующая вкладка (R1)"
        >
          R1
        </div>
      </div>
    );
  }
);
