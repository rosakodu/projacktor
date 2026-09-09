import { FC, useState, useCallback, useMemo, useEffect } from "react";
import { Navigation, Focusable, Tabs, showModal } from "@decky/ui";
import { PROJACKTOR_STYLES } from "../styles";
import { MediaItem } from "../types";
import { Header } from "../components/Header";
import { MovieModal } from "../components/MovieModal";
import { PlayerModal } from "../components/PlayerModal";
import { MagicBlackOverlay } from "../components/MagicBlackOverlay";
import { CatalogView } from "./CatalogView";
import { SearchView } from "./SearchView";
import { LibraryView } from "./LibraryView";
import { SettingsView } from "./SettingsView";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen } from "../runtime/homeInputBus";

export const ProjacktorApp: FC = () => {
  const [activeTab, setActiveTab] = useState<string>("movies");
  const [magicBlackActive, setMagicBlackActive] = useState<boolean>(false);

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

  const tabs = useMemo(
    () => [
      {
        id: "movies",
        title: "Главная",
        content: <CatalogView key="movies" category="movie" onSelectMovie={handleOpenMovie} />,
      },
      {
        id: "tv",
        title: "Сериалы",
        content: <CatalogView key="tv" category="tv" onSelectMovie={handleOpenMovie} />,
      },
      {
        id: "cartoons",
        title: "Мультфильмы",
        content: <CatalogView key="cartoons" category="cartoon" onSelectMovie={handleOpenMovie} />,
      },
      {
        id: "anime",
        title: "Аниме",
        content: <CatalogView key="anime" category="anime" onSelectMovie={handleOpenMovie} />,
      },
      {
        id: "search",
        title: "Поиск",
        content: <SearchView onSelectMovie={handleOpenMovie} />,
      },
      {
        id: "library",
        title: "Библиотека",
        content: (
          <LibraryView
            onPlayVideo={handlePlayVideo}
            onActivateMagicBlack={() => setMagicBlackActive(true)}
          />
        ),
      },
      {
        id: "settings",
        title: "Настройки",
        content: <SettingsView />,
      },
    ],
    [handleOpenMovie, handlePlayVideo]
  );

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  const prevTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = tabIds.indexOf(cur);
      const prevIdx = idx > 0 ? idx - 1 : tabIds.length - 1;
      return tabIds[prevIdx];
    });
  }, [tabIds]);

  const nextTab = useCallback(() => {
    setActiveTab((cur) => {
      const idx = tabIds.indexOf(cur);
      const nextIdx = idx < tabIds.length - 1 ? idx + 1 : 0;
      return tabIds[nextIdx];
    });
  }, [tabIds]);

  // Зацикленное переключение вкладок через L1/R1 в любой момент
  useEffect(() => {
    let lastBumperAt = 0;
    const un = subscribeControllerInput((e) => {
      if (isModalOpen()) return;
      if (!e.pressed) return;
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
  }, [prevTab, nextTab]);

  return (
    <Focusable
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

      {/* Нативный заголовок */}
      <Header />

      {/* Нативные вкладки SteamOS GamepadUI */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Tabs
          activeTab={activeTab}
          onShowTab={(tabId: string) => setActiveTab(tabId)}
          tabs={tabs}
        />
      </div>

      {/* OLED режим фоновой загрузки */}
      {magicBlackActive && (
        <MagicBlackOverlay onDismiss={() => setMagicBlackActive(false)} />
      )}
    </Focusable>
  );
};
