import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable, Spinner } from "@decky/ui";
import { FaPlay, FaSpinner } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, rpcGetEpisodes, sortEpisodes } from "../api";
import { PROJACKTOR_STYLES } from "../styles";
import { getActiveDocument } from "../runtime/activeDoc";
import { useI18n } from "../i18n";

const modalBtnStyle: React.CSSProperties = {
  width: 92,
  minWidth: 92,
  maxWidth: 92,
  height: 28,
  minHeight: 28,
  maxHeight: 28,
  padding: "0 8px",
  fontSize: 11,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  borderRadius: "var(--ds-radius-sm, 4px)",
  textAlign: "center",
};

interface EpisodesModalProps {
  item: LibraryItem;
  closeModal?: () => void;
  onWatchOnline: (item: LibraryItem, epIndex: number) => void;
  onDownloadEpisode: (item: LibraryItem, ep: EpisodeItem) => void;
  onPauseEpisodeDownload?: (item: LibraryItem, ep: EpisodeItem) => void;
  onCancelEpisodeDownload?: (item: LibraryItem, ep: EpisodeItem) => void;
  onDeleteEpisode?: (item: LibraryItem, ep: EpisodeItem) => void;
}

export const EpisodesModal: FC<EpisodesModalProps> = ({
  item,
  closeModal,
  onWatchOnline,
  onDownloadEpisode,
  onPauseEpisodeDownload: _onPauseEpisodeDownload,
  onCancelEpisodeDownload,
  onDeleteEpisode,
}) => {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);
  const [cancellingEpIdx, setCancellingEpIdx] = useState<number | null>(null);
  const [deletingEpIdx, setDeletingEpIdx] = useState<number | null>(null);
  const [userSelectedEpIndices, setUserSelectedEpIndices] = useState<Set<number>>(new Set());

  const title = item.title || t("noTitle");
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
    const fetch = () => {
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
    };

    fetch();
    const interval = setInterval(() => {
      if (active) {
        rpcGetEpisodes(item.id)
          .then((eps) => {
            if (active && Array.isArray(eps)) {
              setEpisodes(sortEpisodes(eps));
            }
          })
          .catch(() => {});
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [item.id]);

  const modalOpenedTimeRef = useRef<number>(Date.now());

  // Фокус на первой кнопке при загрузке серий (с безопасной задержкой 250мс для предотвращения случайного нажатия A)
  useEffect(() => {
    if (loading || episodes.length === 0) return;
    const t = setTimeout(() => {
      const first = listRef.current?.querySelector<HTMLElement>(
        ".projacktor-episode-actions .projacktor-icon-btn, .projacktor-icon-btn, .ds-btn, [tabindex='0'], button"
      );
      if (first) {
        const doc = getActiveDocument(first) || document;
        doc.querySelectorAll(".gpfocus").forEach((el) => {
          if (el !== first) el.classList.remove("gpfocus");
        });
        first.focus();
        first.classList.add("gpfocus");
        first.classList.add("gpfocuswithin");
        try {
          (first as any).TakeFocus?.(0);
        } catch {}
      }
    }, 250);
    return () => clearTimeout(t);
  }, [loading, episodes.length]);

  const handleWatchOnline = (epIndex: number) => {
    // Защита от фантомного клика / удержания кнопки A при открытии списка серий
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    onWatchOnline(item, epIndex);
  };

  const handleDownload = async (ep: EpisodeItem) => {
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    setUserSelectedEpIndices((prev) => new Set(prev).add(ep.index));
    setDownloadingEpIdx(ep.index);
    try {
      await onDownloadEpisode(item, ep);
      await fetchEpisodes(false);
    } finally {
      setDownloadingEpIdx(null);
    }
  };

  const handleCancelDownload = async (ep: EpisodeItem) => {
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    setUserSelectedEpIndices((prev) => {
      const next = new Set(prev);
      next.delete(ep.index);
      return next;
    });
    setCancellingEpIdx(ep.index);
    try {
      if (onCancelEpisodeDownload) {
        await onCancelEpisodeDownload(item, ep);
      }
      await fetchEpisodes(false);
    } finally {
      setCancellingEpIdx(null);
    }
  };

  const handleDelete = async (ep: EpisodeItem) => {
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    setUserSelectedEpIndices((prev) => {
      const next = new Set(prev);
      next.delete(ep.index);
      return next;
    });
    setDeletingEpIdx(ep.index);
    try {
      if (onDeleteEpisode) {
        await onDeleteEpisode(item, ep);
      }
      await fetchEpisodes(false);
    } finally {
      setDeletingEpIdx(null);
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
                {item.media_type === "tv" ? t("seriesBadge") : t("movieBadge")}
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
            <span>{t("episodes")}</span>
            {episodes.length > 0 && (
              <span style={{ fontSize: 10, opacity: 0.5 }}>{t("foundCount")}: {episodes.length}</span>
            )}
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
              padding: "6px 8px",
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
                <span style={{ fontSize: 12, opacity: 0.6 }}>{t("loadingEpisodes")}</span>
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
                    {t("noEpisodesYet")}
                  </div>
                  <div>
                    {t("episodesWaitDesc")}
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
                  {t("checkAgain")}
                </Focusable>
              </div>
            ) : (
              episodes.map((ep: EpisodeItem) => {
                const hasLocalFile = !!(item.files && item.files.some((f) => {
                  if (f.file_size <= 100 * 1024) return false;
                  if (f.file_name.toLowerCase() === ep.name.toLowerCase()) return true;
                  const epMatch = ep.name.match(/(?:s|season\s*)(\d{1,3})(?:e|x|episode\s*|\b[.\s_-]+)(\d{1,4})/i) || ep.name.match(/(?:e|ep|серия\s*)(\d{1,4})/i) || ep.name.match(/(\d+)/);
                  const fMatch = f.file_name.match(/(?:s|season\s*)(\d{1,3})(?:e|x|episode\s*|\b[.\s_-]+)(\d{1,4})/i) || f.file_name.match(/(?:e|ep|серия\s*)(\d{1,4})/i) || f.file_name.match(/(\d+)/);
                  if (epMatch && fMatch && epMatch[0].toLowerCase() === fMatch[0].toLowerCase()) return true;
                  return false;
                }));

                const isEpCompleted =
                  ep.downloaded === true || hasLocalFile;
                const isEpSelected = ep.selected === true || userSelectedEpIndices.has(ep.index);
                const isEpPartial = !isEpCompleted && ep.completed > 0;
                const isEpCancelling = cancellingEpIdx === ep.index;
                const isEpDeleting = deletingEpIdx === ep.index;
                const isEpInQueueOrDownloading =
                  !isEpCompleted && (isEpSelected || isEpPartial || downloadingEpIdx === ep.index || isEpCancelling);

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
                            {t("downloadedBadge")}
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

                    {/* Кнопки действий: единая фиксированная ширина 190px для предсказуемости layout */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexShrink: 0,
                        width: 190,
                        justifyContent: "flex-end",
                      }}
                    >
                      {/* Если скачано: Смотреть и Удалить */}
                      {isEpCompleted ? (
                        <>
                          <Focusable
                            className="ds-btn ds-btn--compact ds-btn--success"
                            noFocusRing
                            onActivate={() => handleWatchOnline(ep.index)}
                            onClick={() => handleWatchOnline(ep.index)}
                            onCancelButton={closeModal}
                            title={t("watchFile")}
                            style={modalBtnStyle}
                          >
                            <FaPlay style={{ fontSize: 9, marginRight: 4 }} />
                            {t("watch")}
                          </Focusable>
                          <Focusable
                            className="ds-btn ds-btn--compact ds-btn--danger"
                            noFocusRing
                            onActivate={() => handleDelete(ep)}
                            onClick={() => handleDelete(ep)}
                            onCancelButton={closeModal}
                            title={t("delete")}
                            style={modalBtnStyle}
                          >
                            {isEpDeleting && (
                              <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 9, marginRight: 4 }} />
                            )}
                            {t("delete")}
                          </Focusable>
                        </>
                      ) : isEpInQueueOrDownloading ? (
                        /* Если нажали скачать / скачивается: кнопка меняет название на Отмена и становится красной */
                        <Focusable
                          className="ds-btn ds-btn--compact ds-btn--danger"
                          noFocusRing
                          onActivate={() => handleCancelDownload(ep)}
                          onClick={() => handleCancelDownload(ep)}
                          onCancelButton={closeModal}
                          title={t("cancel")}
                          style={modalBtnStyle}
                        >
                          {(isEpCancelling || downloadingEpIdx === ep.index) && (
                            <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 9, marginRight: 4 }} />
                          )}
                          {t("cancel")}
                        </Focusable>
                      ) : (
                        /* Если не скачивается: кнопка Скачать того же строгого размера */
                        <Focusable
                          className="ds-btn ds-btn--compact"
                          noFocusRing
                          onActivate={() => handleDownload(ep)}
                          onClick={() => handleDownload(ep)}
                          onCancelButton={closeModal}
                          title={t("downloadThisEpisode")}
                          style={modalBtnStyle}
                        >
                          {t("download")}
                        </Focusable>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Нижняя панель с кнопкой закрытия/отмены того же размера */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "8px 12px 10px 12px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <Focusable
            className="ds-btn ds-btn--compact"
            noFocusRing
            onActivate={closeModal}
            onClick={closeModal}
            onCancelButton={closeModal}
            style={modalBtnStyle}
          >
            {t("cancel")}
          </Focusable>
        </div>
      </Focusable>
    </ModalRoot>
  );
};
