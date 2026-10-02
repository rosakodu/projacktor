import { FC, memo, useEffect, useRef, useCallback, useState } from "react";
import { Focusable, showModal, ConfirmModal } from "@decky/ui";
import { FaPlay, FaPause, FaDownload, FaTrash, FaMoon, FaSync, FaFilm } from "react-icons/fa";
import { LibraryItem, PlayerMediaInfo, PlaylistItem } from "../types";
import { formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";
import { useEnsureFocus } from "../hooks/useEnsureFocus";
import { getActiveDocument } from "../runtime/activeDoc";
import { isModalOpen, isUserInTabs, isPlayerActive } from "../runtime/homeInputBus";
import { EpisodesModal } from "../components/EpisodesModal";
import { setBackdropMovie } from "../runtime/backdropBus";
import { useGridNavigation, scrollCardHorizontal } from "../hooks/useGridNavigation";
import { useI18n } from "../i18n";

function parseEpisodeInfo(fileName: string, season?: number, ep?: number) {
  if (season !== undefined && ep !== undefined && ep !== null && ep !== 999999) {
    return { season: season || 1, episode: ep };
  }
  const sEpMatch = fileName.match(/(?:s|season\s*)(\d{1,3})(?:e|x|episode\s*|\b[.\s_-]+)(\d{1,4})/i);
  if (sEpMatch) {
    return { season: parseInt(sEpMatch[1], 10), episode: parseInt(sEpMatch[2], 10) };
  }
  const epMatch = fileName.match(/(?:e|ep|серия\s*)(\d{1,4})/i);
  if (epMatch) {
    return { season: season || 1, episode: parseInt(epMatch[1], 10) };
  }
  const numMatch = fileName.match(/(\d+)/);
  if (numMatch) {
    return { season: season || 1, episode: parseInt(numMatch[1], 10) };
  }
  return { season: season || 1, episode: 999999 };
}

function getSortedDownloadedEpisodes(item: LibraryItem) {
  if (!item.files || item.files.length === 0) return [];

  return [...item.files]
    .filter((f) => f.file_size > 100 * 1024)
    .sort((a, b) => {
      const infoA = parseEpisodeInfo(a.file_name, a.season_number, a.episode_number);
      const infoB = parseEpisodeInfo(b.file_name, b.season_number, b.episode_number);
      if (infoA.season !== infoB.season) return infoA.season - infoB.season;
      if (infoA.episode !== infoB.episode) return infoA.episode - infoB.episode;
      return a.file_name.localeCompare(b.file_name, undefined, { numeric: true });
    });
}

interface LibraryViewProps {
  onPlayVideo: (
    filePath: string,
    title: string,
    isOnline: boolean,
    torrentHash?: string,
    mediaInfo?: PlayerMediaInfo,
    initialTime?: number,
    playlist?: PlaylistItem[]
  ) => void;
  onActivateMagicBlack?: () => void;
  onNavigateToCatalog?: () => void;
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack, onNavigateToCatalog }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const lastInteractedItemIdRef = useRef<number | string | null>(null);
    const [isRescanning, setIsRescanning] = useState<boolean>(false);
    const [rescanResult, setRescanResult] = useState<string | null>(null);
    const { t, locale } = useI18n();

    const {
      library,
      isInitialLoading,
      rescanLibrary,
      pauseDownload,
      resumeDownload,
      startDownload,
      deleteItem,
      downloadEpisode,
      pauseEpisodeDownload,
      cancelEpisodeDownload,
      deleteEpisode,
      watchOnline,
    } = useLibrary(onPlayVideo);

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

    // Просмотр конкретной серии из модалки с созданием плейлиста для автоперехода
    const handleWatchEpisode = useCallback(
      (item: LibraryItem, epIdx: number) => {
        const sorted = getSortedDownloadedEpisodes(item);
        if (sorted.length > 0) {
          const playlist: PlaylistItem[] = sorted.map((ep) => {
            const info = parseEpisodeInfo(ep.file_name, ep.season_number, ep.episode_number);
            const epTitle = info.episode !== 999999
              ? `${item.title} - S${String(info.season).padStart(2, "0")}E${String(info.episode).padStart(2, "0")}`
              : `${item.title} - ${ep.file_name}`;
            return {
              filePath: ep.file_path,
              title: epTitle,
              isOnline: false,
              mediaInfo: {
                mediaId: item.id,
                tmdbId: item.tmdb_id,
                title: item.title,
                mediaType: "tv",
                year: item.year,
                posterPath: item.poster_path,
                backdropPath: item.backdrop_path,
                overview: item.overview,
                seasonNumber: info.season,
                episodeNumber: info.episode !== 999999 ? info.episode : undefined,
              },
            };
          });

          let targetItem = playlist.find((p) => p.mediaInfo?.episodeNumber === epIdx);
          if (!targetItem && epIdx > 0 && epIdx <= playlist.length) {
            targetItem = playlist[epIdx - 1];
          }
          if (!targetItem) {
            targetItem = playlist[0];
          }

          onPlayVideo(targetItem.filePath, targetItem.title, false, undefined, targetItem.mediaInfo, 0, playlist);
          return;
        }

        watchOnline(item, epIdx);
      },
      [onPlayVideo, watchOnline]
    );

    // Запуск сериала с первой серии с автопереходом на следующие серии
    const handlePlaySeries = useCallback(
      (item: LibraryItem) => {
        const sorted = getSortedDownloadedEpisodes(item);
        if (sorted.length === 0) {
          handleOpenEpisodes(item);
          return;
        }

        const playlist: PlaylistItem[] = sorted.map((ep) => {
          const info = parseEpisodeInfo(ep.file_name, ep.season_number, ep.episode_number);
          const epTitle = info.episode !== 999999
            ? `${item.title} - S${String(info.season).padStart(2, "0")}E${String(info.episode).padStart(2, "0")}`
            : `${item.title} - ${ep.file_name}`;
          return {
            filePath: ep.file_path,
            title: epTitle,
            isOnline: false,
            mediaInfo: {
              mediaId: item.id,
              tmdbId: item.tmdb_id,
              title: item.title,
              mediaType: "tv",
              year: item.year,
              posterPath: item.poster_path,
              backdropPath: item.backdrop_path,
              overview: item.overview,
              seasonNumber: info.season,
              episodeNumber: info.episode !== 999999 ? info.episode : undefined,
            },
          };
        });

        const firstEp = playlist[0];
        onPlayVideo(firstEp.filePath, firstEp.title, false, undefined, firstEp.mediaInfo, 0, playlist);
      },
      [onPlayVideo]
    );

    // Открытие модалки серий через нативный Decky showModal — B кнопка работает автоматически
    const handleOpenEpisodes = useCallback((item: LibraryItem) => {
      lastInteractedItemIdRef.current = item.id;
      let modalInstance: any = null;
      const close = (refocus = true) => {
        if (modalInstance && typeof modalInstance.Close === "function") {
          modalInstance.Close();
        }
        if (!refocus) return;
        // Возвращаем фокус на карточку после закрытия
        setTimeout(() => {
          if (isModalOpen()) return;
          const root = rootRef.current;
          if (!root) return;
          const doc = getActiveDocument(root);
          const card = root.querySelector<HTMLElement>(
            `[data-item-id="${item.id}"]`
          );
          const target = card?.querySelector<HTMLElement>(
            ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
          );
          if (target) {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            target.focus();
            target.classList.add("gpfocus");
            scrollCardHorizontal(rowRef.current, card);
          }
        }, 80);
      };
      modalInstance = showModal(
        <EpisodesModal
          item={item}
          closeModal={() => close(true)}
          onWatchOnline={(i, epIdx) => { close(false); handleWatchEpisode(i, epIdx); }}
          onDownloadEpisode={(i, ep) => downloadEpisode(i, ep)}
          onPauseEpisodeDownload={(i, ep) => pauseEpisodeDownload(i, ep)}
          onCancelEpisodeDownload={(i, ep) => cancelEpisodeDownload(i, ep)}
          onDeleteEpisode={(i, ep) => deleteEpisode(i, ep)}
        />,
        getParentWindow(),
        { bHideActionIcons: true }
      );
    }, [handleWatchEpisode, downloadEpisode, pauseEpisodeDownload, cancelEpisodeDownload, deleteEpisode]);

    const handlePromptDelete = useCallback(
      (item: LibraryItem, e?: any) => {
        if (e) {
          try {
            e.stopPropagation();
            e.preventDefault();
          } catch {}
        }
        const isTv = item.media_type === "tv";
        const totalEps = item.total_episodes_count || 0;
        const downloadedEps = item.downloaded_episodes_count || 0;
        const hasLocalFiles = !!(item.files && item.files.length > 0);
        const isItemCompleted = isTv
          ? (totalEps > 0 && downloadedEps >= totalEps)
          : (item.download_status === "completed" ||
             (item.download_progress !== undefined && item.download_progress >= 99.9) ||
             hasLocalFiles);

        showModal(
          <ConfirmModal
            strTitle={!isItemCompleted ? (t("confirmCancelTitle") || t("cancel")) : t("confirmDeleteTitle")}
            strDescription={`${item.title}${item.year ? ` (${item.year})` : ""}`}
            strOKButtonText={!isItemCompleted ? t("cancel") : t("delete")}
            strCancelButtonText={t("close") || "Закрыть"}
            bDestructiveWarning={true}
            onOK={() => {
              deleteItem(item.id);
            }}
          />,
          getParentWindow()
        );
      },
      [deleteItem, t]
    );    // Синхронизация бэкдропа с элементами библиотеки
    useEffect(() => {
      if (!isInitialLoading) {
        if (library.length === 0) {
          setBackdropMovie(null, true);
        } else {
          // Если фокус уже на карточке — берем ее фильм, иначе берем первый фильм списка
          const root = rootRef.current;
          const doc = getActiveDocument(root);
          const active = doc?.activeElement;
          if (active && root?.contains(active)) {
            const card = active.closest(".projacktor-dl-grid-card") as HTMLElement;
            if (card) {
              const id = card.getAttribute("data-item-id");
              const found = library.find((i) => String(i.id) === id);
              if (found) {
                setBackdropMovie(found as any);
                return;
              }
            }
          }
          setBackdropMovie(library[0] as any);
        }
      }
    }, [library, isInitialLoading]);

    // Авто-фокус на элементе библиотеки при переходе во вкладку
    useEnsureFocus(() => {
      if (isModalOpen() || isUserInTabs() || isPlayerActive()) return true;
      const root = rootRef.current;
      if (!root) return false;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement;
      if (active && active !== doc?.body && root.contains(active)) {
        return true;
      }

      const target = root.querySelector<HTMLElement>(
        ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0'], .projacktor-empty-cta-btn, .projacktor-empty-lib"
      );
      if (target) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          // Синхронизируем бэкдроп карточки, получившей фокус
          const card = target.closest(".projacktor-dl-grid-card") as HTMLElement;
          if (card) {
            const id = card.getAttribute("data-item-id");
            const found = library.find((i) => String(i.id) === id);
            if (found) {
              setBackdropMovie(found as any);
            }
          }
        } catch {}
        return true;
      }
      return false;
    }, [library.length]);

    // Строгая блокировка горизонтального скролла в контейнере библиотеки
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const lockHorizontal = () => {
        if (root.scrollLeft !== 0) {
          root.scrollLeft = 0;
        }
      };

      root.addEventListener("scroll", lockHorizontal, { passive: true });
      root.addEventListener("focusin", lockHorizontal, { passive: true });
      window.addEventListener("scroll", lockHorizontal, { passive: true });
      return () => {
        root.removeEventListener("scroll", lockHorizontal);
        root.removeEventListener("focusin", lockHorizontal);
        window.removeEventListener("scroll", lockHorizontal);
      };
    }, []);

    // Авто-скролл карточки только по вертикали при фокусе
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const onFocusIn = (e: FocusEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target || !root.contains(target)) return;
        const card = target.closest(".projacktor-dl-grid-card") as HTMLElement | null;
        if (card) {
          scrollCardHorizontal(rowRef.current, card);
        }
      };

      root.addEventListener("focusin", onFocusIn);
      return () => root.removeEventListener("focusin", onFocusIn);
    }, []);



    const { handleGamepadDirection: handleGamepadDir } = useGridNavigation({
      rootRef,
      rowRef,
      items: library,
      supportsPosterFocus: true,
      onCardFocus: (item) => setBackdropMovie(item as any),
    });

    useEffect(() => {
      if (isModalOpen() || isPlayerActive()) return;
      const doc = getActiveDocument(rootRef.current);
      const active = doc?.activeElement;
      const root = rootRef.current;
      if (!root) return;
      if (!active || active === doc?.body || !root.contains(active)) {
        const target = root.querySelector<HTMLElement>(
          ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0'], .projacktor-empty-cta-btn, .projacktor-empty-lib"
        );
        if (target) {
          try {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            try {
              (target as any).TakeFocus?.(0);
            } catch {}
            target.focus();
            target.classList.add("gpfocus");
            target.classList.add("gpfocuswithin");
          } catch {}
        }
      }
    }, [library]);

    return (

      <Focusable
        ref={rootRef}
        noFocusRing
        className="projacktor-library-content"
        onGamepadDirection={handleGamepadDir}
      >
      {/* Шапка загрузок */}
      <div className="projacktor-section-header-row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="projacktor-section-title">{t("library")}</span>
        </div>
      </div>

      {!isInitialLoading && library.length === 0 && (
        <div
          className="projacktor-empty-lib"
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
            {t("libraryEmptyTitle")}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginBottom: 20 }}>
            {t("libraryEmptyDesc")}
          </div>
          {rescanResult && (
            <div style={{ fontSize: 13, color: "#4ade80", marginBottom: 16, fontWeight: 600 }}>
              {rescanResult}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <Focusable
              role="button"
              className="ds-btn ds-btn--secondary projacktor-rescan-btn"
              onClick={async () => {
                if (isRescanning) return;
                setIsRescanning(true);
                setRescanResult(null);
                const res = await rescanLibrary();
                setIsRescanning(false);
                if (res && res.restored_count > 0) {
                  setRescanResult(`${t("rescannedSuccess")} ${res.restored_count}`);
                } else {
                  setRescanResult(`${t("rescannedSuccess")} 0`);
                }
              }}
              onActivate={async () => {
                if (isRescanning) return;
                setIsRescanning(true);
                setRescanResult(null);
                const res = await rescanLibrary();
                setIsRescanning(false);
                if (res && res.restored_count > 0) {
                  setRescanResult(`${t("rescannedSuccess")} ${res.restored_count}`);
                } else {
                  setRescanResult(`${t("rescannedSuccess")} 0`);
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 4,
                cursor: "pointer",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "#fff",
              }}
            >
              <FaSync className={isRescanning ? "spin-animation" : ""} style={{ fontSize: 12 }} />
              {isRescanning ? t("rescanningLibraryBtn") : t("rescanLibraryBtn")}
            </Focusable>
            {onNavigateToCatalog && (
              <Focusable
                role="button"
                className="ds-btn ds-btn--primary projacktor-empty-cta-btn"
                onClick={onNavigateToCatalog}
                onActivate={onNavigateToCatalog}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 24px",
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {t("goToCatalog")}
              </Focusable>
            )}
          </div>
        </div>
      )}

      {library.length > 0 && (
        <div ref={rowRef} className="projacktor-downloads-grid">
            {library.map((item, index) => {
              const isTv = item.media_type === "tv" || (item.files && item.files.length > 1) || (item.total_episodes_count !== undefined && item.total_episodes_count > 1);
              const isDownloading = item.download_status === "downloading";
              const isPaused = item.download_status === "paused";
              const hasLocalFiles = !!(item.files && item.files.length > 0);
              const localFilePath = hasLocalFiles && item.files ? item.files[0].file_path : null;

              const downloadedEps = item.downloaded_episodes_count !== undefined
                ? item.downloaded_episodes_count
                : (item.files ? item.files.filter((f) => f.file_size > 100 * 1024).length : 0);
              const totalEps = item.total_episodes_count || 0;

              // Фильм считается полностью скачанным, если есть локальный файл или статус completed
              const isCompleted = isTv
                ? (totalEps > 0 && downloadedEps >= totalEps)
                : (item.download_status === "completed" ||
                   (item.download_progress !== undefined && item.download_progress >= 99.9) ||
                   hasLocalFiles);

              // Если физический файл есть на диске, фильм или серия ВСЕГДА может быть проигран напрямую!
              const canPlayDirect = hasLocalFiles && !!localFilePath && (!isTv || totalEps <= 1 || downloadedEps >= totalEps);
              const progress = Math.min(100, Math.max(0, item.download_progress || 0));

              const handlePrimaryAction = (e?: any) => {
                if (e) {
                  try {
                    e.stopPropagation();
                    e.preventDefault();
                  } catch {}
                }
                lastInteractedItemIdRef.current = item.id;
                if (isTv) {
                  // Для сериалов ВСЕГДА открываем список серий, чтобы не включать случайно первую попавшуюся серию
                  handleOpenEpisodes(item);
                } else if (localFilePath) {
                  const mediaInfo: PlayerMediaInfo = {
                    tmdbId: item.tmdb_id,
                    title: item.title,
                    mediaType: (item.media_type as any) || "movie",
                    year: item.year,
                    posterPath: item.poster_path,
                    backdropPath: item.backdrop_path,
                    overview: item.overview,
                  };
                  onPlayVideo(localFilePath, item.title, false, undefined, mediaInfo);
                }
              };

              let badgeText: string | null = null;
              let badgeClass = "";
              if (isCompleted) {
                // "✓ Скачано" пишем ТОЛЬКО когда загружены абсолютно все серии (или фильм целиком)
                badgeText = t("downloadedBadge");
                badgeClass = "completed";
              } else if (isDownloading) {
                const spd = formatSpeed(item.download_speed || 0);
                badgeText = `${progress.toFixed(0)}% • ${spd}`;
                badgeClass = "downloading";
              } else if (isPaused) {
                badgeText = progress > 0 ? `${t("pausedBadge")} (${progress.toFixed(0)}%)` : t("pausedBadge");
                badgeClass = "paused";
              } else if (isTv && downloadedEps > 0) {
                // Скачана часть серий (например, одна или две) - пишем точное количество серий, а не "Скачано"
                const epWord = locale === "en"
                  ? (downloadedEps === 1 ? "episode" : "episodes")
                  : (downloadedEps % 10 === 1 && downloadedEps % 100 !== 11 ? "серия" : (downloadedEps % 10 >= 2 && downloadedEps % 10 <= 4 && (downloadedEps % 100 < 10 || downloadedEps % 100 >= 20) ? "серии" : "серий"));
                badgeText = totalEps > 0
                  ? `${downloadedEps} ${t("episodesOf")} ${totalEps} ${t("episodesPlural")}`
                  : `${downloadedEps} ${epWord}`;
                badgeClass = "queued";
              }

              return (
                <div
                  key={item.id}
                  className="projacktor-dl-grid-card"
                  data-item-id={item.id}
                  data-card-index={index}
                  onClick={(e: any) => handlePrimaryAction(e)}
                  onFocusCapture={() => setBackdropMovie(item as any)}
                  onMouseEnter={() => setBackdropMovie(item as any)}
                >
                  {/* Постер с поддержкой фокуса и переходов D-Pad */}
                  <Focusable
                    className="projacktor-dl-poster-btn"
                    noFocusRing
                    tabIndex={0}
                    onClick={(e: any) => handlePrimaryAction(e)}
                    onActivate={(e: any) => handlePrimaryAction(e)}
                    onFocus={() => setBackdropMovie(item as any)}
                    onMouseEnter={() => setBackdropMovie(item as any)}
                    title={item.title}
                  >
                    {item.poster_path ? (
                      <img
                        src={getImageUrl(item.poster_path)}
                        alt={item.title}
                        className="projacktor-dl-poster-img"
                        loading="lazy"
                        draggable={false}
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const ph = img.parentElement?.querySelector(".projacktor-dl-poster-placeholder") as HTMLElement;
                          if (ph) ph.style.display = "flex";
                        }}
                      />
                    ) : null}

                    {/* Стилизованная заглушка для видео без обложки TMDB или при ошибке сети */}
                    <div
                      className="projacktor-dl-poster-placeholder"
                      style={{ display: item.poster_path ? "none" : "flex" }}
                    >
                      <FaFilm className="projacktor-dl-placeholder-icon" />
                      <div className="projacktor-dl-placeholder-title" title={item.title}>
                        {item.title}
                      </div>
                    </div>

                    {/* Бейдж статуса (только реальные статусы: Скачано, Загрузка, Пауза) */}
                    {badgeText && (
                      <div className={`projacktor-dl-badge-status ${badgeClass}`}>
                        {badgeText}
                      </div>
                    )}

                    {/* Бейдж качества или типа (показываем когда не скачивается, чтобы не перегружать постер) */}
                    {!isDownloading && (item.effective_quality || isTv) && (
                      <div className="projacktor-dl-badge-quality">
                        {item.effective_quality || t("seriesBadge")}
                      </div>
                    )}

                    {/* Встроенный прогресс-бар внизу постера */}
                    {(isDownloading || isPaused || isCompleted || (isTv && downloadedEps > 0)) && (
                      <div className="projacktor-dl-bar-bg">
                        <div
                          className={`projacktor-dl-bar-fill ${
                            isCompleted
                              ? "completed"
                              : isDownloading
                              ? "downloading"
                              : isPaused
                              ? "paused"
                              : "queued"
                          }`}
                          style={{
                            width: `${
                              isCompleted
                                ? 100
                                : isDownloading || isPaused
                                ? progress
                                : totalEps > 0
                                ? Math.min(100, Math.round((downloadedEps / totalEps) * 100))
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    )}
                  </Focusable>

                  {/* Название */}
                  <div className="projacktor-dl-info">
                    <div className="projacktor-dl-title" title={item.title}>
                      {item.title}
                    </div>
                    {item.year ? (
                      <div className="projacktor-dl-year">{item.year}</div>
                    ) : null}
                  </div>

                  {/* Кнопки действий */}
                  <div className="projacktor-dl-card-btns" onClick={(e) => e.stopPropagation()}>
                    {/* Кнопка Смотреть: для фильмов — если скачан; для сериалов — если скачана хоть одна серия */}
                    {isTv ? (
                      (downloadedEps > 0 || hasLocalFiles) && (
                        <Focusable
                          className="projacktor-dl-btn-play success"
                          noFocusRing
                          tabIndex={0}
                          onActivate={(e: any) => {
                            if (e) {
                              try { e.stopPropagation(); e.preventDefault(); } catch {}
                            }
                            handlePlaySeries(item);
                          }}
                          onClick={(e: any) => {
                            if (e) {
                              try { e.stopPropagation(); e.preventDefault(); } catch {}
                            }
                            handlePlaySeries(item);
                          }}
                          onFocus={() => setBackdropMovie(item as any)}
                          onMouseEnter={() => setBackdropMovie(item as any)}
                          title={t("watch")}
                        >
                          <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                        </Focusable>
                      )
                    ) : (
                      (canPlayDirect || hasLocalFiles) && (
                        <Focusable
                          className="projacktor-dl-btn-play success"
                          noFocusRing
                          tabIndex={0}
                          onActivate={(e: any) => handlePrimaryAction(e)}
                          onClick={(e: any) => handlePrimaryAction(e)}
                          onFocus={() => setBackdropMovie(item as any)}
                          onMouseEnter={() => setBackdropMovie(item as any)}
                          title={t("watchFile")}
                        >
                          <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                        </Focusable>
                      )
                    )}

                    {/* Кнопка Пауза / Загрузить (для сериалов — загрузка всех нескачанных серий) */}
                    {!isCompleted && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        tabIndex={0}
                        onActivate={(e: any) => {
                          if (e) {
                            try { e.stopPropagation(); e.preventDefault(); } catch {}
                          }
                          isDownloading
                            ? pauseDownload(item.id)
                            : isPaused
                            ? resumeDownload(item.id)
                            : startDownload(item);
                        }}
                        onClick={(e: any) => {
                          if (e) {
                            try { e.stopPropagation(); e.preventDefault(); } catch {}
                          }
                          isDownloading
                            ? pauseDownload(item.id)
                            : isPaused
                            ? resumeDownload(item.id)
                            : startDownload(item);
                        }}
                        onFocus={() => setBackdropMovie(item as any)}
                        onMouseEnter={() => setBackdropMovie(item as any)}
                        title={isDownloading ? t("pause") : isPaused ? t("resume") : (isTv ? t("downloadAllEpisodes") : t("download"))}
                      >
                        {isDownloading ? <FaPause style={{ fontSize: 9.5 }} /> : <FaDownload style={{ fontSize: 9.5 }} />}
                      </Focusable>
                    )}

                    {/* Кнопка Загрузка в спящем режиме (Magic Black) */}
                    {!isCompleted && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        tabIndex={0}
                        onActivate={(e: any) => {
                          if (e) {
                            try { e.stopPropagation(); e.preventDefault(); } catch {}
                          }
                          if (isPaused) {
                            resumeDownload(item.id);
                          }
                          onActivateMagicBlack?.();
                        }}
                        onClick={(e: any) => {
                          if (e) {
                            try { e.stopPropagation(); e.preventDefault(); } catch {}
                          }
                          if (isPaused) {
                            resumeDownload(item.id);
                          }
                          onActivateMagicBlack?.();
                        }}
                        onFocus={() => setBackdropMovie(item as any)}
                        onMouseEnter={() => setBackdropMovie(item as any)}
                        title={t("downloadSleepMagicBlack")}
                      >
                        <FaMoon style={{ fontSize: 9.5 }} />
                      </Focusable>
                    )}

                    {/* Кнопка Удалить / Отмена */}
                    <Focusable
                      className="projacktor-dl-btn-icon danger"
                      noFocusRing
                      tabIndex={0}
                      onActivate={(e: any) => handlePromptDelete(item, e)}
                      onClick={(e: any) => handlePromptDelete(item, e)}
                      onFocus={() => setBackdropMovie(item as any)}
                      onMouseEnter={() => setBackdropMovie(item as any)}
                      title={!isCompleted ? t("cancel") : t("delete")}
                    >
                      <FaTrash style={{ fontSize: 9.5 }} />
                    </Focusable>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </Focusable>
    );

  }
);
