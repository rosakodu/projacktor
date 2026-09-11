import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaPause, FaDownload, FaList, FaTrash, FaMoon, FaSpinner, FaTimes } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";
import { getActiveDocument } from "../runtime/activeDoc";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";

interface LibraryViewProps {
  onPlayVideo: (filePath: string, title: string, isOnline: boolean) => void;
  onActivateMagicBlack: () => void;
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [episodesModalItem, setEpisodesModalItem] = useState<LibraryItem | null>(null);

    const {
      library,
      episodesMap,
      episodesLoading,
      streamLoading,
      pauseDownload,
      resumeDownload,
      deleteItem,
      toggleEpisodes,
      downloadEpisode,
      watchOnline,
    } = useLibrary(onPlayVideo);

    const hasDownloading = library.some((i) => i.download_status === "downloading");

    // Закрытие модального окна серий по кнопке B или Escape
    useEffect(() => {
      if (!episodesModalItem) return;

      const un = subscribeControllerInput((e) => {
        if (!e.pressed) return;
        if (e.button === RawButton.B || e.button === 1) {
          setEpisodesModalItem(null);
        }
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          setEpisodesModalItem(null);
        }
      };

      window.addEventListener("keydown", handleKeyDown, true);
      return () => {
        un();
        window.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [episodesModalItem]);

    // Авто-фокус на элементе библиотеки при переходе во вкладку (если фокус не на табах)
    useEffect(() => {
      let cancelled = false;
      const focusLib = () => {
        if (cancelled) return true;
        const root = rootRef.current;
        const doc = getActiveDocument(root);
        const active = doc?.activeElement;
        const inTabs = !!(
          active &&
          (active.classList?.contains("projacktor-tab-item") ||
            doc?.querySelector(".projacktor-nav-bar")?.contains(active))
        );
        if (inTabs) return true;

        const target = root
          ? root.querySelector<HTMLElement>(
              ".projacktor-magicblack-btn, .projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-empty-lib"
            )
          : null;
        if (target) {
          try {
            target.focus();
          } catch {}
          return true;
        }
        return false;
      };

      if (!focusLib()) {
        const t1 = setTimeout(focusLib, 40);
        const t2 = setTimeout(focusLib, 120);
        const t3 = setTimeout(focusLib, 260);
        return () => {
          cancelled = true;
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
      return () => {
        cancelled = true;
      };
    }, [library.length, hasDownloading]);

    const handleOpenEpisodes = useCallback(
      (item: LibraryItem) => {
        setEpisodesModalItem(item);
        toggleEpisodes(item);
      },
      [toggleEpisodes]
    );

    const activeEpisodes = episodesModalItem ? episodesMap[episodesModalItem.id] || [] : [];
    const isActiveEpisodesLoading = episodesModalItem
      ? !!episodesLoading[episodesModalItem.id]
      : false;

    return (
      <Focusable
        ref={rootRef}
        flow-children="vertical"
        noFocusRing
        className="projacktor-library-content"
      >
        {/* Верхняя статусная панель */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            minHeight: 34,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--ds-text-dim)", fontWeight: 600 }}>
            {library.length === 0
              ? ""
              : `${library.length} ${
                  library.length === 1
                    ? "элемент"
                    : library.length < 5
                    ? "элемента"
                    : "элементов"
                }${hasDownloading ? " • Загрузка активна" : ""}`}
          </div>

          {hasDownloading && (
            <Focusable
              className="ds-btn ds-btn--compact projacktor-magicblack-btn"
              noFocusRing
              onActivate={onActivateMagicBlack}
              onClick={onActivateMagicBlack}
              title="Выключить экран для фоновой загрузки"
            >
              <FaMoon style={{ marginRight: 6, fontSize: 11 }} />
              Выключить экран
            </Focusable>
          )}
        </div>

        {library.length === 0 ? (
          <Focusable
            className="projacktor-empty-lib"
            tabIndex={0}
            noFocusRing
            style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.4)" }}
          >
            Загрузки пусты. Добавьте фильмы или сериалы из каталога.
          </Focusable>
        ) : (
          <div className="projacktor-downloads-grid">
            {library.map((item) => {
              const isDownloading = item.download_status === "downloading";
              const isPaused = item.download_status === "paused";
              const hasLocalFiles = !!(item.files && item.files.length > 0);
              const localFilePath = hasLocalFiles && item.files ? item.files[0].file_path : null;
              const isCompleted =
                item.download_status === "completed" ||
                (!isDownloading && !isPaused && hasLocalFiles);
              const canPlayDirect = isCompleted && !!localFilePath;
              const isTv = item.media_type === "tv";
              const isStreamStarting = streamLoading === item.id;
              const progress = Math.min(100, Math.max(0, item.download_progress || 0));

              const handlePrimaryAction = () => {
                if (isTv) {
                  handleOpenEpisodes(item);
                } else if (canPlayDirect) {
                  onPlayVideo(localFilePath!, item.title, false);
                } else {
                  watchOnline(item);
                }
              };

              let badgeText = "В библиотеке";
              let badgeClass = "queued";
              if (isCompleted) {
                badgeText = "✓ Скачано";
                badgeClass = "completed";
              } else if (isDownloading) {
                badgeText = `${progress.toFixed(0)}%`;
                badgeClass = "downloading";
              } else if (isPaused) {
                badgeText = "⏸ Пауза";
                badgeClass = "paused";
              }

              let subText = "В библиотеке";
              if (isCompleted) {
                const sz = item.total_file_size || item.download_total_size || 0;
                subText = sz > 0 ? formatBytes(sz) : "Локальный файл";
              } else if (isDownloading) {
                const spd = formatSpeed(item.download_speed || 0);
                subText = `${spd} • ${progress.toFixed(0)}%`;
              } else if (isPaused) {
                subText = `Пауза • ${progress.toFixed(0)}%`;
              }

              return (
                <div key={item.id} className="projacktor-dl-grid-card">
                  {/* Постер + бейджи + полоса загрузки */}
                  <Focusable
                    className="projacktor-dl-poster-btn"
                    noFocusRing
                    onActivate={handlePrimaryAction}
                    onClick={handlePrimaryAction}
                    title={canPlayDirect ? "Смотреть файл" : isTv ? "Открыть серии" : "Смотреть онлайн"}
                  >
                    <img
                      src={getImageUrl(item.poster_path)}
                      alt={item.title}
                      className="projacktor-dl-poster-img"
                      loading="lazy"
                    />

                    {/* Бейдж статуса */}
                    <div className={`projacktor-dl-badge-status ${badgeClass}`}>
                      {badgeText}
                    </div>

                    {/* Бейдж качества или типа */}
                    {item.effective_quality ? (
                      <div className="projacktor-dl-badge-quality">
                        {item.effective_quality}
                      </div>
                    ) : isTv ? (
                      <div className="projacktor-dl-badge-quality">
                        Сериал
                      </div>
                    ) : null}

                    {/* Встроенный прогресс-бар внизу постера */}
                    {(isDownloading || isPaused || isCompleted) && (
                      <div className="projacktor-dl-bar-bg">
                        <div
                          className={`projacktor-dl-bar-fill ${
                            isCompleted ? "completed" : isDownloading ? "downloading" : "paused"
                          }`}
                          style={{ width: `${isCompleted ? 100 : progress}%` }}
                        />
                      </div>
                    )}
                  </Focusable>

                  {/* Название и статусная подпись */}
                  <div className="projacktor-dl-info">
                    <div className="projacktor-dl-title" title={item.title}>
                      {item.title}
                    </div>
                    <div className="projacktor-dl-subtext" title={subText}>
                      {subText}
                    </div>
                  </div>

                  {/* Кнопки действий */}
                  <Focusable flow-children="horizontal" noFocusRing className="projacktor-dl-card-btns">
                    {/* Кнопка Смотреть / Онлайн / Файл */}
                    <Focusable
                      className="projacktor-dl-btn-play"
                      noFocusRing
                      onActivate={handlePrimaryAction}
                      onClick={handlePrimaryAction}
                      title={canPlayDirect ? "Смотреть файл" : isTv ? "Серии" : "Смотреть онлайн"}
                    >
                      {isStreamStarting ? (
                        <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 11 }} />
                      ) : (
                        <>
                          <FaPlay style={{ fontSize: 9, marginLeft: 1 }} />
                          <span>{canPlayDirect ? "Файл" : isTv ? "Серии" : "Онлайн"}</span>
                        </>
                      )}
                    </Focusable>

                    {/* Кнопка Пауза / Загрузить */}
                    {!isCompleted && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        onActivate={() =>
                          isDownloading ? pauseDownload(item.id) : resumeDownload(item.id)
                        }
                        onClick={() =>
                          isDownloading ? pauseDownload(item.id) : resumeDownload(item.id)
                        }
                        title={isDownloading ? "Приостановить" : "Возобновить"}
                      >
                        {isDownloading ? <FaPause style={{ fontSize: 10 }} /> : <FaDownload style={{ fontSize: 10 }} />}
                      </Focusable>
                    )}

                    {/* Кнопка Серии (для сериалов) */}
                    {isTv && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        onActivate={() => handleOpenEpisodes(item)}
                        onClick={() => handleOpenEpisodes(item)}
                        title="Список серий"
                      >
                        <FaList style={{ fontSize: 10 }} />
                      </Focusable>
                    )}

                    {/* Кнопка Удалить */}
                    <Focusable
                      className="projacktor-dl-btn-icon danger"
                      noFocusRing
                      onActivate={() => deleteItem(item.id)}
                      onClick={() => deleteItem(item.id)}
                      title="Удалить"
                    >
                      <FaTrash style={{ fontSize: 10 }} />
                    </Focusable>
                  </Focusable>
                </div>
              );
            })}
          </div>
        )}

