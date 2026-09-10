import { FC, useState, useCallback, useEffect, useRef } from "react";
import { Navigation, Focusable, showModal } from "@decky/ui";
import { PROJACKTOR_STYLES } from "../styles";
import { MediaItem } from "../types";
import { Header, TabBar, MovieModal, PlayerModal } from "../components";
import { CatalogView } from "./CatalogView";
import { SearchView } from "./SearchView";
import { LibraryView } from "./LibraryView";
import { SettingsView } from "./SettingsView";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";
import { setMagicBlack } from "../runtime/magicBlackBus";
import { playNavSound } from "../runtime/navSound";

const TABS_CONFIG = [
  { id: "movies", title: "Главная" },
  { id: "tv", title: "Сериалы" },
  { id: "cartoons", title: "Мультфильмы" },
  { id: "anime", title: "Аниме" },
  { id: "search", title: "Поиск" },
  { id: "library", title: "Библиотека" },
  { id: "settings", title: "Настройки" },
];

const TAB_IDS = TABS_CONFIG.map((t) => t.id);

export const ProjacktorApp: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<string>("movies");

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

  const handlePlayVideo = useCallback(
    (filePath: string, title: string, isOnline: boolean) => {
      let playerInstance: any = null;
      const closePlayer = () => {
        if (playerInstance && typeof playerInstance.Close === "function") {
          playerInstance.Close();
        }
      };
      playerInstance = showModal(
        <PlayerModal
          filePath={filePath}
          title={title}
          isOnline={isOnline}
          closeModal={closePlayer}
        />,
        getParentWindow(),
        { bHideActionIcons: true, strTitle: title }
      );
    },
    []
  );

  const handleOpenMovie = useCallback(
    (movie: MediaItem) => {
      let modalInstance: any = null;
      const close = () => {
        if (modalInstance && typeof modalInstance.Close === "function") {
          modalInstance.Close();
        }
      };
      const onWatchOnline = (filePath: string, streamTitle: string) => {
        close();
        handlePlayVideo(filePath, streamTitle, true);
      };
      const onStartMagicBlack = () => {
        close();
        setMagicBlack(true);
      };
      modalInstance = showModal(
        <MovieModal
          movie={movie}
          closeModal={close}
          onWatchOnline={onWatchOnline}
          onStartMagicBlack={onStartMagicBlack}
        />,
        getParentWindow()
      );
    },
    [handlePlayVideo]
  );

  const handleBack = useCallback(() => {
    try {
      Navigation.NavigateBack();
    } catch {}
  }, []);

  const prevTab = useCallback(() => {
    playNavSound();
    setActiveTab((cur) => {
      const idx = TAB_IDS.indexOf(cur);
      const prevIdx = idx > 0 ? idx - 1 : TAB_IDS.length - 1;
      return TAB_IDS[prevIdx];
    });
  }, []);

  const nextTab = useCallback(() => {
    playNavSound();
    setActiveTab((cur) => {
      const idx = TAB_IDS.indexOf(cur);
      const nextIdx = idx < TAB_IDS.length - 1 ? idx + 1 : 0;
      return TAB_IDS[nextIdx];
    });
  }, []);

  // Гарантированная фокусировка контента при переключении вкладок
  const ensureContentFocus = useCallback(() => {
    const root = rootRef.current;
    if (!root) return false;

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
    } else if (activeTab === "library") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-library-content .projacktor-magicblack-btn, .projacktor-library-content .projacktor-lib-card, .projacktor-library-content .projacktor-icon-btn, .projacktor-library-content .projacktor-empty-lib"
      );
    } else if (activeTab === "settings") {
      target = root.querySelector<HTMLElement>(
        ".projacktor-content input, .projacktor-content button, .projacktor-content .DialogButton, .projacktor-content [tabindex='0']"
      );
    }

    if (!target) {
      target = root.querySelector<HTMLElement>(
        ".projacktor-tab-item.active, [role='tab'][aria-selected='true']"
      );
    }

    if (target) {
      try {
        target.focus();
      } catch {}
      return true;
    }
    return false;
  }, [activeTab]);

  useEffect(() => {
    ensureContentFocus();
    const t1 = setTimeout(ensureContentFocus, 40);
    const t2 = setTimeout(ensureContentFocus, 100);
    const t3 = setTimeout(ensureContentFocus, 250);
    const t4 = setTimeout(ensureContentFocus, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [activeTab, ensureContentFocus]);

  // Зацикленное переключение вкладок через L1/R1 в любой момент
  useEffect(() => {
    let lastBumperAt = 0;
    const un = subscribeControllerInput((e) => {
      if (isModalOpen()) return;
      if (!e.pressed) return;

      // Если фокус упал на body, восстанавливаем его на активном контенте
      const doc = rootRef.current?.ownerDocument || document;
      const active = doc.activeElement;
      if (!active || active === doc.body || active === document.body) {
        ensureContentFocus();
      }

      const now = Date.now();
      if (now - lastBumperAt < 180) return;

      if (e.button === RawButton.L1) {
        lastBumperAt = now;
        prevTab();
      } else if (e.button === RawButton.R1) {
        lastBumperAt = now;
        nextTab();
      }
    });
    return un;
  }, [prevTab, nextTab, ensureContentFocus]);

  return (
    <Focusable
      ref={rootRef}
      className="projacktor-app-root"
      flow-children="vertical"
      onCancelButton={handleBack}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "var(--ds-text, #fff)",
      }}
    >
      <style>{PROJACKTOR_STYLES}</style>

      {/* Заголовок Projacktor */}
      <Header />

      {/* Панель вкладок: [ L1 ] [ Вкладки ] [ R1 ] */}
      <TabBar
        tabs={TABS_CONFIG}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrevTab={prevTab}
        onNextTab={nextTab}
      />

      {/* Контент текущей вкладки */}
      <Focusable
        flow-children="vertical"
        noFocusRing
        className="projacktor-view-container"
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
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
        {activeTab === "library" && (
          <LibraryView
            onPlayVideo={handlePlayVideo}
            onActivateMagicBlack={() => setMagicBlack(true)}
          />
        )}
        {activeTab === "settings" && (
          <SettingsView />
        )}
      </Focusable>
    </Focusable>
  );
};
