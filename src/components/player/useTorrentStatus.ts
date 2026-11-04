import { useState, useRef, useEffect, MutableRefObject } from "react";
import { API_BASE } from "../../api";
import { TorrentStatusInfo } from "./PlayerHUD";

interface UseTorrentStatusProps {
  isOnline: boolean;
  hasStartedPlayback?: boolean;
  hasStartedPlaybackRef?: MutableRefObject<boolean>;
  filePath: string;
  torrentHash?: string;
  onError: (msg: string) => void;
  setIsBuffering: (b: boolean) => void;
}

export function useTorrentStatus({
  isOnline, hasStartedPlayback = false, hasStartedPlaybackRef, filePath, torrentHash, onError, setIsBuffering,
}: UseTorrentStatusProps) {
  const [torrentStatus, setTorrentStatus] = useState<TorrentStatusInfo | null>(null);
  const zeroSeedersCountRef = useRef<number>(0);
  const isStarted = () => (hasStartedPlaybackRef ? hasStartedPlaybackRef.current : hasStartedPlayback);

  useEffect(() => {
    if (!isOnline || isStarted()) return;
    let cancelled = false;
    let pollTimer: any = null;
    zeroSeedersCountRef.current = 0;

    const pollStatus = () => {
      if (cancelled || isStarted()) return;
      const queryParam = torrentHash ? `hash=${encodeURIComponent(torrentHash)}` : `url=${encodeURIComponent(filePath)}`;
      fetch(`${API_BASE}/stream/torrent_status?${queryParam}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || isStarted()) return;
          if (data && data.success && data.status) {
            setTorrentStatus(data.status);
            const seeders = data.status.connected_seeders || 0;
            const speed = data.status.download_speed || 0;
            if (seeders === 0 && speed === 0) {
              zeroSeedersCountRef.current += 1;
              if (zeroSeedersCountRef.current >= 23 && !isStarted()) {
                onError("На данной раздаче нет доступных сидеров в сети. Пожалуйста, вернитесь назад и выберите другую раздачу из списка.");
                setIsBuffering(false);
                return;
              }
            } else {
              zeroSeedersCountRef.current = 0;
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled && !isStarted()) {
            pollTimer = setTimeout(pollStatus, 1500);
          }
        });
    };

    pollStatus();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [isOnline, hasStartedPlayback, hasStartedPlaybackRef, filePath, torrentHash, onError, setIsBuffering]);

  return { torrentStatus, zeroSeedersCountRef };
}
