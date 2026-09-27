import { useRef, useCallback } from "react";
import { PlayerMediaInfo } from "../../types";
import { rpcSaveWatchProgress } from "../../api";

interface UsePlayerProgressParams {
  filePath: string;
  actualFilePath: string | null;
  title: string;
  initialTime?: number;
  mediaInfo?: PlayerMediaInfo;
  torrentHash?: string;
  isOnline: boolean;
  duration: number;
}

export interface UsePlayerProgressReturn {
  savedStartTime: number;
  savedStartTimeRef: React.MutableRefObject<number>;
  saveProgress: (sec: number, totalDur?: number) => void;
  saveProgressRef: React.MutableRefObject<(sec: number, totalDur?: number) => void>;
}

export function usePlayerProgress({
  filePath,
  actualFilePath,
  title,
  initialTime,
  mediaInfo,
  torrentHash,
  isOnline,
  duration,
}: UsePlayerProgressParams): UsePlayerProgressReturn {
  const getSavedProgress = useCallback((): number => {
    try {
      if (initialTime !== undefined && initialTime > 0) {
        return Math.floor(initialTime);
      }
      const fileTarget = actualFilePath || filePath;
      const rawFileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
      const fileName = rawFileName.split("?")[0];
      const raw = localStorage.getItem(`projacktor_progress_${fileName}`);
      if (raw) {
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 15) return Math.floor(val);
      }
      const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
      if (cleanTitle) {
        const rawTitle = localStorage.getItem(`projacktor_progress_t_${cleanTitle}`);
        if (rawTitle) {
          const val = parseFloat(rawTitle);
          if (!isNaN(val) && val > 15) return Math.floor(val);
        }
      }
    } catch {}
    return 0;
  }, [actualFilePath, filePath, title, initialTime]);

  const savedStartTime = getSavedProgress();
  const savedStartTimeRef = useRef<number>(savedStartTime);

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const saveProgress = useCallback(
    (sec: number, totalDur?: number) => {
      try {
        const fileTarget = actualFilePath || filePath;
        const rawFileName = fileTarget.split(/[\/\\]/).pop() || fileTarget;
        const fileName = rawFileName.split("?")[0];
        const cleanTitle = title.replace(/\s*\((?:Онлайн|Online)\)\s*/i, "").trim();
        const dur = totalDur ?? durationRef.current;
        if (dur && dur > 0 && sec >= dur - 60) {
          localStorage.removeItem(`projacktor_progress_${fileName}`);
          if (cleanTitle) {
            localStorage.removeItem(`projacktor_progress_t_${cleanTitle}`);
          }
        } else if (sec > 15) {
          localStorage.setItem(`projacktor_progress_${fileName}`, String(Math.floor(sec)));
          if (cleanTitle) {
            localStorage.setItem(`projacktor_progress_t_${cleanTitle}`, String(Math.floor(sec)));
          }
        }

        if (sec >= 0) {
          rpcSaveWatchProgress(
            JSON.stringify({
              media_id: mediaInfo?.mediaId,
              tmdb_id: mediaInfo?.tmdbId,
              title: mediaInfo?.title || cleanTitle,
              original_title: mediaInfo?.originalTitle,
              media_type: mediaInfo?.mediaType || "movie",
              year: mediaInfo?.year,
              poster_path: mediaInfo?.posterPath,
              backdrop_path: mediaInfo?.backdropPath,
              overview: mediaInfo?.overview,
              file_path: actualFilePath || filePath,
              stream_url: filePath.startsWith("http") ? filePath : undefined,
              torrent_hash: torrentHash,
              is_online: isOnline,
              episode_name: mediaInfo?.episodeName,
              season_number: mediaInfo?.seasonNumber,
              episode_number: mediaInfo?.episodeNumber,
              current_time: sec,
              duration: dur || 0,
            })
          ).catch(() => {});
        }
      } catch {}
    },
    [actualFilePath, filePath, title, mediaInfo, isOnline, torrentHash]
  );

  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  return {
    savedStartTime,
    savedStartTimeRef,
    saveProgress,
    saveProgressRef,
  };
}
