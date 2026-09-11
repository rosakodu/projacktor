import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable, Spinner } from "@decky/ui";
import { FaPlay, FaDownload, FaSpinner } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, rpcGetEpisodes, sortEpisodes } from "../api";
import { PROJACKTOR_STYLES } from "../styles";

interface EpisodesModalProps {
  item: LibraryItem;
  closeModal?: () => void;
  onWatchOnline: (item: LibraryItem, epIndex: number) => void;
  onDownloadEpisode: (item: LibraryItem, ep: EpisodeItem) => void;
}

export const EpisodesModal: FC<EpisodesModalProps> = ({
  item,
  closeModal,
  onWatchOnline,
  onDownloadEpisode,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);

  const title = item.title || "Без названия";
  const year = item.year ? String(item.year).split("-")[0] : "";

  const fetchEpisodes = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const eps = await rpcGetEpisodes(item.id);
      if (Array.isArray(eps)) {
        setEpisodes(sortEpisodes(eps));
      }
    } catch (e) {
      console.error("Failed to load episodes:", e);
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    rpcGetEpisodes(item.id)
      .then((eps) => {
        if (active && Array.isArray(eps)) {
          setEpisodes(sortEpisodes(eps));
        }
      })
      .catch((err) => {
        console.error("Error loading episodes:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [item.id]);

  // Фокус на первой кнопке при загрузке серий
  useEffect(() => {
    if (loading || episodes.length === 0) return;
    const t = setTimeout(() => {
      const first = listRef.current?.querySelector<HTMLElement>(
        ".ds-btn, [tabindex='0'], button"
      );
      if (first) {
        first.focus();
        first.classList.add("gpfocus");
      }
    }, 60);
    return () => clearTimeout(t);
  }, [loading, episodes.length]);

  const handleDownload = async (ep: EpisodeItem) => {
    setDownloadingEpIdx(ep.index);
    try {
      await onDownloadEpisode(item, ep);
      await fetchEpisodes(false);
    } finally {
      setDownloadingEpIdx(null);
    }
  };

  return (
    <ModalRoot
      onCancel={closeModal}
      closeModal={closeModal}
      bAllowFullSize={false}
      bHideCloseIcon={true}
    >
      <Focusable
        className="projacktor-modal-root"
        style={{ margin: "auto", alignSelf: "center" }}
        onCancelButton={closeModal}
      >
        <style>{PROJACKTOR_STYLES}</style>

        {/* Clean Info Header — стиль 1-в-1 как в MovieModal */}
        <div
          style={{
            padding: "8px 12px 6px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {/* Название */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>

            {/* Мета-информация (Год, Тип медиа, Качество) */}
            <div
              style={{
                display: "flex",
                gap: 8,
                fontSize: 10.5,
                opacity: 0.85,
                alignItems: "center",
              }}
            >
              {year && <span>{year}</span>}
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: 9,
                  padding: "1px 4px",
                  background: "rgba(255,255,255,0.1)",
                  fontWeight: 600,
                  letterSpacing: 0.4,
                }}
              >
                {item.media_type === "tv" ? "Сериал" : "Фильм"}
              </span>
              {item.effective_quality && (
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    background: "rgba(102, 192, 244, 0.15)",
                    color: "var(--ds-accent)",
                    fontWeight: 600,
                  }}
                >
                  {item.effective_quality}
                </span>
              )}
            </div>

            {/* Компактное 2-строчное описание */}
            {item.overview && (
              <div
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.25,
                  color: "rgba(255,255,255,0.7)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  maxHeight: 28,
                }}
              >
                {item.overview}
              </div>
            )}
          </div>
        </div>

        {/* Episodes Section — стиль 1-в-1 как в MovieModal */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 120,
            overflow: "hidden",
            padding: "4px 12px 8px 12px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "#fff",
            }}
          >
            <span>Серии</span>
            {episodes.length > 0 && (
              <span style={{ fontSize: 10, opacity: 0.5 }}>Найдено: {episodes.length}</span>
            )}
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
              padding: "2px 6px",
            }}
          >
            {loading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 28,
                  gap: 8,
                }}
              >
                <Spinner />
                <span style={{ fontSize: 12, opacity: 0.6 }}>Загрузка серий из торрента...</span>
              </div>
            ) : episodes.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 16px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 12,
                  lineHeight: "1.4",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 3 }}>
                    Серии пока не найдены
                  </div>
                  <div>
                    Если торрент только добавлен, подождите несколько секунд подключения к раздаче.
                  </div>
                </div>
                <Focusable
                  className="ds-btn ds-btn--primary"
                  noFocusRing
                  onActivate={() => fetchEpisodes(true)}
                  onClick={() => fetchEpisodes(true)}
                  onCancelButton={closeModal}
                  style={{ padding: "6px 20px", fontSize: 12 }}
                >
                  Проверить снова
                </Focusable>
              </div>
            ) : (
              episodes.map((ep: EpisodeItem) => {
                const isEpCompleted =
                  ep.downloaded || (ep.size > 0 && ep.completed >= ep.size);
                const isEpPartial = ep.completed > 0 && !isEpCompleted;
                const isEpDownloading = downloadingEpIdx === ep.index;

                return (
                  <div
                    key={ep.index}
                    className="projacktor-torrent-ep-row"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 10px",
                      marginBottom: 4,
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    {/* Информация о серии: нумерация по порядку с #1 */}
                    <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={ep.name}
                      >
                        {ep.name}
                      </div>
                      <div
                        style={{ fontSize: 10.5, color: "var(--ds-text-dim)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}
                      >
                        {ep.size > 0 && <span>{formatBytes(ep.size)}</span>}
                        {isEpCompleted && (
                          <span
                            style={{
                              color: "var(--ds-success)",
                              fontWeight: 600,
                            }}
                          >
                            ✓ Скачано
                          </span>
                        )}
                        {isEpPartial && (
                          <span style={{ color: "var(--ds-accent)" }}>
                            {formatBytes(ep.completed)} / {formatBytes(ep.size)} (
                            {((ep.completed / ep.size) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Кнопки действий */}
                    <Focusable
                      flow-children="horizontal"
                      noFocusRing
                      style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}
                      onCancelButton={closeModal}
                    >
                      <Focusable
                        className={`ds-btn ds-btn--compact ${isEpCompleted ? "ds-btn--success" : "ds-btn--primary"}`}
                        noFocusRing
                        onActivate={() => onWatchOnline(item, ep.index)}
                        onClick={() => onWatchOnline(item, ep.index)}
                        onCancelButton={closeModal}
                        title={isEpCompleted ? "Смотреть файл" : "Смотреть онлайн"}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        <FaPlay style={{ fontSize: 9, marginRight: 4 }} />
                        {isEpCompleted ? "Смотреть" : "Онлайн"}
                      </Focusable>

                      {!isEpCompleted && (
                        <Focusable
                          className="ds-btn ds-btn--compact"
                          noFocusRing
                          onActivate={() => handleDownload(ep)}
                          onClick={() => handleDownload(ep)}
                          onCancelButton={closeModal}
                          title="Скачать эту серию"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          {isEpDownloading ? (
                            <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 9, marginRight: 4 }} />
                          ) : (
                            <FaDownload style={{ fontSize: 9, marginRight: 4 }} />
                          )}
                          Скачать
                        </Focusable>
                      )}
                    </Focusable>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Focusable>
    </ModalRoot>
  );
};
