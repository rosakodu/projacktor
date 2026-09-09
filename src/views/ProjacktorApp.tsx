import { FC, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Navigation, Focusable, showModal } from "@decky/ui";
import { PROJACKTOR_STYLES } from "../styles";
import { MediaItem } from "../types";
import { Header } from "../components/Header";
import { TabBar } from "../components/TabBar";
import { MovieModal } from "../components/MovieModal";
import { PlayerModal } from "../components/PlayerModal";
import { MagicBlackOverlay } from "../components/MagicBlackOverlay";
import { useGamepadTabs } from "../hooks/useGamepadTabs";
import { CatalogView } from "./CatalogView";
import { SearchView } from "./SearchView";
import { LibraryView } from "./LibraryView";
import { SettingsView } from "./SettingsView";
import { dispatchHomeButtonDown, dispatchHomeDirection } from "../runtime/homeInputBus";

export const ProjacktorApp: FC = () => {
  const {
    activeTab,
    setActiveTab,
    tabList,
    prevTab,
    nextTab,
    suppressCardFocus,
    setSuppressCardFocus,
  } = useGamepadTabs("movies");

  const [magicBlackActive, setMagicBlackActive] = useState<boolean>(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [activeTab]);

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
      modalInstance = showModal(
        <MovieModal movie={movie} closeModal={close} onWatchOnline={onWatchOnline} />,
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

  const activeContent = useMemo(() => {
    switch (activeTab) {
      case "movies":
        return <CatalogView key="movies" category="movie" onSelectMovie={handleOpenMovie} />;
      case "tv":
        return <CatalogView key="tv" category="tv" onSelectMovie={handleOpenMovie} />;
      case "cartoons":
        return (
          <CatalogView key="cartoons" category="cartoon" onSelectMovie={handleOpenMovie} />
        );
      case "anime":
        return <CatalogView key="anime" category="anime" onSelectMovie={handleOpenMovie} />;
      case "search":
        return <SearchView onSelectMovie={handleOpenMovie} />;
      case "library":
        return (
          <LibraryView
            onPlayVideo={handlePlayVideo}
            onActivateMagicBlack={() => setMagicBlackActive(true)}
          />
        );
      case "settings":
        return <SettingsView />;
      default:
        return <CatalogView key="movies" category="movie" onSelectMovie={handleOpenMovie} />;
    }
  }, [activeTab, handleOpenMovie, handlePlayVideo]);

  return (
    <Focusable
      className={`projacktor-app-root ${suppressCardFocus ? "suppress-card-focus" : ""}`}
      onCancelButton={handleBack}
      onButtonDown={(evt: any) => {
        setSuppressCardFocus(false);
        try {
          dispatchHomeButtonDown(evt);
        } catch {}
      }}
      onGamepadDirection={(evt: any) => {
        try {
          dispatchHomeDirection(evt);
        } catch {}
      }}
    >
      <style>{PROJACKTOR_STYLES}</style>

      {/* Header */}
      <Header />

      {/* Верхние вкладки — переключение только через L1/R1, изолированы от D-pad */}
      <TabBar
        tabs={tabList}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrevTab={prevTab}
        onNextTab={nextTab}
      />

      {/* Основная рабочая область контента */}
      <div ref={contentScrollRef} className="projacktor-content-scroll">{activeContent}</div>

      {/* OLED режим фоновой загрузки */}
      {magicBlackActive && (
        <MagicBlackOverlay onDismiss={() => setMagicBlackActive(false)} />
      )}
    </Focusable>
  );
};
