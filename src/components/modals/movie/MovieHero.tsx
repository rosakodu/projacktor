import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { FaBookmark, FaCheck } from "react-icons/fa";
import { useI18n } from "../../../i18n";
import { getActiveDocument } from "../../../runtime/activeDoc";
import { MovieHeroProps } from "./types";
import { isEvtDown } from "./gamepadHelpers";

export const MovieHero: FC<MovieHeroProps> = memo(({
  movie, title, year, ageRating, rating, inWatchlist,
  onToggleWatchlist, torrentsRef,
  sortedTorrentsCount, focusEl, navigateDownToTorrents,
}) => {
  const { t } = useI18n();

  const handleGamepadDirection = (evt: any) => {
    if (isEvtDown(evt)) {
      try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
      const doc = getActiveDocument(torrentsRef.current) || document;
      const sortBar = doc.querySelector<HTMLElement>(".projacktor-torrent-sort-bar");
      const activePill = doc.querySelector<HTMLElement>(".projacktor-sort-pill--active") || doc.querySelector<HTMLElement>(".projacktor-sort-pill");
      if (sortBar && activePill && sortedTorrentsCount > 1) {
        focusEl(activePill);
      } else {
        navigateDownToTorrents();
      }
      return false;
    }
    return undefined;
  };

  const getAgeRatingStyle = (ratingStr: string) => {
    const is18 = ratingStr.includes("18");
    const is16 = ratingStr.includes("16");
    const is12 = ratingStr.includes("12");
    return {
      fontSize: 9.5, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
      background: is18 ? "rgba(239, 68, 68, 0.25)" : is16 ? "rgba(249, 115, 22, 0.25)" : is12 ? "rgba(234, 179, 8, 0.25)" : "rgba(34, 197, 94, 0.25)",
      color: is18 ? "#f87171" : is16 ? "#fb923c" : is12 ? "#facc15" : "#4ade80",
      border: `1px solid ${is18 ? "rgba(239, 68, 68, 0.5)" : is16 ? "rgba(249, 115, 22, 0.5)" : is12 ? "rgba(234, 179, 8, 0.5)" : "rgba(34, 197, 94, 0.5)"}`,
    };
  };

  return (
    <div style={{ padding: "8px 12px 6px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 10.5, opacity: 0.85, alignItems: "center" }}>
          {year && <span>{year}</span>}
          {ageRating && <span style={getAgeRatingStyle(ageRating)}>{ageRating}</span>}
          {rating && <span style={{ color: "#fbbf24", fontWeight: 700 }}>★ {rating}</span>}
          <span style={{ textTransform: "uppercase", fontSize: 9, padding: "1px 4px", background: "rgba(255,255,255,0.1)", fontWeight: 600, letterSpacing: 0.4 }}>
            {movie.media_type === "tv" ? t("seriesBadge") : t("movieBadge")}
          </span>
        </div>
        {movie.overview && (
          <div style={{ fontSize: 10.5, lineHeight: 1.25, color: "rgba(255,255,255,0.7)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", maxHeight: 28 }}>
            {movie.overview}
          </div>
        )}
      </div>

      <Focusable
        className={`ds-btn projacktor-watchlist-btn ${inWatchlist ? "active" : ""}`}
        noFocusRing
        tabIndex={0}
        onClick={onToggleWatchlist}
        onActivate={onToggleWatchlist}
        onGamepadDirection={handleGamepadDirection}
        title={inWatchlist ? t("removeFromWatchlist") : t("addToWatchlist")}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600,
          borderRadius: 6, cursor: "pointer", flexShrink: 0, alignSelf: "flex-start",
          background: inWatchlist ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.08)",
          border: inWatchlist ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
          color: inWatchlist ? "#4ade80" : "#fff", transition: "all 0.15s ease",
        }}
      >
        {inWatchlist ? <FaCheck size={10} /> : <FaBookmark size={10} />}
        <span>{inWatchlist ? t("inWatchlist") : t("addToWatchlist")}</span>
      </Focusable>
    </div>
  );
});
