import { FC, useEffect, useRef } from "react";
import { ModalRoot, Focusable } from "@decky/ui";
import { FaPlay, FaDownload, FaSpinner } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes } from "../api";

interface EpisodesModalProps {
  item: LibraryItem;
  episodes: EpisodeItem[];
  loading: boolean;
  closeModal?: () => void;
  onWatchOnline: (item: LibraryItem, epIndex: number) => void;
  onDownloadEpisode: (item: LibraryItem, ep: EpisodeItem) => void;
}

export const EpisodesModal: FC<EpisodesModalProps> = ({
  item,
  episodes,
  loading,
  closeModal,
  onWatchOnline,
  onDownloadEpisode,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Фокус на первой кнопке при открытии
  useEffect(() => {
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
  }, [episodes.length]);

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
            Серии · нажмите B для закрытия
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
              Загрузка серий...
            </div>
          ) : episodes.length === 0 ? (
            <div
              style={{
                padding: "28px 0",
                textAlign: "center",
                color: "var(--ds-text-dim)",
                fontSize: 13,
              }}
            >
              Серии пока не найдены. Подождите несколько секунд.
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
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  onCancelButton={closeModal}
                >
                  {/* Информация о серии */}
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
                        #{ep.index + 1}
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

                  {/* Кнопки */}
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
                        onActivate={() => onDownloadEpisode(item, ep)}
                        onClick={() => onDownloadEpisode(item, ep)}
                        onCancelButton={closeModal}
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
      </Focusable>
    </ModalRoot>
  );
};
