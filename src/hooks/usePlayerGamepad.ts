import { useEffect, RefObject } from "react";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { getActiveDocument, getActiveWindow, isOverlayActiveOrRecent } from "../runtime/activeDoc";
import { AudioTrack, SubtitleTrack } from "../components/player/types";
import { triggerHaptic } from "../runtime/haptics";

interface UsePlayerGamepadParams {
  containerRef: RefObject<HTMLDivElement | null>;
  playBtnRef: RefObject<HTMLDivElement | null>;
  subtitleBtnRef: RefObject<HTMLDivElement | null>;
  audioBtnRef: RefObject<HTMLDivElement | null>;
  showControlsRef: RefObject<boolean | null | undefined> | { current: boolean };
  showAudioMenuRef: RefObject<boolean | null | undefined> | { current: boolean };
  showSubtitleMenuRef: RefObject<boolean | null | undefined> | { current: boolean };
  setShowAudioMenu: (show: boolean) => void;
  setShowSubtitleMenu: (show: boolean) => void;
  setShowControls: (show: boolean) => void;
  closeModalRef: RefObject<(() => void) | undefined>;
  audioTracksRef: RefObject<AudioTrack[] | null | undefined> | { current: AudioTrack[] };
  subtitleTracksRef: RefObject<SubtitleTrack[] | null | undefined> | { current: SubtitleTrack[] };
  activeAudioMenuIdxRef: RefObject<number | null | undefined> | { current: number };
  activeSubMenuIdxRef: RefObject<number | null | undefined> | { current: number };
  togglePlay: () => void;
  toggleAudioMenu: () => void;
  toggleSubtitleMenu: () => void;
  selectAudioTrack: (trackIndex: number) => void;
  selectSubtitleTrack: (trackIndex: number | string | null) => void;
  seekRelative: (delta: number, step?: number) => void;
  commitPendingSeek?: () => void;
  changeVolume: (delta: number) => void;
  applyZoomStep: (step: number) => void;
  resetZoom: () => void;
  startZoomLoop: () => void;
  stopZoomLoop: () => void;
  resetControlsTimer: () => void;
  toggleControls?: () => void;
  handleMenuDirection: (dir: "up" | "down", menuKey: "sub" | "audio") => void;
  l2HeldRef: RefObject<boolean | null | undefined> | { current: boolean };
  r2HeldRef: RefObject<boolean | null | undefined> | { current: boolean };
  l2PressStartRef: RefObject<number | null | undefined> | { current: number };
  r2PressStartRef: RefObject<number | null | undefined> | { current: number };
  zoomAnimFrameRef: RefObject<number | null>;
  zoomHudTimerRef: RefObject<number | null>;
  overlayReturnCooldownRef?: any;
}

