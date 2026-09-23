import { FC, useRef, useState, useEffect } from "react";

interface MarqueeTitleProps {
  title: string;
  isFocused?: boolean;
  className?: string;
}

export const MarqueeTitle: FC<MarqueeTitleProps> = ({ title, isFocused, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState<number>(0);

  useEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      const diff = t.scrollWidth - c.clientWidth;
      if (diff > 4) {
        setOverflowPx(diff);
      } else {
        setOverflowPx(0);
      }
    };

    measure();
    const t1 = setTimeout(measure, 100);
    const t2 = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
    };
  }, [title]);

  const hasOverflow = overflowPx > 0;
  // Speed: ~28px/second, smoothly bounded between 4s and 16s
  const durationSec = Math.max(4, Math.min(16, (overflowPx + 40) / 28));

  return (
    <div
      ref={containerRef}
      className={`projacktor-torrent-title ${hasOverflow ? "projacktor-torrent-title--marquee" : ""} ${isFocused ? "projacktor-torrent-title--active" : ""} ${className || ""}`}
      title={title}
      style={{
        ["--marquee-dist" as any]: `-${overflowPx + 10}px`,
        ["--marquee-dur" as any]: `${durationSec}s`,
      }}
    >
      <span ref={textRef} className="projacktor-torrent-title-inner">
        {title}
      </span>
    </div>
  );
};
