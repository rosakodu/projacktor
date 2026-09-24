import { FC, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Navigation, Focusable, showModal, GamepadButton } from "@decky/ui";
import { PROJACKTOR_STYLES } from "../styles";
import { MediaItem, PlayerMediaInfo } from "../types";
import { Header, TabBar, MovieModal, PlayerModal, HeroBackdrop } from "../components";
import { setBackdropMovie } from "../runtime/backdropBus";
import { CatalogView } from "./CatalogView";
import { SearchView } from "./SearchView";
import { WatchlistView } from "./WatchlistView";
import { HistoryView } from "./HistoryView";
import { LibraryView } from "./LibraryView";
import { SettingsView } from "./SettingsView";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen, isUserInTabs, subscribeHomeKey, isPlayerActive, setPlayerActive } from "../runtime/homeInputBus";
import { setMagicBlack } from "../runtime/magicBlackBus";
import { playNavSound } from "../runtime/navSound";
import { getActiveDocument } from "../runtime/activeDoc";
import { useI18n, initI18n } from "../i18n";

const TAB_IDS = [
  "movies",
  "tv",
  "cartoons",
  "anime",
  "search",
  "watchlist",
  "history",
  "library",
  "settings",
];

interface PlayerConfig {
  filePath: string;
  title: string;
  isOnline: boolean;
  torrentHash?: string;
  mediaInfo?: PlayerMediaInfo;
  initialTime?: number;
}

