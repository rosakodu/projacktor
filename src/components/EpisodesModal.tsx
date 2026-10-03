import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable, Spinner } from "@decky/ui";
import { FaPlay, FaSpinner } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, rpcGetEpisodes, sortEpisodes } from "../api";
import { PROJACKTOR_STYLES } from "../styles";
import { getActiveDocument } from "../runtime/activeDoc";
import { triggerHaptic } from "../runtime/haptics";
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
  const [localFiles, setLocalFiles] = useState<NonNullable<LibraryItem["files"]>>(item.files || []);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingEpIdx, setDownloadingEpIdx] = useState<number | null>(null);
  const [cancellingEpIdx, setCancellingEpIdx] = useState<number | null>(null);
  const [deletingEpIdx, setDeletingEpIdx] = useState<number | null>(null);
  const deletingEpIdxRef = useRef<number | null>(null);
  const [userSelectedEpIndices, setUserSelectedEpIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLocalFiles(item.files || []);
  }, [item.files]);

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
              setEpisodes(() => {
                const sorted = sortEpisodes(eps);
                return sorted.map((newEp) => {
                  if (deletingEpIdxRef.current === newEp.index) {
                    return { ...newEp, downloaded: false, completed: 0, selected: false };
                  }
                  return newEp;
                });
              });
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

  // Автоматический скролл контейнера серий при перемещении фокуса
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !listEl.contains(target)) return;
      const row = target.closest(".projacktor-torrent-ep-row") as HTMLElement | null;
      if (row) {
        const rowTop = row.offsetTop;
        const rowHeight = row.offsetHeight;
        const containerScrollTop = listEl.scrollTop;
        const containerHeight = listEl.clientHeight;

        if (rowTop < containerScrollTop) {
          listEl.scrollTo({ top: rowTop, behavior: "smooth" });
        } else if (rowTop + rowHeight > containerScrollTop + containerHeight) {
          listEl.scrollTo({ top: rowTop + rowHeight - containerHeight, behavior: "smooth" });
        }
      }
    };
    listEl.addEventListener("focusin", onFocusIn);
    return () => listEl.removeEventListener("focusin", onFocusIn);
  }, []);

  const restoreFocusToEpisodeBtn = useCallback((epIndex: number) => {
    setTimeout(() => {
      const row = listRef.current?.querySelector(`[data-ep-index="${epIndex}"]`);
      const newBtn = row?.querySelector<HTMLElement>(".ds-btn");
      if (newBtn) {
        const doc = getActiveDocument(newBtn) || document;
        doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        newBtn.focus();
        newBtn.classList.add("gpfocus");
        newBtn.classList.add("gpfocuswithin");
        try {
          (newBtn as any).TakeFocus?.(0);
        } catch {}
      }
    }, 60);
  }, []);

  const handleWatchOnline = (epIndex: number) => {
    triggerHaptic("click", "both");
    // Защита от фантомного клика / удержания кнопки A при открытии списка серий
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    onWatchOnline(item, epIndex);
  };

  const handleDownload = async (ep: EpisodeItem) => {
    triggerHaptic("click", "both");
    if (Date.now() - modalOpenedTimeRef.current < 450) {
      return;
    }
    setUserSelectedEpIndices((prev) => new Set(prev).add(ep.index));
    setDownloadingEpIdx(ep.index);
    setEpisodes((prev) =>
      prev.map((e) =>
        e.index === ep.index ? { ...e, downloaded: false, completed: 0, selected: true } : e
      )
    );
    restoreFocusToEpisodeBtn(ep.index);
    try {
      await onDownloadEpisode(item, ep);
      await fetchEpisodes(false);
      restoreFocusToEpisodeBtn(ep.index);
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
    setEpisodes((prev) =>
      prev.map((e) =>
        e.index === ep.index ? { ...e, downloaded: false, completed: 0, selected: false } : e
      )
    );
    restoreFocusToEpisodeBtn(ep.index);
    try {
      if (onCancelEpisodeDownload) {
        await onCancelEpisodeDownload(item, ep);
      }
      await fetchEpisodes(false);
      restoreFocusToEpisodeBtn(ep.index);
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
    deletingEpIdxRef.current = ep.index;
    setDeletingEpIdx(ep.index);
    try {
      // Оптимистично удаляем файл из localFiles и сбрасываем статус серии в episodes
      setLocalFiles((prev) =>
        prev.filter((f) => {
          if (f.file_name.toLowerCase() === ep.name.toLowerCase()) return false;
          const epMatch =
            ep.name.match(/(?:s|season\s*)(\d{1,3})(?:e|x|episode\s*|\b[.\s_-]+)(\d{1,4})/i) ||
            ep.name.match(/(?:e|ep|серия\s*)(\d{1,4})/i) ||
            ep.name.match(/(\d+)/);
          const fMatch =
            f.file_name.match(/(?:s|season\s*)(\d{1,3})(?:e|x|episode\s*|\b[.\s_-]+)(\d{1,4})/i) ||
            f.file_name.match(/(?:e|ep|серия\s*)(\d{1,4})/i) ||
            f.file_name.match(/(\d+)/);
          if (epMatch && fMatch && epMatch[0].toLowerCase() === fMatch[0].toLowerCase()) return false;
          return true;
        })
      );
      setEpisodes((prev) =>
        prev.map((e) =>
          e.index === ep.index ? { ...e, downloaded: false, completed: 0, selected: false } : e
        )
      );

      restoreFocusToEpisodeBtn(ep.index);

      if (onDeleteEpisode) {
        await onDeleteEpisode(item, ep);
      }
      await fetchEpisodes(false);
      restoreFocusToEpisodeBtn(ep.index);
    } finally {
      deletingEpIdxRef.current = null;
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
              episodes.map((ep: EpisodeItem, epIdx: number) => {
                const hasLocalFile = !!(localFiles && localFiles.some((f) => {
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
                    data-ep-index={ep.index}
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
                            {formatBytes(downloadingEpIdx === ep.index ? 0 : ep.completed)} / {formatBytes(ep.size)} (
                            {(downloadingEpIdx === ep.index ? 0 : (ep.completed / ep.size) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Кнопки действий: единая фиксированная ширина 190px для предсказуемости layout */}
                    <Focusable
                      flow-children="horizontal"
                      noFocusRing
                      className="projacktor-episode-actions"
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexShrink: 0,
                        width: 190,
                        justifyContent: "flex-end",
                      }}
                      onGamepadDirection={(evt: any) => {
                        const btn = evt?.detail?.button;
                        if (epIdx === episodes.length - 1 && (btn === 10 || btn === 6)) {
                          const cancelBtn = (listRef.current?.closest(".projacktor-modal-root, form, div") || document)?.querySelector<HTMLElement>(".ds-btn--compact[tabindex='0']");
                          if (cancelBtn) {
                            try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
                            const doc = getActiveDocument(cancelBtn) || document;
                            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                            cancelBtn.focus();
                            cancelBtn.classList.add("gpfocus", "gpfocuswithin");
                            try { (cancelBtn as any).TakeFocus?.(0); } catch {}
                            return false;
                          }
                        }
                        return undefined;
                      }}
                      onKeyDown={(e: any) => {
                        if (epIdx === episodes.length - 1 && e.key === "ArrowDown") {
                          const cancelBtn = (listRef.current?.closest(".projacktor-modal-root, form, div") || document)?.querySelector<HTMLElement>(".ds-btn--compact[tabindex='0']");
                          if (cancelBtn) {
                            e.preventDefault();
                            e.stopPropagation();
                            const doc = getActiveDocument(cancelBtn) || document;
                            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                            cancelBtn.focus();
                            cancelBtn.classList.add("gpfocus", "gpfocuswithin");
                            try { (cancelBtn as any).TakeFocus?.(0); } catch {}
                          }
                        }
                      }}
                    >
                      {/* Если скачано: Смотреть и Удалить */}
                      {isEpCompleted ? (
                        <>
                          <Focusable
                            className="ds-btn ds-btn--compact ds-btn--success"
                            noFocusRing
                            tabIndex={0}
                            onActivate={(e: any) => {
                              try { e?.stopPropagation?.(); } catch {}
                              handleWatchOnline(ep.index);
                            }}
                            onClick={(e: any) => {
                              try { e?.stopPropagation?.(); } catch {}
                              handleWatchOnline(ep.index);
                            }}
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
                            tabIndex={0}
                            onActivate={(e: any) => {
                              try { e?.stopPropagation?.(); } catch {}
                              handleDelete(ep);
                            }}
                            onClick={(e: any) => {
                              try { e?.stopPropagation?.(); } catch {}
                              handleDelete(ep);
                            }}
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
                          tabIndex={0}
                          onActivate={(e: any) => {
                            try { e?.stopPropagation?.(); } catch {}
                            handleCancelDownload(ep);
                          }}
                          onClick={(e: any) => {
                            try { e?.stopPropagation?.(); } catch {}
                            handleCancelDownload(ep);
                          }}
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
                          tabIndex={0}
                          onActivate={(e: any) => {
                            try { e?.stopPropagation?.(); } catch {}
                            handleDownload(ep);
                          }}
                          onClick={(e: any) => {
                            try { e?.stopPropagation?.(); } catch {}
                            handleDownload(ep);
                          }}
                          onCancelButton={closeModal}
                          title={t("downloadThisEpisode")}
                          style={modalBtnStyle}
                        >
                          {t("download")}
                        </Focusable>
                      )}
                    </Focusable>
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
            tabIndex={0}
            onActivate={closeModal}
            onClick={closeModal}
            onCancelButton={closeModal}
            onGamepadDirection={(evt: any) => {
              if (evt?.detail?.button === 9) {
                const rows = listRef.current?.querySelectorAll<HTMLElement>(".projacktor-torrent-ep-row");
                if (rows && rows.length > 0) {
                  const lastRow = rows[rows.length - 1];
                  const lastBtn = lastRow.querySelector<HTMLElement>(".ds-btn, [tabindex='0']");
                  if (lastBtn) {
                    try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
                    const doc = getActiveDocument(lastBtn) || document;
                    doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                    lastBtn.focus();
                    lastBtn.classList.add("gpfocus", "gpfocuswithin");
                    try { (lastBtn as any).TakeFocus?.(0); } catch {}
                    return false;
                  }
                }
              }
              return undefined;
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                const rows = listRef.current?.querySelectorAll<HTMLElement>(".projacktor-torrent-ep-row");
                if (rows && rows.length > 0) {
                  const lastRow = rows[rows.length - 1];
                  const lastBtn = lastRow.querySelector<HTMLElement>(".ds-btn, [tabindex='0']");
                  if (lastBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const doc = getActiveDocument(lastBtn) || document;
                    doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                    lastBtn.focus();
                    lastBtn.classList.add("gpfocus", "gpfocuswithin");
                    try { (lastBtn as any).TakeFocus?.(0); } catch {}
                  }
                }
              }
            }}
            style={modalBtnStyle}
          >
            {t("cancel")}
          </Focusable>
        </div>
      </Focusable>
    </ModalRoot>
  );
};
