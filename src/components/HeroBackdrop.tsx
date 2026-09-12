import { FC, memo, useEffect, useState, useRef } from "react";
import { subscribeBackdrop } from "../runtime/backdropBus";

export const HeroBackdrop: FC = memo(() => {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const [fadeState, setFadeState] = useState<"idle" | "fading">("idle");
  const nextUrlRef = useRef<string | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  activeUrlRef.current = activeUrl;
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const un = subscribeBackdrop((url) => {
      if (url === activeUrlRef.current) return;
      nextUrlRef.current = url;

      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      if (!url) {
        setPrevUrl(activeUrlRef.current);
        setActiveUrl(null);
        setFadeState("fading");
        fadeTimerRef.current = setTimeout(() => {
          setPrevUrl(null);
          setFadeState("idle");
        }, 400);
        return;
      }

      const img = new Image();
      let handled = false;
      const onLoad = () => {
        if (handled) return;
        handled = true;
        if (nextUrlRef.current !== url) return;

        setPrevUrl(activeUrlRef.current);
        setActiveUrl(url);
        setFadeState("fading");
        fadeTimerRef.current = setTimeout(() => {
          setPrevUrl(null);
          setFadeState("idle");
        }, 400);
      };

      img.onload = onLoad;
      img.onerror = () => {
        if (nextUrlRef.current === url) {
          setPrevUrl(null);
          setActiveUrl(null);
          setFadeState("idle");
        }
      };
      img.src = url;

      if (img.complete) {
        onLoad();
      }
    });

    return () => {
      un();
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
    };
  }, []);

  if (!activeUrl && !prevUrl) {
    return (
      <div
        className="projacktor-hero-backdrop-root"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: "#0b1016",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="projacktor-hero-backdrop-root"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        background: "#0b1016",
      }}
      aria-hidden="true"
    >
      {/* Предыдущий кадр для плавного затухания */}
      {prevUrl && (
        <img
          src={prevUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 20%",
            opacity: fadeState === "fading" ? 0 : 0.55,
            transition: "opacity 0.4s ease-in-out",
            filter: "saturate(1.05) brightness(0.9)",
            transform: "scale(1.02)",
          }}
        />
      )}

      {/* Текущий активный кадр */}
      {activeUrl && (
        <img
          src={activeUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 20%",
            opacity: 0.55,
            transition: "opacity 0.4s ease-in-out",
            filter: "saturate(1.05) brightness(0.9)",
            transform: "scale(1.02)",
          }}
        />
      )}

      {/* 1. Верхний защитный градиент под Header и TabBar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 180,
          background:
            "linear-gradient(to bottom, rgba(11, 16, 22, 0.95) 0%, rgba(11, 16, 22, 0.5) 55%, transparent 100%)",
        }}
      />

      {/* 2. Радиальная виньетка по краям */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 110% 80% at 50% 30%, transparent 40%, rgba(11, 16, 22, 0.5) 75%, #0b1016 100%)",
        }}
      />

      {/* 3. Нижний градиент за полками и карточками */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "65%",
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(11, 16, 22, 0.25) 20%, rgba(11, 16, 22, 0.75) 55%, #0b1016 88%)",
        }}
      />
    </div>
  );
});
