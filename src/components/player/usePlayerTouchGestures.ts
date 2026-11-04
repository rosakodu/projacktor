import { useRef } from "react";

interface UsePlayerTouchGesturesProps {
  togglePlay: () => void;
  seekRelative: (delta: number) => void;
  changeVolume: (delta: number) => void;
  resetControlsTimer: () => void;
}

export function usePlayerTouchGestures({
  togglePlay, seekRelative, changeVolume, resetControlsTimer,
}: UsePlayerTouchGesturesProps) {
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchMovedRef = useRef<boolean>(false);

  const handleVideoTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchMovedRef.current = false;
    }
  };

  const handleVideoTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
      touchMovedRef.current = true;
    }
  };

  const handleVideoTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current !== null && touchStartYRef.current !== null) {
      const changedTouch = e.changedTouches[0];
      const deltaX = changedTouch.clientX - touchStartXRef.current;
      const deltaY = changedTouch.clientY - touchStartYRef.current;

      if (!touchMovedRef.current) {
        togglePlay();
      } else {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
          seekRelative(deltaX > 0 ? 15 : -15);
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) {
          const isRightHalf = touchStartXRef.current > window.innerWidth / 2;
          if (isRightHalf) {
            changeVolume(deltaY < 0 ? 0.1 : -0.1);
          }
        }
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchMovedRef.current = false;
    resetControlsTimer();
  };

  return {
    handleVideoTouchStart,
    handleVideoTouchMove,
    handleVideoTouchEnd,
  };
}
