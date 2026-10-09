import { FC, memo, useState, useEffect } from "react";
import { Focusable } from "@decky/ui";
import { MediaItem, getImageUrl, fetchAgeRating } from "../api";
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
  const [ageRating, setAgeRating] = useState<string | null>(movie.age_rating || null);

  useEffect(() => {
    if (movie.age_rating) {
      setAgeRating(movie.age_rating);
      return;
    }
    let cancelled = false;
    fetchAgeRating(movie.id, movie.media_type).then((res) => {
      if (!cancelled && res) {
        setAgeRating(res);
        movie.age_rating = res;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [movie.id, movie.media_type, movie.age_rating]);

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
      <div className="projacktor-card-badges">
        {ageRating && (
          <div
            className={`projacktor-card-age-badge ${
              ageRating.includes("18")
                ? "age-18"
                : ageRating.includes("16")
                ? "age-16"
                : ageRating.includes("12")
                ? "age-12"
                : "age-kids"
            }`}
          >
            {ageRating}
          </div>
        )}
        {rating && <div className="projacktor-card-rating">★ {rating}</div>}
      </div>
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
