import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem, getImageUrl } from "../api";
import { setBackdropMovie } from "../runtime/backdropBus";
import { useI18n } from "../i18n";

interface MovieCardProps {
  movie: MediaItem;
  onActivate: (movie: MediaItem) => void;
  onGamepadDirection?: (evt: any) => void;
}

export const MovieCard: FC<MovieCardProps> = memo(({ movie, onActivate, onGamepadDirection }) => {
  const { t } = useI18n();
  const title = movie.title || movie.name || t("noTitle");
  const date = movie.release_date || movie.first_air_date || "";
  const year = date ? String(date).split("-")[0] : "";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : null;
  const posterUrl = getImageUrl(movie.poster_path);

  return (
    <Focusable
      className="projacktor-card"
      noFocusRing
      onActivate={() => onActivate(movie)}
      onClick={() => onActivate(movie)}
      onOKActionDescription={t("details")}
      onGamepadDirection={onGamepadDirection}
      onFocus={() => setBackdropMovie(movie)}
      onMouseEnter={() => setBackdropMovie(movie)}
    >
      {rating && <div className="projacktor-card-rating">★ {rating}</div>}
      <img
        src={posterUrl}
        alt={title}
        className="projacktor-card-poster"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="projacktor-card-info">
        <div className="projacktor-card-title" title={title}>
          {title}
        </div>
        {year && <div className="projacktor-card-year">{year}</div>}
      </div>
    </Focusable>
  );
});
