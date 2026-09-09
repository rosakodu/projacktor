import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaPause, FaDownload, FaList, FaTrash, FaMoon, FaSpinner } from "react-icons/fa";
import { EpisodeItem } from "../types";
import { formatBytes, formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";

interface LibraryViewProps {
  onPlayVideo: (filePath: string, title: string, isOnline: boolean) => void;
  onActivateMagicBlack: () => void;
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack }) => {
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

    return (
      <div className="projacktor-content">
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Библиотека</div>

        {library.length === 0 ? (
          <Focusable
            noFocusRing
            style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.4)" }}
          >
            Библиотека пуста. Добавьте фильмы или сериалы из каталога.
          </Focusable>
        ) : (
          library.map((item) => {
            const hasLocalFiles = !!(item.files && item.files.length > 0);
            const localFilePath = hasLocalFiles && item.files ? item.files[0].file_path : null;
            const isCompleted = item.download_status === "completed" || hasLocalFiles;
            const canPlayDirect = isCompleted && !!localFilePath;
            const isDownloading = item.download_status === "downloading";
            const isPaused = item.download_status === "paused";
            const isTv = item.media_type === "tv";
            const isEpisodesOpen = !!expandedEpisodes[item.id];
            const episodes = episodesMap[item.id] || [];
            const isEpLoading = !!episodesLoading[item.id];
            const isStreamStarting = streamLoading === item.id;

            return (
              <Focusable key={item.id} className="projacktor-lib-card">
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
                            maxWidth: 280,
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

                    <div className="projacktor-dl-actions">
                      {!isTv &&
                        (canPlayDirect ? (
                          <Focusable
                            className="projacktor-icon-btn projacktor-icon-btn--primary"
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
                              onActivate={() => startDownload(item)}
                              onClick={() => startDownload(item)}
                              title="Загрузить"
                            >
                              <FaDownload style={{ fontSize: 11 }} />
                            </Focusable>
                          )}

                          {/* MagicBlack Mode (Screen-off OLED background downloading) */}
                          <Focusable
                            className="projacktor-icon-btn projacktor-magicblack-btn"
                            title="Загрузка в фоне с отключением экрана (MagicBlack OLED)"
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
                          onActivate={() => toggleEpisodes(item)}
                          onClick={() => toggleEpisodes(item)}
                          title={isEpisodesOpen ? "Скрыть серии" : "Серии"}
                        >
                          <FaList style={{ fontSize: 11 }} />
                        </Focusable>
                      )}

                      <Focusable
                        className="projacktor-icon-btn ds-btn--danger"
                        onActivate={() => deleteItem(item.id)}
                        onClick={() => deleteItem(item.id)}
                        title="Удалить"
                      >
                        <FaTrash style={{ fontSize: 11 }} />
                      </Focusable>
                    </div>
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
                            <div
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
                            </div>
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
      </div>
    );
  }
);