        {/* Модальное окно серий для сериалов */}
        {episodesModalItem && (
          <div
            className="projacktor-episodes-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setEpisodesModalItem(null);
              }
            }}
          >
            <div className="projacktor-episodes-modal-box">
              <div className="projacktor-episodes-modal-header">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                    {episodesModalItem.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ds-text-dim)", marginTop: 2 }}>
                    Выборочная загрузка и онлайн просмотр серий
                  </div>
                </div>
                <Focusable
                  className="ds-btn ds-btn--compact ds-btn--icon"
                  noFocusRing
                  onActivate={() => setEpisodesModalItem(null)}
                  onClick={() => setEpisodesModalItem(null)}
                  title="Закрыть (B)"
                >
                  <FaTimes style={{ fontSize: 12 }} />
                </Focusable>
              </div>

              <div className="projacktor-episodes-modal-list">
                {isActiveEpisodesLoading ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--ds-text-dim)", fontSize: 13 }}>
                    <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", marginRight: 8 }} />
                    Загрузка серий из торрента...
                  </div>
                ) : activeEpisodes.length === 0 ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--ds-text-dim)", fontSize: 13 }}>
                    Серии пока не найдены. Если торрент только добавлен, подождите несколько секунд подключения к раздаче.
                  </div>
                ) : (
                  activeEpisodes.map((ep: EpisodeItem) => {
                    const isEpCompleted =
                      ep.downloaded || (ep.size > 0 && ep.completed >= ep.size);
                    const isEpPartial = ep.completed > 0 && !isEpCompleted;

                    return (
                      <Focusable
                        key={ep.index}
                        noFocusRing
                        className="projacktor-episode-row"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "var(--ds-surface)",
                          border: "1px solid var(--ds-border)",
                          borderRadius: 4,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={ep.name}>
                            <span style={{ color: "var(--ds-accent)", marginRight: 6 }}>#{ep.index + 1}</span>
                            {ep.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ds-text-dim)", marginTop: 2 }}>
                            {ep.size > 0 ? formatBytes(ep.size) : ""}
                            {isEpCompleted && (
                              <span style={{ color: "var(--ds-success)", marginLeft: 8, fontWeight: 600 }}>
                                ✓ Скачано
                              </span>
                            )}
                            {isEpPartial && (
                              <span style={{ color: "var(--ds-accent)", marginLeft: 8 }}>
                                {formatBytes(ep.completed)} / {formatBytes(ep.size)} (
                                {((ep.completed / ep.size) * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>

                        <Focusable flow-children="horizontal" noFocusRing style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Focusable
                            className="ds-btn ds-btn--compact ds-btn--primary"
                            noFocusRing
                            onActivate={() => {
                              watchOnline(episodesModalItem, ep.index);
                            }}
                            onClick={() => {
                              watchOnline(episodesModalItem, ep.index);
                            }}
                            title="Смотреть онлайн"
                          >
                            <FaPlay style={{ fontSize: 10, marginRight: 4 }} />
                            Онлайн
                          </Focusable>

                          {!isEpCompleted && (
                            <Focusable
                              className="ds-btn ds-btn--compact"
                              noFocusRing
                              onActivate={() => downloadEpisode(episodesModalItem, ep)}
                              onClick={() => downloadEpisode(episodesModalItem, ep)}
                              title="Скачать эту серию"
                            >
                              <FaDownload style={{ fontSize: 10, marginRight: 4 }} />
                              Скачать
                            </Focusable>
                          )}
                        </Focusable>
                      </Focusable>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Focusable>
    );
  }
);
