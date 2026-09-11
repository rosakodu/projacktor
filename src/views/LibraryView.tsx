import { FC, memo, useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaPause, FaDownload, FaList, FaTrash, FaMoon, FaSpinner } from "react-icons/fa";
import { EpisodeItem } from "../types";
import { formatBytes, formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";
import { getActiveDocument } from "../runtime/activeDoc";

interface LibraryViewProps {
  onPlayVideo: (filePath: string, title: string, isOnline: boolean) => void;
  onActivateMagicBlack: () => void;
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const {
      library,
      expandedEpisodes,
      episodesMap,
      episodesLoading,
      streamLoading,
      pauseDownload,
      resumeDownload,
      deleteItem,
      startDownload,
      toggleEpisodes,
      downloadEpisode,
      watchOnline,
    } = useLibrary(onPlayVideo);

    const hasDownloading = library.some((i) => i.download_status === "downloading");

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
              ".projacktor-magicblack-btn, .projacktor-lib-card, .projacktor-icon-btn, .projacktor-empty-lib"
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

    return (
      <Focusable
        ref={rootRef}
        flow-children="vertical"
        noFocusRing
        className="projacktor-library-content"
      >
        {hasDownloading && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
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
          </div>
        )}

        {library.length === 0 ? (
          <Focusable
            className="projacktor-empty-lib"
            tabIndex={0}
            noFocusRing
            style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.4)" }}
          >
            Фильмотека пуста. Добавьте фильмы или сериалы из каталога.
          </Focusable>
        ) : (
          library.map((item) => {
            const isDownloading = item.download_status === "downloading";
            const isPaused = item.download_status === "paused";
            const hasLocalFiles = !!(item.files && item.files.length > 0);
            const localFilePath = hasLocalFiles && item.files ? item.files[0].file_path : null;
            const isCompleted =
              item.download_status === "completed" ||
              (!isDownloading && !isPaused && hasLocalFiles);
            const canPlayDirect = isCompleted && !!localFilePath;
            const isTv = item.media_type === "tv";
            const isEpisodesOpen = !!expandedEpisodes[item.id];
            const episodes = episodesMap[item.id] || [];
            const isEpLoading = !!episodesLoading[item.id];
            const isStreamStarting = streamLoading === item.id;

            return (
              <Focusable key={item.id} tabIndex={0} noFocusRing className="projacktor-lib-card">
                <div className="projacktor-lib-main">
                  <img
                    src={getImageUrl(item.poster_path)}
                    alt={item.title}
                    className="projacktor-lib-poster"
                    loading="lazy"
                  />
                  <div className="projacktor-lib-details">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                          {item.title}
                        </span>
                        {item.year ? (
                          <span
                            style={{
                              fontSize: 13,
                              color: "var(--ds-text-dim)",
                              marginLeft: 6,
                            }}
                          >
                            ({item.year})
                          </span>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {item.effective_quality && (
                          <span className="projacktor-badge-quality">
                            {item.effective_quality}
                          </span>
                        )}
                        <span
                          className="projacktor-dl-badge"
                          style={{
                            background: "rgba(255,255,255,0.1)",
                            color: "#e2e8f0",
                          }}
                        >
                          {isTv ? "Сериал" : "Фильм"}
                        </span>
                      </div>
                    </div>

                    <div className="projacktor-lib-meta">
                      {isCompleted ? (
                        <span className="projacktor-dl-badge completed">
                          Скачано{" "}
                          {formatBytes(
                            item.total_file_size || item.download_total_size || 0
                          )}
                        </span>
                      ) : isDownloading ? (
                        <>
                          <span className="projacktor-dl-badge downloading">
                            Загрузка {(item.download_progress || 0).toFixed(0)}%
                          </span>
                          <span>{formatSpeed(item.download_speed || 0)}</span>
                        </>
                      ) : isPaused ? (
                        <span
                          className="projacktor-dl-badge"
                          style={{
                            background: "rgba(234, 179, 8, 0.2)",
                            color: "#eab308",
                          }}
                        >
                          На паузе
                        </span>
                      ) : (
                        <span
                          className="projacktor-dl-badge"
                          style={{
                            background: "rgba(255,255,255,0.08)",
                            color: "#9ca3af",
                          }}
                        >
                          В библиотеке
                        </span>
                      )}
                      {item.effective_torrent_title && (
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.effective_torrent_title}
                        </span>
                      )}
                    </div>

                    {(isDownloading || isPaused) && (
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 360,
                          height: 4,
                          background: "rgba(255,255,255,0.12)",
                          margin: "6px 0",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(
                              100,
                              Math.max(0, item.download_progress || 0)
                            )}%`,
                            background: isDownloading
                              ? "var(--ds-accent)"
                              : "#eab308",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    )}

                    <Focusable flow-children="horizontal" noFocusRing className="projacktor-dl-actions">
                      {!isTv &&
                        (canPlayDirect ? (
                          <Focusable
                            className="projacktor-icon-btn projacktor-icon-btn--primary"
                            noFocusRing
                            onActivate={() =>
                              onPlayVideo(localFilePath!, item.title, false)
                            }
                            onClick={() =>
                              onPlayVideo(localFilePath!, item.title, false)
                            }
                            title="Смотреть"
                          >
                            <FaPlay style={{ fontSize: 11, marginLeft: 1 }} />
                          </Focusable>
                        ) : (
                          <Focusable
                            className="projacktor-icon-btn projacktor-icon-btn--primary"
                            noFocusRing
                            onActivate={() => watchOnline(item)}
                            onClick={() => watchOnline(item)}
                            title="Смотреть онлайн"
                          >
                            {isStreamStarting ? (
                              <FaSpinner
                                style={{
                                  animation: "projacktor-spin 0.9s linear infinite",
                                }}
                              />
                            ) : (
                              <FaPlay style={{ fontSize: 11, marginLeft: 1 }} />
                            )}
                          </Focusable>
                        ))}

                      {!isCompleted && (
                        <>
                          {isDownloading && item.download_id && (
                            <Focusable
                              className="projacktor-icon-btn"
                              noFocusRing
                              onActivate={() =>
                                item.download_id && pauseDownload(item.download_id)
                              }
                              onClick={() =>
                                item.download_id && pauseDownload(item.download_id)
                              }
                              title="Пауза"
                            >
                              <FaPause style={{ fontSize: 11 }} />
                            </Focusable>
                          )}
                          {isPaused && item.download_id && (
                            <Focusable
                              className="projacktor-icon-btn"
                              noFocusRing
                              onActivate={() =>
                                item.download_id && resumeDownload(item.download_id)
                              }
                              onClick={() =>
                                item.download_id && resumeDownload(item.download_id)
                              }
                              title="Продолжить"
                            >
                              <FaPlay style={{ fontSize: 11, marginLeft: 1 }} />
                            </Focusable>
                          )}
                          {!isDownloading && !isPaused && (
                            <Focusable
                              className="projacktor-icon-btn"
                              noFocusRing
                              onActivate={() => startDownload(item)}
                              onClick={() => startDownload(item)}
                              title="Загрузить"
                            >
                              <FaDownload style={{ fontSize: 11 }} />
                            </Focusable>
                          )}

                          {/* Screen-off OLED background downloading */}
                          <Focusable
                            className="projacktor-icon-btn projacktor-magicblack-btn"
                            noFocusRing
                            title="Загрузка в фоне с отключением экрана"
                            onActivate={() => {
                              if (!isDownloading && !isPaused) {
                                startDownload(item);
                              }
                              try {
                                (document.activeElement as HTMLElement)?.blur?.();
                              } catch {}
                              onActivateMagicBlack();
                            }}
                            onClick={() => {
                              if (!isDownloading && !isPaused) {
                                startDownload(item);
                              }
                              try {
                                (document.activeElement as HTMLElement)?.blur?.();
                              } catch {}
                              onActivateMagicBlack();
                            }}
                          >
                            <FaMoon style={{ fontSize: 11 }} />
                          </Focusable>
                        </>
                      )}

                      {isTv && (
                        <Focusable
                          className={`projacktor-icon-btn ${
                            isEpisodesOpen ? "projacktor-icon-btn--primary" : ""
                          }`}
                          noFocusRing
                          onActivate={() => toggleEpisodes(item)}
                          onClick={() => toggleEpisodes(item)}
                          title={isEpisodesOpen ? "Скрыть серии" : "Серии"}
                        >
                          <FaList style={{ fontSize: 11 }} />
                        </Focusable>
                      )}

                      <Focusable
                        className="projacktor-icon-btn ds-btn--danger"
                        noFocusRing
                        onActivate={() => deleteItem(item.id)}
                        onClick={() => deleteItem(item.id)}
                        title="Удалить"
                      >
                        <FaTrash style={{ fontSize: 11 }} />
                      </Focusable>
                    </Focusable>
                  </div>
                </div>

                {isTv && isEpisodesOpen && (
                  <div className="projacktor-episodes-container">
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ds-text-dim)",
                        marginBottom: 4,
                      }}
                    >
                      Выборочная загрузка и онлайн просмотр серий:
                    </div>
                    {isEpLoading ? (
                      <div
                        style={{
                          padding: "10px 0",
                          color: "var(--ds-text-dim)",
                          fontSize: 12,
                        }}
                      >
                        Получение списка серий из торрента...
                      </div>
                    ) : episodes.length === 0 ? (
                      <div
                        style={{
                          padding: "10px 0",
                          color: "var(--ds-text-dim)",
                          fontSize: 12,
                        }}
                      >
                        Серии пока не найдены. Если торрент только добавлен, подождите
                        несколько секунд подключения к раздаче.
                      </div>
                    ) : (
                      episodes.map((ep: EpisodeItem) => {
                        const isEpCompleted =
                          ep.downloaded || (ep.size > 0 && ep.completed >= ep.size);
                        const isEpPartial = ep.completed > 0 && !isEpCompleted;
                        return (
                          <Focusable
                            key={ep.index}
                            noFocusRing
                            className="projacktor-episode-row"
                          >
                            <div
                              className="projacktor-episode-title"
                              title={ep.name}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  marginRight: 6,
                                  color: "var(--ds-accent)",
                                }}
                              >
                                #{ep.index}
                              </span>
                              {ep.name}
                            </div>
                            <Focusable
                              flow-children="horizontal"
                              noFocusRing
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--ds-text-dim)",
                                }}
                              >
                                {formatBytes(ep.size)}
                              </span>
                              {isEpCompleted ? (
                                <span
                                  className="projacktor-dl-badge completed"
                                  style={{ fontSize: 9 }}
                                >
                                  Скачано
                                </span>
                              ) : isEpPartial ? (
                                <span
                                  className="projacktor-dl-badge downloading"
                                  style={{ fontSize: 9 }}
                                >
                                  {(
                                    (ep.completed / ep.size) *
                                    100
                                  ).toFixed(0)}
                                  %
                                </span>
                              ) : null}

                              {isEpCompleted && ep.path ? (
                                <Focusable
                                  className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-icon-btn--primary"
                                  noFocusRing
                                  onActivate={() =>
                                    onPlayVideo(
                                      ep.path,
                                      `${item.title} - ${ep.name}`,
                                      false
                                    )
                                  }
                                  onClick={() =>
                                    onPlayVideo(
                                      ep.path,
                                      `${item.title} - ${ep.name}`,
                                      false
                                    )
                                  }
                                  title="Смотреть"
                                >
                                  <FaPlay
                                    style={{ fontSize: 9, marginLeft: 1 }}
                                  />
                                </Focusable>
                              ) : (
                                <Focusable
                                  className="projacktor-icon-btn projacktor-icon-btn--compact projacktor-icon-btn--primary"
                                  noFocusRing
                                  onActivate={() =>
                                    watchOnline(item, ep.index)
                                  }
                                  onClick={() =>
                                    watchOnline(item, ep.index)
                                  }
                                  title="Смотреть онлайн"
                                >
                                  <FaPlay
                                    style={{ fontSize: 9, marginLeft: 1 }}
                                  />
                                </Focusable>
                              )}

                              {!isEpCompleted && (
                                <Focusable
                                  className="projacktor-icon-btn projacktor-icon-btn--compact"
                                  noFocusRing
                                  onActivate={() =>
                                    downloadEpisode(item, ep)
                                  }
                                  onClick={() =>
                                    downloadEpisode(item, ep)
                                  }
                                  title="Загрузить серию"
                                >
                                  <FaDownload style={{ fontSize: 9 }} />
                                </Focusable>
                              )}
                            </Focusable>
                          </Focusable>
                        );
                      })
                    )}
                  </div>
                )}
              </Focusable>
            );
          })
        )}
        <div
          style={{ minHeight: 180, width: "100%", flexShrink: 0 }}
          aria-hidden="true"
        />
      </Focusable>
    );
  }
);
