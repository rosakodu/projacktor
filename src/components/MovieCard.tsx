import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem, getImageUrl } from "../api";

interface MovieCardProps {
  movie: MediaItem;
  onActivate: (movie: MediaItem) => void;
  onGamepadDirection?: (evt: any) => void;
}

export const MovieCard: FC<MovieCardProps> = memo(({ movie, onActivate, onGamepadDirection }) => {
  const title = movie.title || movie.name || "Без названия";
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
      onOKActionDescription="Подробнее"
      onGamepadDirection={onGamepadDirection}
    >
      {rating && <div className="projacktor-card-rating">★ {rating}</div>}
      <img
        src={posterUrl}
        alt={title}
        className="projacktor-card-poster"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = getImageUrl(null);
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
