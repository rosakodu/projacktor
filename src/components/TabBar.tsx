import { FC, memo } from "react";
import { TabId } from "../types";
import { TabItem } from "../hooks/useGamepadTabs";

interface TabBarProps {
  tabs: TabItem[];
  activeTab: TabId;
  onSelectTab: (tabId: TabId) => void;
  onPrevTab: () => void;
  onNextTab: () => void;
}

export const TabBar: FC<TabBarProps> = memo(
  ({ tabs, activeTab, onSelectTab, onPrevTab, onNextTab }) => {
    return (
      <div
        className="projacktor-tab-header"
        role="tablist"
        aria-label="Вкладки каталога"
        tabIndex={-1}
      >
        <div
          className="projacktor-tab-bumper"
          onClick={onPrevTab}
          role="button"
          tabIndex={-1}
          aria-label="Предыдущая вкладка (L1)"
        >
          <img
            src="/steaminputglyphs/sd_l1.svg"
            alt="L1"
            className="projacktor-bumper-icon"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
              const parent = (e.currentTarget as HTMLElement).parentElement;
              if (parent && !parent.querySelector(".projacktor-bumper-badge")) {
                const span = document.createElement("span");
                span.className = "projacktor-bumper-badge";
                span.innerText = "L1";
                parent.appendChild(span);
              }
            }}
          />
        </div>

        <div className="projacktor-tab-row" tabIndex={-1}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={-1}
                className={`projacktor-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.title}
              </div>
            );
          })}
        </div>

        <div
          className="projacktor-tab-bumper"
          onClick={onNextTab}
          role="button"
          tabIndex={-1}
          aria-label="Следующая вкладка (R1)"
        >
          <img
            src="/steaminputglyphs/sd_r1.svg"
            alt="R1"
            className="projacktor-bumper-icon"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
              const parent = (e.currentTarget as HTMLElement).parentElement;
              if (parent && !parent.querySelector(".projacktor-bumper-badge")) {
                const span = document.createElement("span");
                span.className = "projacktor-bumper-badge";
                span.innerText = "R1";
                parent.appendChild(span);
              }
            }}
          />
        </div>
      </div>
    );
  }
);
