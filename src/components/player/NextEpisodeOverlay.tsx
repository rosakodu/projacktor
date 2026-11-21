import { useEffect, useRef } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay } from "react-icons/fa";
import type { PlaylistItem } from "../../types";
import { getImageUrl } from "../../api";
import { useI18n } from "../../i18n";

interface NextEpisodeOverlayProps {
  episode: PlaylistItem;
  loading: boolean;
  failed: boolean;
  onPlay: () => void;
  onClose?: () => void;
  focusControl: (el: HTMLElement) => void;
}

export function NextEpisodeOverlay({ episode, loading, failed, onPlay, onClose, focusControl }: NextEpisodeOverlayProps) {
  const { t } = useI18n();
  const playRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playRef.current) focusControl(playRef.current);
  }, [focusControl]);

  const poster = episode.mediaInfo?.posterPath;
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 40, display: "grid", placeItems: "center",
      background: "rgba(5, 9, 14, 0.88)", padding: 24,
    }}>
      <section aria-label={t("nextEpisode")} style={{
        display: "flex", alignItems: "center", gap: 24, padding: 24, maxWidth: 600,
        background: "var(--ds-surface, #151c28)", border: "1px solid var(--ds-border, #364456)",
        borderRadius: 12, boxShadow: "0 16px 48px #0008",
      }}>
        {poster && <img alt="" src={getImageUrl(poster)} style={{ width: 112, borderRadius: 6 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--ds-accent, #71bfff)", fontSize: 14, fontWeight: 600 }}>
            {t("nextEpisode")}
          </div>
          <h2 style={{ margin: "8px 0", fontSize: 24, overflowWrap: "anywhere" }}>{episode.title}</h2>
          <div style={{ fontSize: 14, color: "#c8d6e5" }}>
            {episode.downloaded ? t("downloadedBadge") : t("nextEpisodeOnline")}
          </div>
          {(loading || failed) && (
            <div role="status" style={{ marginTop: 12, color: failed ? "#ffacac" : "#c8d6e5" }}>
              {loading ? t("nextEpisodePreparing") : t("nextEpisodeFailed")}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
            <Focusable
              ref={playRef} tabIndex={0} className="ds-btn ds-btn--primary"
              onActivate={onPlay} onClick={onPlay} aria-disabled={loading}
              style={{ padding: "10px 16px", gap: 8, opacity: loading ? 0.65 : 1 }}
            >
              <FaPlay aria-hidden="true" /> {failed ? t("retry") : t("play")}
            </Focusable>
            {onClose && (
              <Focusable
                tabIndex={0} data-next-episode-close className="ds-btn" onActivate={onClose} onClick={onClose}
                style={{ padding: "10px 16px" }}
              >
                {t("close")}
              </Focusable>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
