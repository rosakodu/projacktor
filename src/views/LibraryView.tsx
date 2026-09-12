import { FC, memo, useEffect, useRef, useCallback } from "react";
import { Focusable, showModal } from "@decky/ui";
import { FaPlay, FaPlayCircle, FaPause, FaDownload, FaList, FaTrash, FaMoon, FaSpinner } from "react-icons/fa";
import { LibraryItem } from "../types";
import { formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";
import { getActiveDocument } from "../runtime/activeDoc";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { playNavSound } from "../runtime/navSound";
import { isModalOpen } from "../runtime/homeInputBus";
import { EpisodesModal } from "../components/EpisodesModal";
import { setBackdropMovie } from "../runtime/backdropBus";


interface LibraryViewProps {
  onPlayVideo: (filePath: string, title: string, isOnline: boolean, torrentHash?: string) => void;
  onActivateMagicBlack?: () => void;
}

const NAV_COOLDOWN_MS = 110;

function scrollCardHorizontal(row: HTMLElement | null, card: HTMLElement | null) {
  if (!row || !card) return;
  const target = card.offsetLeft - row.clientWidth / 2 + card.offsetWidth / 2;
  const maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
  const final = Math.max(0, Math.min(target, maxScroll));
  row.scrollTo({ left: final, behavior: "smooth" });
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const lastNavAtRef = useRef(0);
    const lastInteractedItemIdRef = useRef<number | string | null>(null);

    const {
      library,
      streamLoading,
      pauseDownload,
      resumeDownload,
      deleteItem,
      downloadEpisode,
      watchOnline,
    } = useLibrary(onPlayVideo);

    const getParentWindow = (): EventTarget => {
      try {
        const win =
          (window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ||
          (window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow ||
          document.defaultView ||
          window;
        return win as EventTarget;
      } catch {
        return window as EventTarget;
      }
    };

    // Открытие модалки серий через нативный Decky showModal — B кнопка работает автоматически
    const handleOpenEpisodes = useCallback((item: LibraryItem) => {
      lastInteractedItemIdRef.current = item.id;
      let modalInstance: any = null;
      const close = () => {
        if (modalInstance && typeof modalInstance.Close === "function") {
          modalInstance.Close();
        }
        // Возвращаем фокус на карточку после закрытия
        setTimeout(() => {
          const root = rootRef.current;
          if (!root) return;
          const doc = getActiveDocument(root);
          const card = root.querySelector<HTMLElement>(
            `[data-item-id="${item.id}"]`
          );
          const target = card?.querySelector<HTMLElement>(
            ".projacktor-dl-poster-btn, .projacktor-dl-btn-play"
          );
          if (target) {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            target.focus();
            target.classList.add("gpfocus");
            scrollCardHorizontal(rowRef.current, card);
          }
        }, 80);
      };
      modalInstance = showModal(
        <EpisodesModal
          item={item}
          closeModal={close}
          onWatchOnline={(i, epIdx) => { close(); watchOnline(i, epIdx); }}
          onDownloadEpisode={(i, ep) => { downloadEpisode(i, ep); }}
        />,
        getParentWindow(),
        { bHideActionIcons: true }
      );
    }, [watchOnline, downloadEpisode]);




    // Авто-фокус на элементе библиотеки при переходе во вкладку
    useEffect(() => {
      let cancelled = false;
      const focusLib = () => {
        if (cancelled) return true;
        const root = rootRef.current;
        const doc = getActiveDocument(root);

        const target = root
          ? root.querySelector<HTMLElement>(
              ".projacktor-dl-poster-btn, .projacktor-dl-btn-play, .projacktor-empty-lib"
            )
          : null;
        if (target) {
          try {
            doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
            target.focus();
            target.classList.add("gpfocus");
          } catch {}
          return true;
        }
        return false;
      };

      if (!focusLib()) {
        const t1 = setTimeout(focusLib, 40);
        const t2 = setTimeout(focusLib, 120);
        const t3 = setTimeout(focusLib, 260);
        return () => {
          cancelled = true;
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(t3);
        };
      }
      return () => {
        cancelled = true;
      };
    }, [library.length]);

    // Строгая блокировка горизонтального скролла в контейнере библиотеки
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const lockHorizontal = () => {
        if (root.scrollLeft !== 0) {
          root.scrollLeft = 0;
        }
      };

      root.addEventListener("scroll", lockHorizontal, { passive: true });
      root.addEventListener("focusin", lockHorizontal, { passive: true });
      window.addEventListener("scroll", lockHorizontal, { passive: true });
      return () => {
        root.removeEventListener("scroll", lockHorizontal);
        root.removeEventListener("focusin", lockHorizontal);
        window.removeEventListener("scroll", lockHorizontal);
      };
    }, []);

    // Авто-скролл карточки только по вертикали при фокусе
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const onFocusIn = (e: FocusEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target || !root.contains(target)) return;
        const card = target.closest(".projacktor-dl-grid-card") as HTMLElement | null;
        if (card) {
          scrollCardHorizontal(rowRef.current, card);
        }
      };

      root.addEventListener("focusin", onFocusIn);
      return () => root.removeEventListener("focusin", onFocusIn);
    }, []);



    // Основной 2D обработчик перемещения геймпада, стиков и клавиатуры
    const handleDirection = useCallback(
      (dir: "up" | "down" | "left" | "right") => {
        if (isModalOpen()) return;

        const now = Date.now();
        if (now - lastNavAtRef.current < NAV_COOLDOWN_MS) return;

        const root = rootRef.current;
        if (!root) return;
        const doc = getActiveDocument(root);
        if (!doc) return;

        const active = doc.activeElement as HTMLElement | null;
        if (!active || !root.contains(active)) return;

        const doFocus = (target: HTMLElement | null) => {
          if (!target) return;
          lastNavAtRef.current = Date.now();
          doc.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          playNavSound();
          const card = target.closest(".projacktor-dl-grid-card") as HTMLElement | null;
          scrollCardHorizontal(rowRef.current, card || target);
        };

        // Если пустая библиотека — переход вверх заблокирован
        if (active.classList.contains("projacktor-empty-lib") || active.closest(".projacktor-empty-lib")) {
          return;
        }

        const cards = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-dl-grid-card"));
        if (!cards.length) return;

        const currentCard = active.closest(".projacktor-dl-grid-card") as HTMLElement | null;
        if (!currentCard) return;

        const cardIndex = cards.indexOf(currentCard);
        if (cardIndex === -1) return;

        const isPoster = !!active.closest(".projacktor-dl-poster-btn");
        const isButton = !isPoster && !!active.closest(".projacktor-dl-card-btns");

        if (isPoster) {
          if (dir === "left") {
            const targetIndex = cardIndex > 0 ? cardIndex - 1 : cards.length - 1;
            const prevPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
            doFocus(prevPoster);
          } else if (dir === "right") {
            const targetIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
            const nextPoster = cards[targetIndex].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
            doFocus(nextPoster);
          } else if (dir === "down") {
            const playBtn = currentCard.querySelector<HTMLElement>(
              ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
            );
            doFocus(playBtn);
          } else if (dir === "up") {
            // Заблокировано: не выходим в табы через D-pad вверх
            return;
          }
        } else if (isButton) {
          const cardButtons = Array.from(
            currentCard.querySelectorAll<HTMLElement>(
              ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
            )
          );
          const btnIndex = cardButtons.findIndex((b) => b === active || b.contains(active));

          if (dir === "up") {
            const poster = currentCard.querySelector<HTMLElement>(".projacktor-dl-poster-btn");
            doFocus(poster);
          } else if (dir === "left") {
            if (btnIndex > 0) {
              doFocus(cardButtons[btnIndex - 1]);
            } else {
              const prevCardIndex = cardIndex > 0 ? cardIndex - 1 : cards.length - 1;
              const prevCard = cards[prevCardIndex];
              const prevBtns = prevCard.querySelectorAll<HTMLElement>(
                ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
              );
              if (prevBtns.length > 0) {
                doFocus(prevBtns[prevBtns.length - 1]);
              }
            }
          } else if (dir === "right") {
            if (btnIndex !== -1 && btnIndex < cardButtons.length - 1) {
              doFocus(cardButtons[btnIndex + 1]);
            } else {
              const nextCardIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
              const nextCard = cards[nextCardIndex];
              const nextBtn = nextCard.querySelector<HTMLElement>(
                ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
              );
              if (nextBtn) doFocus(nextBtn);
            }
          }
        }
      },
      []
    );

    // Слушатель событий Decky onGamepadDirection
    const handleGamepadDir = useCallback(
      (evt: any) => {
        const btn = evt?.detail?.button;
        if (btn === 9) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("up");
          return false;
        } else if (btn === 10) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("down");
          return false;
        } else if (btn === 11) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("left");
          return false;
        } else if (btn === 12) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("right");
          return false;
        }
        return undefined;
      },
      [handleDirection]
    );

    // Слушатель событий геймпада и стиков через SteamClient.Input (RawButton)
    useEffect(() => {
      const un = subscribeControllerInput((e) => {
        if (!e.pressed) return;
        if (isModalOpen()) return;

        const isUp =
          e.button === RawButton.DPAD_UP ||
          e.button === RawButton.LEFTSTICK_UP ||
          e.button === 4 ||
          e.button === 20;

        const isDown =
          e.button === RawButton.DPAD_DOWN ||
          e.button === RawButton.LEFTSTICK_DOWN ||
          e.button === 6 ||
          e.button === 21;

        const isLeft =
          e.button === RawButton.DPAD_LEFT ||
          e.button === RawButton.LEFTSTICK_LEFT ||
          e.button === 7 ||
          e.button === 22;

        const isRight =
          e.button === RawButton.DPAD_RIGHT ||
          e.button === RawButton.LEFTSTICK_RIGHT ||
          e.button === 5 ||
          e.button === 23;

        if (isUp) handleDirection("up");
        else if (isDown) handleDirection("down");
        else if (isLeft) handleDirection("left");
        else if (isRight) handleDirection("right");
      });
      return un;
    }, [handleDirection]);

    // Слушатель клавиш стрелок клавиатуры
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const doc = getActiveDocument(root);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isModalOpen()) return;
        const active = doc?.activeElement;
        if (!active || !root.contains(active)) return;

        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          handleDirection("up");
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          handleDirection("down");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          handleDirection("left");
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          handleDirection("right");
        }
      };

      doc?.addEventListener?.("keydown", handleKeyDown, true);
      window.addEventListener("keydown", handleKeyDown, true);
      return () => {
        doc?.removeEventListener?.("keydown", handleKeyDown, true);
        window.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [handleDirection]);

    return (

      <Focusable
        ref={rootRef}
        noFocusRing
        className="projacktor-library-content"
        onGamepadDirection={handleGamepadDir}
      >
      {/* Шапка загрузок */}
      <div className="projacktor-section-header-row">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="projacktor-section-title">Загрузки</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            {library.length > 0 ? `${library.length} ${library.length === 1 ? "загрузка" : "загрузок"}` : "Пусто"}
          </span>
        </div>
      </div>

      {library.length === 0 ? (
        <Focusable
          className="projacktor-empty-lib"
          tabIndex={0}
          noFocusRing
          onGamepadDirection={handleGamepadDir}
          style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)" }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
            Нет активных или скачанных загрузок
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            Здесь отображается очередь скачивания и сохраненные на диск файлы.
          </div>
        </Focusable>
      ) : (
          <div ref={rowRef} className="projacktor-downloads-grid">
            {library.map((item, index) => {
              const isDownloading = item.download_status === "downloading";
              const isPaused = item.download_status === "paused";
              const hasLocalFiles = !!(item.files && item.files.length > 0);
              const localFilePath = hasLocalFiles && item.files ? item.files[0].file_path : null;
              const isCompleted =
                item.download_status === "completed" ||
                (item.download_progress !== undefined && item.download_progress >= 99.9) ||
                (!isDownloading && !isPaused && hasLocalFiles);
              const canPlayDirect = isCompleted && !!localFilePath;
              const isTv = item.media_type === "tv";
              const isStreamStarting = streamLoading === item.id;
              const progress = Math.min(100, Math.max(0, item.download_progress || 0));

              const handlePrimaryAction = () => {
                lastInteractedItemIdRef.current = item.id;
                if (isTv) {
                  handleOpenEpisodes(item);
                } else if (canPlayDirect) {
                  onPlayVideo(localFilePath!, item.title, false);
                } else {
                  watchOnline(item);
                }
              };

              let badgeText = "В библиотеке";
              let badgeClass = "queued";
              if (isCompleted) {
                badgeText = "✓ Скачано";
                badgeClass = "completed";
              } else if (isDownloading) {
                const spd = formatSpeed(item.download_speed || 0);
                badgeText = `${progress.toFixed(0)}% • ${spd}`;
                badgeClass = "downloading";
              } else if (isPaused) {
                badgeText = progress > 0 ? `⏸ Пауза (${progress.toFixed(0)}%)` : "⏸ Пауза";
                badgeClass = "paused";
              }

              return (
                <div
                  key={item.id}
                  className="projacktor-dl-grid-card"
                  data-item-id={item.id}
                  data-card-index={index}
                >
                  {/* Постер + бейджи + полоса загрузки */}
                  <Focusable
                    className="projacktor-dl-poster-btn"
                    noFocusRing
                    onActivate={handlePrimaryAction}
                    onClick={handlePrimaryAction}
                    onGamepadDirection={handleGamepadDir}
                    onFocus={() => setBackdropMovie(item as any)}
                    title={canPlayDirect ? "Смотреть файл" : isTv ? "Открыть серии" : "Смотреть онлайн"}
                  >
                    <img
                      src={getImageUrl(item.poster_path)}
                      alt={item.title}
                      className="projacktor-dl-poster-img"
                      loading="lazy"
                      draggable={false}
                    />

                    {/* Бейдж статуса */}
                    <div className={`projacktor-dl-badge-status ${badgeClass}`}>
                      {badgeText}
                    </div>

                    {/* Бейдж качества или типа (показываем когда не скачивается, чтобы не перегружать постер) */}
                    {!isDownloading && (item.effective_quality || isTv) && (
                      <div className="projacktor-dl-badge-quality">
                        {item.effective_quality || "Сериал"}
                      </div>
                    )}

                    {/* Встроенный прогресс-бар внизу постера */}
                    {(isDownloading || isPaused || isCompleted) && (
                      <div className="projacktor-dl-bar-bg">
                        <div
                          className={`projacktor-dl-bar-fill ${
                            isCompleted ? "completed" : isDownloading ? "downloading" : "paused"
                          }`}
                          style={{ width: `${isCompleted ? 100 : progress}%` }}
                        />
                      </div>
                    )}
                  </Focusable>

                  {/* Название */}
                  <div className="projacktor-dl-info">
                    <div className="projacktor-dl-title" title={item.title}>
                      {item.title}
                    </div>
                    {item.year ? (
                      <div className="projacktor-dl-year">{item.year}</div>
                    ) : null}
                  </div>

                  {/* Кнопки действий */}
                  <div className="projacktor-dl-card-btns">
                    {/* Кнопка Смотреть / Онлайн / Файл / Серии */}
                    <Focusable
                      className={`projacktor-dl-btn-play ${canPlayDirect || !isTv ? "success" : ""}`}
                      noFocusRing
                      onActivate={handlePrimaryAction}
                      onClick={handlePrimaryAction}
                      onGamepadDirection={handleGamepadDir}
                      title={canPlayDirect ? "Смотреть файл" : isTv ? "Серии" : "Смотреть онлайн"}
                    >
                      {isStreamStarting ? (
                        <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", fontSize: 11 }} />
                      ) : canPlayDirect ? (
                        <FaPlay style={{ fontSize: 10, marginLeft: 1 }} />
                      ) : isTv ? (
                        <FaList style={{ fontSize: 10 }} />
                      ) : (
                        <FaPlayCircle style={{ fontSize: 12 }} />
                      )}
                    </Focusable>

                    {/* Кнопка Пауза / Загрузить */}
                    {!isCompleted && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        onActivate={() =>
                          isDownloading ? pauseDownload(item.id) : resumeDownload(item.id)
                        }
                        onClick={() =>
                          isDownloading ? pauseDownload(item.id) : resumeDownload(item.id)
                        }
                        onGamepadDirection={handleGamepadDir}
                        title={isDownloading ? "Приостановить" : "Возобновить"}
                      >
                        {isDownloading ? <FaPause style={{ fontSize: 9.5 }} /> : <FaDownload style={{ fontSize: 9.5 }} />}
                      </Focusable>
                    )}

                    {/* Кнопка Загрузка в спящем режиме (Magic Black) */}
                    {!isCompleted && (
                      <Focusable
                        className="projacktor-dl-btn-icon"
                        noFocusRing
                        onActivate={() => {
                          if (isPaused) {
                            resumeDownload(item.id);
                          }
                          onActivateMagicBlack?.();
                        }}
                        onClick={() => {
                          if (isPaused) {
                            resumeDownload(item.id);
                          }
                          onActivateMagicBlack?.();
                        }}
                        onGamepadDirection={handleGamepadDir}
                        title="Загрузка с выключенным экраном (Magic Black)"
                      >
                        <FaMoon style={{ fontSize: 9.5 }} />
                      </Focusable>
                    )}

                    {/* Кнопка Удалить */}
                    <Focusable
                      className="projacktor-dl-btn-icon danger"
                      noFocusRing
                      onActivate={() => deleteItem(item.id)}
                      onClick={() => deleteItem(item.id)}
                      onGamepadDirection={handleGamepadDir}
                      title="Удалить"
                    >
                      <FaTrash style={{ fontSize: 9.5 }} />
                    </Focusable>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </Focusable>
    );

  }
);