export const ProjacktorApp: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const lastTabSwitchAtRef = useRef<number>(0);
  const [activeTab, setActiveTab] = useState<string>("movies");
  const [ready, setReady] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState<boolean>(false);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    initI18n();
  }, []);

  const tabsConfig = useMemo(
    () => [
      { id: "movies", title: t("movies") },
      { id: "tv", title: t("tv") },
      { id: "cartoons", title: t("cartoons") },
      { id: "anime", title: t("anime") },
      { id: "search", title: t("search") },
      { id: "watchlist", title: t("watchlist") },
      { id: "history", title: t("history") },
      { id: "library", title: t("library") },
      { id: "settings", title: t("settings") },
    ],
    [t]
  );

  // Задержка перед показом UI — даём время на применение <style> и первый рендер
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const getParentWindow = (): EventTarget => {
    try {
      const win =
        (window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ||
        (window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow ||
        document.defaultView ||
        window;
      return win as EventTarget;
    } catch {
      return window as EventTarget;
    }
  };

  const closePlayer = useCallback(() => {
    setIsPlayerOpen(false);
    setPlayerActive(false);
    setPlayerConfig(null);
    setTimeout(() => {
      ensureContentFocusRef.current?.(false);
    }, 80);
  }, []);

  const handlePlayVideo = useCallback(
    (
      filePath: string,
      title: string,
      isOnline: boolean,
      torrentHash?: string,
      mediaInfo?: PlayerMediaInfo,
      initialTime?: number
    ) => {
      setPlayerConfig({
        filePath,
        title,
        isOnline,
        torrentHash,
        mediaInfo,
        initialTime,
      });
      setIsPlayerOpen(true);
      setPlayerActive(true);
    },
    []
  );

  const ensureContentFocusRef = useRef<(force?: boolean) => boolean>(() => false);

  const handleOpenMovie = useCallback(
    (movie: MediaItem) => {
      let modalInstance: any = null;
      const prevDoc = getActiveDocument(rootRef.current);
      const prevActiveEl = prevDoc?.activeElement as HTMLElement | null;

      const close = (refocus = true) => {
        if (modalInstance && typeof modalInstance.Close === "function") {
          modalInstance.Close();
        }
        if (!refocus) return;
        setTimeout(() => {
          if (isModalOpen()) return;
          if (prevActiveEl && prevDoc?.contains(prevActiveEl)) {
            prevDoc.querySelectorAll(".gpfocus").forEach((el) => {
              if (el !== prevActiveEl) el.classList.remove("gpfocus");
            });
            prevActiveEl.focus();
            prevActiveEl.classList.add("gpfocus");
            prevActiveEl.classList.add("gpfocuswithin");
            try {
              (prevActiveEl as any).TakeFocus?.(0);
            } catch {}
          } else {
            ensureContentFocusRef.current(false);
          }
        }, 80);
      };
      const onWatchOnline = (
        filePath: string,
        streamTitle: string,
        torrentHash?: string,
        isOnline: boolean = true,
        mediaInfo?: PlayerMediaInfo
      ) => {
        close(false);
        handlePlayVideo(filePath, streamTitle, isOnline, torrentHash, mediaInfo);
      };
      const onStartMagicBlack = () => {
        close(false);
        setMagicBlack(true);
      };
      modalInstance = showModal(
        <MovieModal
          movie={movie}
          closeModal={() => close(true)}
          onWatchOnline={onWatchOnline}
          onStartMagicBlack={onStartMagicBlack}
        />,
        getParentWindow(),
        { bHideActionIcons: true }
      );
    },
    [handlePlayVideo]
  );

  const handleBack = useCallback(() => {
    try {
      Navigation.NavigateBack();
    } catch {}
  }, []);

  const holdFocusOnFallback = useCallback(() => {
    try {
      const fallback = fallbackRef.current || rootRef.current?.querySelector<HTMLElement>(".projacktor-focus-fallback");
      if (fallback) {
        fallback.focus();
        fallback.classList.add("gpfocus");
        fallback.classList.add("gpfocuswithin");
        try {
          (fallback as any).TakeFocus?.(0);
        } catch {}
      }
    } catch {}
  }, []);

  const prevTab = useCallback(() => {
    const now = Date.now();
    if (now - lastTabSwitchAtRef.current < 180) return;
    lastTabSwitchAtRef.current = now;
    playNavSound();
    holdFocusOnFallback();
    setActiveTab((cur) => {
      const idx = TAB_IDS.indexOf(cur);
      const prevIdx = idx > 0 ? idx - 1 : TAB_IDS.length - 1;
      return TAB_IDS[prevIdx];
    });
  }, [holdFocusOnFallback]);

  const nextTab = useCallback(() => {
    const now = Date.now();
    if (now - lastTabSwitchAtRef.current < 180) return;
    lastTabSwitchAtRef.current = now;
    playNavSound();
    holdFocusOnFallback();
    setActiveTab((cur) => {
      const idx = TAB_IDS.indexOf(cur);
      const nextIdx = idx < TAB_IDS.length - 1 ? idx + 1 : 0;
      return TAB_IDS[nextIdx];
    });
  }, [holdFocusOnFallback]);

  const handleSelectTab = useCallback((tabId: string) => {
    holdFocusOnFallback();
    setActiveTab(tabId);
  }, [holdFocusOnFallback]);

  // Гарантированная фокусировка на контенте активного раздела при переключении вкладок или потере фокуса
  const ensureContentFocus = useCallback((forceContent = false) => {
    if (!ready) return false;
    if (isPlayerOpen || isPlayerActive() || isModalOpen()) return true;
    if (isUserInTabs() && !forceContent) return true;

    const root = rootRef.current;
    if (!root) return false;

    const doc = getActiveDocument(root);
    const active = doc?.activeElement;

    // Проверяем, находится ли фокус внутри РЕАЛЬНОГО контента вкладки
    const container = root.querySelector(".projacktor-view-container");
    const isInsideRealContent = !!(
      active &&
      container &&
      container.contains(active)
    );
    if (isInsideRealContent) {
      return true;
    }

    let target: HTMLElement | null = null;
    if (
      activeTab === "movies" ||
      activeTab === "tv" ||
      activeTab === "cartoons" ||
      activeTab === "anime"
    ) {
      target = root.querySelector<HTMLElement>(
        ".projacktor-shelf-row .projacktor-card, .projacktor-card"
      );
    } else if (activeTab === "search") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-content input, .projacktor-content button, .projacktor-content .ds-btn"
      );
    } else if (activeTab === "watchlist") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-empty-cta-btn, .projacktor-empty-lib"
      );
    } else if (activeTab === "history") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-empty-cta-btn, .projacktor-empty-lib"
      );
    } else if (activeTab === "library") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-library-content .projacktor-dl-btn-play, .projacktor-library-content .projacktor-dl-card-btns [tabindex='0'], .projacktor-empty-cta-btn, .projacktor-empty-lib"
      );
    } else if (activeTab === "settings") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-content input, .projacktor-content button, .projacktor-content .DialogButton, .projacktor-content [tabindex='0']"
      );
    }

    // Fallback to any focusable element inside the view container
    if (!target) {
      target = root.querySelector<HTMLElement>(
        ".projacktor-view-container [tabindex='0'], .projacktor-view-container button"
      );
    }

    if (target) {
      try {
        doc?.querySelectorAll(".gpfocus").forEach((el) => {
          if (el !== target) el.classList.remove("gpfocus");
        });
        target.focus();
        target.classList.add("gpfocus");
        target.classList.add("gpfocuswithin");
        (target as any).TakeFocus?.(0);
      } catch {}
      return true;
    }
    return false;
  }, [activeTab, ready]);

  ensureContentFocusRef.current = ensureContentFocus;

  useEffect(() => {
    let cancelled = false;
    let timerId: any = null;
    const delays = [20, 60, 120, 250];
    let idx = 0;

    const scheduleNext = () => {
      if (cancelled || idx >= delays.length) return;
      const delay = delays[idx++];
      timerId = setTimeout(() => {
        if (cancelled) return;
        const focused = ensureContentFocus(false);
        // Если фокус успешно захвачен целевым элементом контента, прекращаем дальнейшие попытки
        if (!focused) {
          scheduleNext();
        }
      }, delay);
    };

    const initialFocus = ensureContentFocus(true);
    if (!initialFocus) {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId as any);
    };
  }, [activeTab, ready, ensureContentFocus]);

  // Сброс бэкдропа при переходе в настройки или поиск
  useEffect(() => {
    if (activeTab === "settings" || activeTab === "search") {
      setBackdropMovie(null, true);
    }
  }, [activeTab]);



  // Зацикленное переключение вкладок через L1/R1 в любой момент
  useEffect(() => {
    let lastBumperAt = 0;
    const un = subscribeControllerInput((e) => {
      if (isModalOpen() || isPlayerActive()) return;
      if (!e.pressed) return;

      const now = Date.now();
      if (e.button === RawButton.L1 || e.button === RawButton.R1) {
        if (now - lastBumperAt < 250) return;
        lastBumperAt = now;
        if (e.button === RawButton.L1) {
          prevTab();
        } else {
          nextTab();
        }
        return;
      }

      // Если фокус упал на body, восстанавливаем его на активном контенте
      const doc = getActiveDocument(rootRef.current);
      const active = doc?.activeElement;
      if (!active || active === doc?.body || (typeof document !== "undefined" && active === document.body)) {
        ensureContentFocus(false);
      }
    });
    return un;
  }, [prevTab, nextTab, ensureContentFocus]);

  // Переключение вкладок через клавиатурные события бамперов Steam Deck
  // SteamOS при нажатии L1 шлёт PageUp, при R1 — PageDown.
  // Перехватываем их с preventDefault(), чтобы не терять фокус и не отдавать оверлею.
  useEffect(() => {
    let lastKeyBumperAt = 0;
    const handleKeyBumper = (e: KeyboardEvent | { key: string; code?: string }) => {
      if (isModalOpen() || isPlayerActive()) return;
      if (e.key === "PageUp" || e.code === "PageUp") {
        if ("preventDefault" in e && typeof e.preventDefault === "function") {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }
        const now = Date.now();
        if (now - lastKeyBumperAt > 200) {
          lastKeyBumperAt = now;
          prevTab();
        }
      } else if (e.key === "PageDown" || e.code === "PageDown") {
        if ("preventDefault" in e && typeof e.preventDefault === "function") {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
        }
        const now = Date.now();
        if (now - lastKeyBumperAt > 200) {
          lastKeyBumperAt = now;
          nextTab();
        }
      }
    };

    // 1. Прямая шина перехвата Big Picture keydown из SteamClient.Input / BP window
    const unHomeKey = subscribeHomeKey(handleKeyBumper);

    // 2. Слушатели событий на всех доступных окнах Steam Deck
    const targets: Array<Window | Document> = [window];
    try {
      const doc = getActiveDocument(rootRef.current);
      if (doc) targets.push(doc);
      if (doc?.defaultView && !targets.includes(doc.defaultView)) {
        targets.push(doc.defaultView);
      }
      const g = globalThis as any;
      const bpWin =
        g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ||
        g.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow;
      if (bpWin && !targets.includes(bpWin)) targets.push(bpWin);
      if (bpWin?.document && !targets.includes(bpWin.document)) targets.push(bpWin.document);

      const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
      if (Array.isArray(wins)) {
        wins.forEach((w: any) => {
          if (w?.BrowserWindow && !targets.includes(w.BrowserWindow)) {
            targets.push(w.BrowserWindow);
          }
          if (w?.BrowserWindow?.document && !targets.includes(w.BrowserWindow.document)) {
            targets.push(w.BrowserWindow.document);
          }
        });
      }
    } catch {}

    const listener = (e: any) => handleKeyBumper(e);
    targets.forEach((t) => {
      try {
        t.addEventListener("keydown", listener as any, true);
      } catch {}
    });

    return () => {
      unHomeKey();
      targets.forEach((t) => {
        try {
          t.removeEventListener("keydown", listener as any, true);
        } catch {}
      });
    };
  }, [prevTab, nextTab]);

  // Пока не ready — показываем только фон + стили, без контента (нет фокусируемых элементов = нет обводки)
  if (!ready) {
    return (
      <div className="projacktor-app-root">
        <style>{PROJACKTOR_STYLES}</style>
      </div>
    );
  }

  return (
    <Focusable
      ref={rootRef}
      className={`projacktor-app-root ${isPlayerOpen ? "projacktor-app-playing" : ""}`}
      flow-children="vertical"
      onCancelButton={isPlayerOpen ? () => false : handleBack}
      onButtonDown={(e: any) => {
        if (isPlayerOpen || isPlayerActive()) return false;
        if (isModalOpen()) return false;
        const btn = e?.detail?.button;
        if (btn === GamepadButton.BUMPER_LEFT || btn === 5) {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          prevTab();
          return false;
        }
        if (btn === GamepadButton.BUMPER_RIGHT || btn === 6) {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          nextTab();
          return false;
        }
        return undefined;
      }}
      onGamepadDirection={(e: any) => {
        if (isPlayerOpen || isPlayerActive()) return false;
        if (isModalOpen()) return undefined;
        const btn = e?.detail?.button;
        if (btn === GamepadButton.BUMPER_LEFT || btn === 5) {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          prevTab();
          return false;
        }
        if (btn === GamepadButton.BUMPER_RIGHT || btn === 6) {
          try {
            e?.preventDefault?.();
            e?.stopPropagation?.();
          } catch {}
          nextTab();
          return false;
        }
        // Block DPAD_UP / LEFTSTICK_UP from leaving Projacktor root into Steam's top bar (Wifi/Search)
        if (btn === 9 || btn === 20 || btn === 4 || btn === GamepadButton.DIR_UP) {
          const doc = getActiveDocument(rootRef.current);
          const active = doc?.activeElement;
          const root = rootRef.current;
          if (!root || !active || active === root || !root.contains(active)) {
            try {
              e?.preventDefault?.();
              e?.stopPropagation?.();
            } catch {}
            ensureContentFocus(false);
            return false;
          }
        }
        return undefined;
      }}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "var(--ds-text, #fff)",
        ...(isPlayerOpen ? { zIndex: 99999, contain: "none" } : {}),
      }}
    >
      <style>{PROJACKTOR_STYLES}</style>

      {/* Скрытый якорный элемент для удержания фокуса внутри Projacktor при смене вкладок */}
      <Focusable
        ref={fallbackRef}
        className="projacktor-focus-fallback"
        tabIndex={-1}
        noFocusRing
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -9999,
        }}
      >
        <span />
      </Focusable>

      {/* Динамический кинематографичный бэкдроп выбранного фильма в стиле Steam Deck (кроме настроек и режима плеера) */}
      {activeTab !== "settings" && !isPlayerOpen && <HeroBackdrop />}

      {/* Шапка: Заголовок Projacktor и панель вкладок (скрыта в режиме плеера) */}
      {!isPlayerOpen && (
        <div className="projacktor-header-container">
          <Header />
          <TabBar
            tabs={tabsConfig}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onPrevTab={prevTab}
            onNextTab={nextTab}
          />
        </div>
      )}

      {/* Контент текущей вкладки (скрыт и инертен в режиме плеера для сохранения состояния и скролла) */}
      <Focusable
        flow-children="vertical"
        noFocusRing
        className="projacktor-view-container"
        inert={isPlayerOpen ? true : undefined}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          display: isPlayerOpen ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >

        {activeTab === "movies" && (
          <CatalogView key="movies" category="movie" onSelectMovie={handleOpenMovie} />
        )}
        {activeTab === "tv" && (
          <CatalogView key="tv" category="tv" onSelectMovie={handleOpenMovie} />
        )}
        {activeTab === "cartoons" && (
          <CatalogView key="cartoons" category="cartoon" onSelectMovie={handleOpenMovie} />
        )}
        {activeTab === "anime" && (
          <CatalogView key="anime" category="anime" onSelectMovie={handleOpenMovie} />
        )}
        {activeTab === "search" && (
          <SearchView onSelectMovie={handleOpenMovie} />
        )}
        {activeTab === "watchlist" && (
          <WatchlistView onSelectMovie={handleOpenMovie} onNavigateToCatalog={() => handleSelectTab("movies")} />
        )}
        {activeTab === "history" && (
          <HistoryView onPlayVideo={handlePlayVideo} onNavigateToCatalog={() => handleSelectTab("movies")} />
        )}
        {activeTab === "library" && (
          <LibraryView
            onPlayVideo={handlePlayVideo}
            onActivateMagicBlack={() => setMagicBlack(true)}
            onNavigateToCatalog={() => handleSelectTab("movies")}
          />
        )}
        {activeTab === "settings" && (
          <SettingsView />
        )}
      </Focusable>

      {/* Полноэкранный видеоплеер (рендерится напрямую в DOM без модального менеджера Steam) */}
      {isPlayerOpen && playerConfig && (
        <PlayerModal
          filePath={playerConfig.filePath}
          title={playerConfig.title}
          isOnline={playerConfig.isOnline}
          torrentHash={playerConfig.torrentHash}
          mediaInfo={playerConfig.mediaInfo}
          initialTime={playerConfig.initialTime}
          closeModal={closePlayer}
        />
      )}
    </Focusable>
  );
};