export function usePlayerGamepad({
  containerRef,
  playBtnRef,
  subtitleBtnRef,
  audioBtnRef,
  showControlsRef,
  showAudioMenuRef,
  showSubtitleMenuRef,
  setShowAudioMenu,
  setShowSubtitleMenu,
  setShowControls,
  closeModalRef,
  audioTracksRef,
  subtitleTracksRef,
  activeAudioMenuIdxRef,
  activeSubMenuIdxRef,
  togglePlay,
  toggleAudioMenu,
  toggleSubtitleMenu,
  selectAudioTrack,
  selectSubtitleTrack,
  seekRelative,
  commitPendingSeek,
  changeVolume,
  applyZoomStep,
  resetZoom,
  startZoomLoop,
  stopZoomLoop,
  resetControlsTimer,
  toggleControls,
  handleMenuDirection,
  l2HeldRef,
  r2HeldRef,
  l2PressStartRef,
  r2PressStartRef,
  zoomAnimFrameRef,
  zoomHudTimerRef,
}: UsePlayerGamepadParams) {
  useEffect(() => {
    const handleActivity = () => {
      resetControlsTimer();
    };

    let lastSeekAt = 0;
    let lastVolumeAt = 0;
    let lastToggleAt = 0;

    // Прямая подписка на события геймпада Steam Deck
    const unController = subscribeControllerInput((e) => {
      // Плавный зум: одиночный клик L2/R2 = ровно 1%, зажатие = быстрый зум
      if (e.button === RawButton.L2 || e.button === 28) {
        if (e.pressed && !l2HeldRef.current) {
          (l2HeldRef as any).current = true;
          (l2PressStartRef as any).current = performance.now();
          applyZoomStep(-0.01);
          startZoomLoop();
        } else if (!e.pressed) {
          stopZoomLoop();
        }
        return;
      }

      if (e.button === RawButton.R2 || e.button === 29) {
        if (e.pressed && !r2HeldRef.current) {
          (r2HeldRef as any).current = true;
          (r2PressStartRef as any).current = performance.now();
          applyZoomStep(+0.01);
          startZoomLoop();
        } else if (!e.pressed) {
          stopZoomLoop();
        }
        return;
      }

      const now = Date.now();

      // Быстрые прыжки на бамперы (L1 / R1): мгновенный скачок на ±10 секунд
      if (e.button === RawButton.L1 || e.button === 30) {
        if (e.pressed) {
          if (now - lastSeekAt < 120) return;
          lastSeekAt = now;
          seekRelative(-10, 10);
          triggerHaptic("medium", "left");
          setShowControls(true);
          resetControlsTimer();
        } else {
          commitPendingSeek?.();
        }
        return;
      }

      if (e.button === RawButton.R1 || e.button === 31) {
        if (e.pressed) {
          if (now - lastSeekAt < 120) return;
          lastSeekAt = now;
          seekRelative(10, 10);
          triggerHaptic("medium", "right");
          setShowControls(true);
          resetControlsTimer();
        } else {
          commitPendingSeek?.();
        }
        return;
      }

      if (!e.pressed) return;

      // Кнопка R3 (41): сброс зума до 100%
      if (e.button === RawButton.R3 || e.button === 41) {
        resetZoom();
        return;
      }

      // Кнопка L3 (25): нажатие левого стика — мгновенное скрытие / переключение интерфейса плеера
      if (e.button === RawButton.L3 || e.button === 25) {
        triggerHaptic("click", "left");
        if (toggleControls) {
          toggleControls();
        } else if (showControlsRef.current) {
          setShowControls(false);
          setShowAudioMenu(false);
          setShowSubtitleMenu(false);
        } else {
          setShowControls(true);
          resetControlsTimer();
        }
        return;
      }

      // Кнопка A (0): Воспроизведение / Пауза или выбор в меню / активация элемента
      if (e.button === RawButton.A || e.button === 0) {
        if (showAudioMenuRef.current) {
          const idx = activeAudioMenuIdxRef.current || 0;
          const track = audioTracksRef.current?.[idx];
          if (track) {
            selectAudioTrack(track.index);
          } else {
            setShowAudioMenu(false);
          }
          return;
        }
        if (showSubtitleMenuRef.current) {
          const idx = activeSubMenuIdxRef.current || 0;
          if (idx === 0) {
            selectSubtitleTrack(null);
          } else {
            const sub = subtitleTracksRef.current?.[idx - 1];
            if (sub && sub.supported !== false) {
              selectSubtitleTrack(sub.index);
            } else {
              setShowSubtitleMenu(false);
            }
          }
          return;
        }

        // Если контролы скрыты, нажатие A всегда переключает воспроизведение (плей/пауза)
        if (!showControlsRef.current) {
          if (now - lastToggleAt < 250) return;
          lastToggleAt = now;
          togglePlay();
          setShowControls(true);
          resetControlsTimer();
          return;
        }

        const doc = getActiveDocument(containerRef.current) || document;
        const gpfocus = doc?.querySelector?.(".projacktor-player-fullscreen .gpfocus");
        const focusedEl = (gpfocus || doc?.activeElement) as HTMLElement | null;

        // Если фокус на кнопке субтитров: переключаем меню без паузы
        if (subtitleBtnRef.current && (subtitleBtnRef.current === focusedEl || subtitleBtnRef.current.contains(focusedEl as Node))) {
          toggleSubtitleMenu();
          return;
        }

        // Если фокус на кнопке аудиодорожек: переключаем меню без паузы
        if (audioBtnRef.current && (audioBtnRef.current === focusedEl || audioBtnRef.current.contains(focusedEl as Node))) {
          toggleAudioMenu();
          return;
        }

        // Если фокус на другой интерактивной кнопке (кроме playBtnRef): не вызываем togglePlay,
        // позволяя нативному Focusable.onActivate выполниться
        if (
          focusedEl &&
          focusedEl !== playBtnRef.current &&
          !playBtnRef.current?.contains(focusedEl) &&
          focusedEl !== containerRef.current &&
          focusedEl !== doc?.body &&
          !focusedEl.classList.contains("projacktor-player-fullscreen")
        ) {
          return;
        }

        if (now - lastToggleAt < 250) return;
        lastToggleAt = now;
        togglePlay();
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      // Кнопка B (1): Закрыть меню аудио/субтитров или выйти из плеера
      if (e.button === RawButton.B || e.button === 1) {
        // Игнорируем B, если оверлей Steam (шторка "..." или меню STEAM) был открыт или закрылся менее 1000ms назад
        if (isOverlayActiveOrRecent(1000)) return;
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          setShowControls(true);
          resetControlsTimer();
          setTimeout(() => {
            if (audioBtnRef.current) {
              const doc = getActiveDocument(audioBtnRef.current) || document;
              doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
              audioBtnRef.current.focus();
              audioBtnRef.current.classList.add("gpfocus");
            }
          }, 50);
        } else if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          setShowControls(true);
          resetControlsTimer();
          setTimeout(() => {
            if (subtitleBtnRef.current) {
              const doc = getActiveDocument(subtitleBtnRef.current) || document;
              doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
              subtitleBtnRef.current.focus();
              subtitleBtnRef.current.classList.add("gpfocus");
            }
          }, 50);
        } else if (closeModalRef.current) {
          closeModalRef.current();
        }
        return;
      }

      // Кнопка Y (3): Переключение меню аудиодорожек
      if (e.button === RawButton.Y || e.button === 3) {
        toggleAudioMenu();
        return;
      }

      // Кнопка X (2): Переключение меню субтитров
      if (e.button === RawButton.X || e.button === 2) {
        toggleSubtitleMenu();
        return;
      }

      // D-pad Вверх (4), Стик Вверх (20): Навигация по меню или Громкость +5%
      if (
        e.button === RawButton.DPAD_UP ||
        e.button === RawButton.LEFTSTICK_UP ||
        e.button === 4 ||
        e.button === 20
      ) {
        if (showAudioMenuRef.current) {
          handleMenuDirection("up", "audio");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (showSubtitleMenuRef.current) {
          handleMenuDirection("up", "sub");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (now - lastVolumeAt < 120) return;
        lastVolumeAt = now;
        changeVolume(0.05);
        if (showControlsRef.current) {
          resetControlsTimer();
        }
        return;
      }

      // D-pad Вниз (6), Стик Вниз (21): Навигация по меню или Громкость -5%
      if (
        e.button === RawButton.DPAD_DOWN ||
        e.button === RawButton.LEFTSTICK_DOWN ||
        e.button === 6 ||
        e.button === 21
      ) {
        if (showAudioMenuRef.current) {
          handleMenuDirection("down", "audio");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (showSubtitleMenuRef.current) {
          handleMenuDirection("down", "sub");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (now - lastVolumeAt < 120) return;
        lastVolumeAt = now;
        changeVolume(-0.05);
        if (showControlsRef.current) {
          resetControlsTimer();
        }
        return;
      }

      // D-pad Влево / Вправо / Стики Влево / Вправо:
      if (
        e.button === RawButton.DPAD_LEFT ||
        e.button === RawButton.DPAD_RIGHT ||
        e.button === RawButton.LEFTSTICK_LEFT ||
        e.button === RawButton.LEFTSTICK_RIGHT ||
        e.button === RawButton.LEFTPAD_LEFT ||
        e.button === RawButton.LEFTPAD_RIGHT ||
        e.button === 7 ||
        e.button === 5 ||
        e.button === 22 ||
        e.button === 23 ||
        e.button === 12 ||
        e.button === 13
      ) {
        // Блокируем горизонтальную навигацию когда меню открыто
        if (showAudioMenuRef.current || showSubtitleMenuRef.current) {
          return;
        }
        if (!showControlsRef.current) {
          setShowControls(true);
          resetControlsTimer();
          if (playBtnRef.current) {
            const doc = getActiveDocument(playBtnRef.current) || document;
            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            playBtnRef.current.focus();
            playBtnRef.current.classList.add("gpfocus");
          }
          return;
        }
        resetControlsTimer();
        return;
      }

      setShowControls(true);
      resetControlsTimer();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const isVolumeOrZoom =
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "+" ||
        e.key === "=" ||
        e.key === "-" ||
        e.key === "_";

      if (!isVolumeOrZoom) {
        setShowControls(true);
        resetControlsTimer();
      } else if (showControlsRef.current) {
        resetControlsTimer();
      }

      if (e.key === "PageUp" || (e as any).code === "PageUp") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        seekRelative(-10, 10);
        triggerHaptic("medium", "left");
        commitPendingSeek?.();
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      if (e.key === "PageDown" || (e as any).code === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        seekRelative(10, 10);
        triggerHaptic("medium", "right");
        commitPendingSeek?.();
        setShowControls(true);
        resetControlsTimer();
        return;
      }

      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        // Игнорируем, если оверлей Steam был открыт или закрылся менее 1000ms назад
        if (isOverlayActiveOrRecent(1000)) return;
        if (showAudioMenuRef.current) {
          setShowAudioMenu(false);
          setShowControls(true);
          resetControlsTimer();
          setTimeout(() => {
            if (audioBtnRef.current) {
              const doc = getActiveDocument(audioBtnRef.current) || document;
              doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
              audioBtnRef.current.focus();
              audioBtnRef.current.classList.add("gpfocus");
            }
          }, 50);
        } else if (showSubtitleMenuRef.current) {
          setShowSubtitleMenu(false);
          setShowControls(true);
          resetControlsTimer();
          setTimeout(() => {
            if (subtitleBtnRef.current) {
              const doc = getActiveDocument(subtitleBtnRef.current) || document;
              doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
              subtitleBtnRef.current.focus();
              subtitleBtnRef.current.classList.add("gpfocus");
            }
          }, 50);
        } else if (closeModalRef.current) {
          closeModalRef.current();
        }
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!showControlsRef.current) {
          e.preventDefault();
          e.stopPropagation();
          (e as any).stopImmediatePropagation?.();
          setShowControls(true);
          resetControlsTimer();
          if (playBtnRef.current) {
            const doc = getActiveDocument(playBtnRef.current) || document;
            doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            playBtnRef.current.focus();
            playBtnRef.current.classList.add("gpfocus");
          }
          return;
        }
        resetControlsTimer();
        return;
      }

      if (e.key === " " || e.key === "Enter" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        if (showAudioMenuRef.current) {
          const idx = activeAudioMenuIdxRef.current || 0;
          const track = audioTracksRef.current?.[idx];
          if (track) selectAudioTrack(track.index);
          else setShowAudioMenu(false);
          return;
        }
        if (showSubtitleMenuRef.current) {
          const idx = activeSubMenuIdxRef.current || 0;
          if (idx === 0) selectSubtitleTrack(null);
          else {
            const sub = subtitleTracksRef.current?.[idx - 1];
            if (sub && sub.supported !== false) selectSubtitleTrack(sub.index);
            else setShowSubtitleMenu(false);
          }
          return;
        }

        if (!showControlsRef.current) {
          togglePlay();
          return;
        }

        const doc = getActiveDocument(containerRef.current) || document;
        const gpfocus = doc?.querySelector?.(".projacktor-player-fullscreen .gpfocus");
        const focusedEl = (gpfocus || doc?.activeElement) as HTMLElement | null;

        if (subtitleBtnRef.current && (subtitleBtnRef.current === focusedEl || subtitleBtnRef.current.contains(focusedEl as Node))) {
          toggleSubtitleMenu();
          return;
        }
        if (audioBtnRef.current && (audioBtnRef.current === focusedEl || audioBtnRef.current.contains(focusedEl as Node))) {
          toggleAudioMenu();
          return;
        }
        if (
          focusedEl &&
          focusedEl !== playBtnRef.current &&
          !playBtnRef.current?.contains(focusedEl) &&
          focusedEl !== containerRef.current &&
          focusedEl !== doc?.body &&
          !focusedEl.classList.contains("projacktor-player-fullscreen")
        ) {
          return;
        }

        togglePlay();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        seekRelative(-10, 10);
        triggerHaptic("medium", "left");
        commitPendingSeek?.();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        seekRelative(10, 10);
        triggerHaptic("medium", "right");
        commitPendingSeek?.();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        if (showAudioMenuRef.current) {
          handleMenuDirection("up", "audio");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (showSubtitleMenuRef.current) {
          handleMenuDirection("up", "sub");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        changeVolume(0.05);
        if (showControlsRef.current) {
          resetControlsTimer();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        if (showAudioMenuRef.current) {
          handleMenuDirection("down", "audio");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        if (showSubtitleMenuRef.current) {
          handleMenuDirection("down", "sub");
          setShowControls(true);
          resetControlsTimer();
          return;
        }
        changeVolume(-0.05);
        if (showControlsRef.current) {
          resetControlsTimer();
        }
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        toggleAudioMenu();
      } else if (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        toggleSubtitleMenu();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        applyZoomStep(-0.01);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        applyZoomStep(+0.01);
      } else if (e.key === "0") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        resetZoom();
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        triggerHaptic("click", "left");
        if (toggleControls) {
          toggleControls();
        } else if (showControlsRef.current) {
          setShowControls(false);
          setShowAudioMenu(false);
          setShowSubtitleMenu(false);
        } else {
          setShowControls(true);
          resetControlsTimer();
        }
      }
    };

    const targets: Array<Window | Document> = [window];
    try {
      const doc = getActiveDocument(containerRef.current);
      if (doc && !targets.includes(doc)) targets.push(doc);
      if (doc?.defaultView && !targets.includes(doc.defaultView)) {
        targets.push(doc.defaultView);
      }
      const activeWin = getActiveWindow();
      if (activeWin && !targets.includes(activeWin)) targets.push(activeWin);
      if (activeWin?.document && !targets.includes(activeWin.document)) targets.push(activeWin.document);
    } catch {}

    targets.forEach((t) => {
      try {
        t.addEventListener("mousemove", handleActivity);
        t.addEventListener("pointermove", handleActivity);
        t.addEventListener("keydown", handleKeyDown as any, true);
        t.addEventListener("click", handleActivity);
        t.addEventListener("touchstart", handleActivity);
      } catch {}
    });

    return () => {
      unController();
      if (zoomAnimFrameRef.current !== null) {
        cancelAnimationFrame(zoomAnimFrameRef.current);
        (zoomAnimFrameRef as any).current = null;
      }
      if (zoomHudTimerRef.current !== null) {
        clearTimeout(zoomHudTimerRef.current);
        (zoomHudTimerRef as any).current = null;
      }
      targets.forEach((t) => {
        try {
          t.removeEventListener("mousemove", handleActivity);
          t.removeEventListener("pointermove", handleActivity);
          t.removeEventListener("keydown", handleKeyDown as any, true);
          t.removeEventListener("click", handleActivity);
          t.removeEventListener("touchstart", handleActivity);
        } catch {}
      });
    };
  }, [
    applyZoomStep,
    changeVolume,
    commitPendingSeek,
    resetControlsTimer,
    seekRelative,
    toggleAudioMenu,
    togglePlay,
    toggleSubtitleMenu,
    resetZoom,
    startZoomLoop,
    stopZoomLoop,
  ]);
}
