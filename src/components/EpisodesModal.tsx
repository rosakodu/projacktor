import { FC, useState, useEffect, useRef, useCallback } from "react";
import { ModalRoot, Focusable } from "@decky/ui";
import { FaPlay, FaDownload, FaSpinner } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, rpcGetEpisodes, sortEpisodes } from "../api";

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
        noFocusRing
        style={{ display: "flex", flexDirection: "column", gap: 0 }}
        onCancelButton={closeModal}
      >
        {/* Шапка */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
            {item.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--ds-text-dim)", marginTop: 2 }}>
            Выбор серии · нажмите B для закрытия
          </div>
        </div>

        {/* Список серий */}
        <div
          ref={listRef}
          style={{ maxHeight: 380, overflowY: "auto", padding: "4px 0" }}
        >
          {loading ? (
            <div
              style={{
                padding: "28px 0",
                textAlign: "center",
                color: "var(--ds-text-dim)",
                fontSize: 13,
              }}
            >
              <FaSpinner
                style={{
                  animation: "projacktor-spin 0.9s linear infinite",
                  marginRight: 8,
                }}
              />
              Загрузка серий из торрента...
            </div>
          ) : episodes.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "var(--ds-text-dim)",
                fontSize: 13,
              }}
            >
              <div>Серии пока не найдены. Если торрент только добавлен, подождите несколько секунд подключения к раздаче.</div>
              <Focusable
                className="ds-btn ds-btn--compact ds-btn--primary"
                noFocusRing
                onActivate={() => fetchEpisodes(true)}
                onClick={() => fetchEpisodes(true)}
                onCancelButton={closeModal}
                style={{ marginTop: 12 }}
              >
                Проверить снова
              </Focusable>
            </div>
          ) : (
            episodes.map((ep: EpisodeItem, idx: number) => {
              const isEpCompleted =
                ep.downloaded || (ep.size > 0 && ep.completed >= ep.size);
              const isEpPartial = ep.completed > 0 && !isEpCompleted;
              const isEpDownloading = downloadingEpIdx === ep.index;

              return (
                <Focusable
                  key={ep.index}
                  noFocusRing
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onCancelButton={closeModal}
                >
                  {/* Информация о серии: отображаем #1, #2, #3 по порядку */}
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={ep.name}
                    >
                      <span style={{ color: "var(--ds-accent)", marginRight: 6 }}>
                        #{idx + 1}
                      </span>
                      {ep.name}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "var(--ds-text-dim)", marginTop: 2 }}
                    >
                      {ep.size > 0 ? formatBytes(ep.size) : ""}
                      {isEpCompleted && (
                        <span
                          style={{
                            color: "var(--ds-success)",
                            marginLeft: 8,
                            fontWeight: 600,
                          }}
                        >
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

                  {/* Кнопки действий */}
                  <Focusable
                    flow-children="horizontal"
                    noFocusRing
                    style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
                    onCancelButton={closeModal}
                  >
                    <Focusable
                      className={`ds-btn ds-btn--compact${isEpCompleted ? " ds-btn--primary" : ""}`}
                      noFocusRing
                      onActivate={() => onWatchOnline(item, ep.index)}
                      onClick={() => onWatchOnline(item, ep.index)}
                      onCancelButton={closeModal}
                      title={isEpCompleted ? "Смотреть файл" : "Смотреть онлайн"}
                    >
                      <FaPlay style={{ fontSize: 10, marginRight: 4 }} />
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
                      >
                        {isEpDownloading ? (
                          <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 10, marginRight: 4 }} />
                        ) : (
                          <FaDownload style={{ fontSize: 10, marginRight: 4 }} />
                        )}
                        Скачать
                      </Focusable>
                    )}
                  </Focusable>
                </Focusable>
              );
            })
          )}
        </div>
      </Focusable>
    </ModalRoot>
  );
};
