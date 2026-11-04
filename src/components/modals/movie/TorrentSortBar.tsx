import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { useI18n } from "../../../i18n";
import { TorrentSortBarProps } from "./types";

export const TorrentSortBar: FC<TorrentSortBarProps> = memo(({
  sortMode, onSortChange, onGamepadDirection, torrentsCount,
}) => {
  const { t } = useI18n();

  return (
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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{t("torrents")}</span>
        {torrentsCount > 0 && (
          <span style={{ fontSize: 10, opacity: 0.5 }}>({torrentsCount})</span>
        )}
      </div>

      {torrentsCount > 1 && (
        <div className="projacktor-torrent-sort-bar">
          <Focusable
            noFocusRing
            tabIndex={0}
            className={`projacktor-sort-pill ${sortMode === "seeds" ? "projacktor-sort-pill--active" : ""}`}
            onClick={() => onSortChange("seeds")}
            onActivate={() => onSortChange("seeds")}
            onGamepadDirection={onGamepadDirection}
          >
            {t("sortBySeeds")}
          </Focusable>
          <Focusable
            noFocusRing
            tabIndex={0}
            className={`projacktor-sort-pill ${sortMode === "newest" ? "projacktor-sort-pill--active" : ""}`}
            onClick={() => onSortChange("newest")}
            onActivate={() => onSortChange("newest")}
            onGamepadDirection={onGamepadDirection}
          >
            {t("sortByNewest")}
          </Focusable>
          <Focusable
            noFocusRing
            tabIndex={0}
            className={`projacktor-sort-pill ${sortMode === "oldest" ? "projacktor-sort-pill--active" : ""}`}
            onClick={() => onSortChange("oldest")}
            onActivate={() => onSortChange("oldest")}
            onGamepadDirection={onGamepadDirection}
          >
            {t("sortByOldest")}
          </Focusable>
        </div>
      )}
    </div>
  );
});
