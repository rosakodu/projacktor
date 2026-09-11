import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { TabId } from "../types";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import {
  DeckyButton,
  subscribeHomeButton,
  subscribeHomeKey,
  isModalOpen,
} from "../runtime/homeInputBus";

export interface TabItem {
  id: TabId;
  title: string;
}

export const APP_TABS: TabItem[] = [
  { id: "movies", title: "Главная" },
  { id: "tv", title: "Сериалы" },
  { id: "cartoons", title: "Мультфильмы" },
  { id: "anime", title: "Аниме" },
  { id: "search", title: "Поиск" },
  { id: "library", title: "Загрузки" },
  { id: "settings", title: "Настройки" },
];

const BUMPER_COOLDOWN_MS = 180;

export function useGamepadTabs(initialTab: TabId = "movies") {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [suppressCardFocus, setSuppressCardFocus] = useState<boolean>(false);

  const tabList = useMemo(() => APP_TABS, []);
  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;

  const lastBumperAtRef = useRef<number>(0);

  const selectTab = useCallback((newTab: TabId) => {
    setActiveTab(newTab);
  }, []);

  const prevTab = useCallback(() => {
    const now = Date.now();
    if (now - lastBumperAtRef.current < BUMPER_COOLDOWN_MS) return;
    lastBumperAtRef.current = now;

    setSuppressCardFocus(true);
    const cur = activeTabRef.current;
    const idx = tabList.findIndex((t) => t.id === cur);
    const prevIdx = idx > 0 ? idx - 1 : tabList.length - 1;
    setActiveTab(tabList[prevIdx].id);
  }, [tabList]);

  const nextTab = useCallback(() => {
    const now = Date.now();
    if (now - lastBumperAtRef.current < BUMPER_COOLDOWN_MS) return;
    lastBumperAtRef.current = now;

    setSuppressCardFocus(true);
    const cur = activeTabRef.current;
    const idx = tabList.findIndex((t) => t.id === cur);
    const nextIdx = idx < tabList.length - 1 ? idx + 1 : 0;
    setActiveTab(tabList[nextIdx].id);
  }, [tabList]);

  useEffect(() => {
    // 1. Raw Big Picture Steam controller input
    const unController = subscribeControllerInput((e) => {
      if (isModalOpen()) return;
      if (!e.pressed) return;

      if (e.button === RawButton.L1) {
        prevTab();
      } else if (e.button === RawButton.R1) {
        nextTab();
      } else {
        setSuppressCardFocus(false);
      }
    });

    // 2. Decky Home button bus (Focusable onButtonDown)
    const unHome = subscribeHomeButton((e) => {
      if (isModalOpen()) return;

      if (e.button === DeckyButton.L1 || e.button === 5) {
        prevTab();
      } else if (e.button === DeckyButton.R1 || e.button === 6) {
        nextTab();
      } else {
        setSuppressCardFocus(false);
      }
    });

    // 3. Injected BP key listener
    const unKey = subscribeHomeKey((e) => {
      if (isModalOpen()) return;

      if (e.key === "PageUp" || e.key === "[" || e.key === "q" || e.key === "Q") {
        prevTab();
      } else if (e.key === "PageDown" || e.key === "]" || e.key === "e" || e.key === "E") {
        nextTab();
      } else {
        setSuppressCardFocus(false);
      }
    });

    // 4. Standard DOM keydown
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen()) return;

      if (e.key === "PageUp" || e.key === "[" || e.key === "q" || e.key === "Q") {
        e.stopPropagation();
        e.preventDefault();
        prevTab();
      } else if (e.key === "PageDown" || e.key === "]" || e.key === "e" || e.key === "E") {
        e.stopPropagation();
        e.preventDefault();
        nextTab();
      } else if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(e.key)
      ) {
        setSuppressCardFocus(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      unController();
      unHome();
      unKey();
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [prevTab, nextTab]);

  return {
    activeTab,
    setActiveTab: selectTab,
    tabList,
    prevTab,
    nextTab,
    suppressCardFocus,
    setSuppressCardFocus,
  };
}
