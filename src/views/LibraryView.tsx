import { FC, memo, useEffect, useRef, useState, useCallback } from "react";
import { Focusable } from "@decky/ui";
import { FaPlay, FaPlayCircle, FaPause, FaDownload, FaList, FaTrash, FaMoon, FaSpinner, FaTimes } from "react-icons/fa";
import { EpisodeItem, LibraryItem } from "../types";
import { formatBytes, formatSpeed, getImageUrl } from "../api";
import { useLibrary } from "../hooks/useLibrary";
import { getActiveDocument } from "../runtime/activeDoc";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { playNavSound } from "../runtime/navSound";
import { isModalOpen } from "../runtime/homeInputBus";

interface LibraryViewProps {
  onPlayVideo: (filePath: string, title: string, isOnline: boolean) => void;
  onActivateMagicBlack?: () => void;
}

const NAV_COOLDOWN_MS = 110;

function scrollCardVerticalOnly(root: HTMLElement | null, card: HTMLElement | null) {
  if (!root || !card) return;
  root.scrollLeft = 0;
  const rootRect = root.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();

  if (cardRect.top < rootRect.top + 10) {
    const delta = cardRect.top - rootRect.top - 16;
    root.scrollTop += delta;
  } else if (cardRect.bottom > rootRect.bottom - 10) {
    const delta = cardRect.bottom - rootRect.bottom + 16;
    root.scrollTop += delta;
  }
}

function findCardAbove(cards: HTMLElement[], currentIndex: number): HTMLElement | null {
  if (currentIndex < 0 || currentIndex >= cards.length) return null;
  const currentCard = cards[currentIndex];
  const currentRect = currentCard.getBoundingClientRect();
  const currentCenter = currentRect.left + currentRect.width / 2;

  const aboveCards = cards.filter((c, i) => {
    if (i === currentIndex) return false;
    const r = c.getBoundingClientRect();
    return r.bottom <= currentRect.top + 20;
  });
  if (aboveCards.length === 0) return null;

  const maxBottom = Math.max(...aboveCards.map((c) => c.getBoundingClientRect().bottom));
  const rowAboveCards = aboveCards.filter(
    (c) => Math.abs(c.getBoundingClientRect().bottom - maxBottom) < 30
  );

  rowAboveCards.sort((a, b) => {
    const aCenter = a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2;
    const bCenter = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2;
    return Math.abs(aCenter - currentCenter) - Math.abs(bCenter - currentCenter);
  });

  return rowAboveCards[0] || null;
}

function findCardBelow(cards: HTMLElement[], currentIndex: number): HTMLElement | null {
  if (currentIndex < 0 || currentIndex >= cards.length) return null;
  const currentCard = cards[currentIndex];
  const currentRect = currentCard.getBoundingClientRect();
  const currentCenter = currentRect.left + currentRect.width / 2;

  const belowCards = cards.filter((c, i) => {
    if (i === currentIndex) return false;
    const r = c.getBoundingClientRect();
    return r.top >= currentRect.bottom - 20;
  });
  if (belowCards.length === 0) return null;

  const minTop = Math.min(...belowCards.map((c) => c.getBoundingClientRect().top));
  const rowBelowCards = belowCards.filter(
    (c) => Math.abs(c.getBoundingClientRect().top - minTop) < 30
  );

  rowBelowCards.sort((a, b) => {
    const aCenter = a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2;
    const bCenter = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2;
    return Math.abs(aCenter - currentCenter) - Math.abs(bCenter - currentCenter);
  });

  return rowBelowCards[0] || null;
}

export const LibraryView: FC<LibraryViewProps> = memo(
  ({ onPlayVideo, onActivateMagicBlack }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const lastNavAtRef = useRef(0);
    const lastInteractedItemIdRef = useRef<number | string | null>(null);
    const [episodesModalItem, setEpisodesModalItem] = useState<LibraryItem | null>(null);

    const {
      library,
      episodesMap,
      episodesLoading,
      streamLoading,
      pauseDownload,
      resumeDownload,
      deleteItem,
      toggleEpisodes,
      downloadEpisode,
      watchOnline,
    } = useLibrary(onPlayVideo);

    // Закрытие модального окна серий по кнопке B или Escape
    useEffect(() => {
      if (!episodesModalItem) return;

      const un = subscribeControllerInput((e) => {
        if (!e.pressed) return;
        if (e.button === RawButton.B || e.button === 1) {
          setEpisodesModalItem(null);
        }
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          setEpisodesModalItem(null);
        }
      };

      window.addEventListener("keydown", handleKeyDown, true);
      return () => {
        un();
        window.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [episodesModalItem]);

    // Фокус при открытии модального окна серий
    useEffect(() => {
      if (!episodesModalItem) return;
      const timer = setTimeout(() => {
        const root = rootRef.current;
        const doc = getActiveDocument(root);
        const modalBtn = doc?.querySelector<HTMLElement>(
          ".projacktor-episodes-modal-list .ds-btn, .projacktor-episodes-modal-header .ds-btn"
        );
        if (modalBtn) {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          modalBtn.focus();
          modalBtn.classList.add("gpfocus");
        }
      }, 50);
      return () => clearTimeout(timer);
    }, [episodesModalItem]);

    // Восстановление фокуса при закрытии модального окна серий
    useEffect(() => {
      if (episodesModalItem || lastInteractedItemIdRef.current == null) return;
      const timer = setTimeout(() => {
        const root = rootRef.current;
        if (!root) return;
        const doc = getActiveDocument(root);
        const card = root.querySelector<HTMLElement>(
          `[data-item-id="${lastInteractedItemIdRef.current}"]`
        );
        const target = card?.querySelector<HTMLElement>(
          ".projacktor-dl-poster-btn, .projacktor-dl-btn-play"
        );
        if (target) {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          target.focus();
          target.classList.add("gpfocus");
          scrollCardVerticalOnly(root, card);
        }
      }, 40);
      return () => clearTimeout(timer);
    }, [episodesModalItem]);

    // Авто-фокус на элементе библиотеки при переходе во вкладку (если фокус не на табах)
    useEffect(() => {
      let cancelled = false;
      const focusLib = () => {
        if (cancelled) return true;
        const root = rootRef.current;
        const doc = getActiveDocument(root);
        const active = doc?.activeElement;
        const inTabs = !!(
          active &&
          (active.classList?.contains("projacktor-tab-item") ||
            doc?.querySelector(".projacktor-nav-bar")?.contains(active))
        );
        if (inTabs) return true;

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
        root.scrollLeft = 0;
        const target = e.target as HTMLElement | null;
        if (!target || !root.contains(target)) return;
        const card = target.closest(".projacktor-dl-grid-card") as HTMLElement | null;
        if (card) {
          scrollCardVerticalOnly(root, card);
        }
      };

      root.addEventListener("focusin", onFocusIn);
      return () => root.removeEventListener("focusin", onFocusIn);
    }, []);

    const handleOpenEpisodes = useCallback(
      (item: LibraryItem) => {
        lastInteractedItemIdRef.current = item.id;
        setEpisodesModalItem(item);
        toggleEpisodes(item);
      },
      [toggleEpisodes]
    );

    // Основной 2D обработчик перемещения геймпада, стиков и клавиатуры
    const handleDirection = useCallback(
      (dir: "up" | "down" | "left" | "right") => {
        if (isModalOpen() || episodesModalItem) return;

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
          scrollCardVerticalOnly(root, card || target);
        };

        // Если пустая библиотека — переход вверх в TabBar
        if (active.classList.contains("projacktor-empty-lib") || active.closest(".projacktor-empty-lib")) {
          if (dir === "up") {
            const activeTabEl = doc.querySelector<HTMLElement>(
              ".projacktor-tab-item.active, [role='tab'][aria-selected='true']"
            );
            if (activeTabEl) doFocus(activeTabEl);
          }
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
            if (cardIndex > 0) {
              const prevPoster = cards[cardIndex - 1].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
              doFocus(prevPoster);
            }
          } else if (dir === "right") {
            if (cardIndex < cards.length - 1) {
              const nextPoster = cards[cardIndex + 1].querySelector<HTMLElement>(".projacktor-dl-poster-btn");
              doFocus(nextPoster);
            }
          } else if (dir === "down") {
            // Вниз: переход в панель кнопок этой же карточки
            const playBtn = currentCard.querySelector<HTMLElement>(
              ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
            );
            doFocus(playBtn);
          } else if (dir === "up") {
            const cardAbove = findCardAbove(cards, cardIndex);
            if (cardAbove) {
              // Переход к кнопкам карточки строкой выше для плавного реверсивного перехода
              const aboveBtn = cardAbove.querySelector<HTMLElement>(
                ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
              );
              doFocus(aboveBtn || cardAbove.querySelector<HTMLElement>(".projacktor-dl-poster-btn"));
            } else {
              // Верхний ряд: переход в TabBar на текущую вкладку
              const activeTabEl = doc.querySelector<HTMLElement>(
                ".projacktor-tab-item.active, [role='tab'][aria-selected='true']"
              );
              if (activeTabEl) doFocus(activeTabEl);
            }
          }
        } else if (isButton) {
          const cardButtons = Array.from(
            currentCard.querySelectorAll<HTMLElement>(
              ".projacktor-dl-card-btns .projacktor-dl-btn-play, .projacktor-dl-card-btns .projacktor-dl-btn-icon, .projacktor-dl-card-btns [tabindex='0']"
            )
          );
          const btnIndex = cardButtons.findIndex((b) => b === active || b.contains(active));

          if (dir === "up") {
            // Вверх: возврат на постер этой же карточки
            const poster = currentCard.querySelector<HTMLElement>(".projacktor-dl-poster-btn");
            doFocus(poster);
          } else if (dir === "down") {
            // Вниз: переход на постер карточки строкой ниже
            const cardBelow = findCardBelow(cards, cardIndex);
            if (cardBelow) {
              const belowPoster = cardBelow.querySelector<HTMLElement>(".projacktor-dl-poster-btn");
              doFocus(belowPoster);
            }
          } else if (dir === "left") {
            if (btnIndex > 0) {
              doFocus(cardButtons[btnIndex - 1]);
            } else if (cardIndex > 0) {
              // Переход к последней кнопке предыдущей карточки
              const prevCard = cards[cardIndex - 1];
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
            } else if (cardIndex < cards.length - 1) {
              // Переход к первой кнопке следующей карточки
              const nextCard = cards[cardIndex + 1];
              const nextBtn = nextCard.querySelector<HTMLElement>(
                ".projacktor-dl-btn-play, .projacktor-dl-card-btns [tabindex='0']"
              );
              if (nextBtn) doFocus(nextBtn);
            }
          }
        }
      },
      [episodesModalItem]
    );

    // Слушатель событий Decky onGamepadDirection
    const handleGamepadDir = useCallback(
      (evt: any) => {
        const btn = evt?.detail?.button;
        if (btn === 9) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("up");
        } else if (btn === 10) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("down");
        } else if (btn === 11) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("left");
        } else if (btn === 12) {
          try { evt?.preventDefault?.(); evt?.stopPropagation?.(); } catch {}
          handleDirection("right");
        }
      },
      [handleDirection]
    );

    // Слушатель событий геймпада и стиков через SteamClient.Input (RawButton)
    useEffect(() => {
      const un = subscribeControllerInput((e) => {
        if (!e.pressed) return;
        if (isModalOpen() || episodesModalItem) return;

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
    }, [handleDirection, episodesModalItem]);

    // Слушатель клавиш стрелок клавиатуры
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const doc = getActiveDocument(root);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isModalOpen() || episodesModalItem) return;
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
    }, [handleDirection, episodesModalItem]);

    const activeEpisodes = episodesModalItem ? episodesMap[episodesModalItem.id] || [] : [];
    const isActiveEpisodesLoading = episodesModalItem
      ? !!episodesLoading[episodesModalItem.id]
      : false;

    return (
      <Focusable
        ref={rootRef}
        noFocusRing
        className="projacktor-library-content"
        onGamepadDirection={handleGamepadDir}
      >
        {library.length === 0 ? (
          <Focusable
            className="projacktor-empty-lib"
            tabIndex={0}
            noFocusRing
            onGamepadDirection={handleGamepadDir}
            style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.4)" }}
          >
            Загрузки пусты. Добавьте фильмы или сериалы из каталога.
          </Focusable>
        ) : (
          <div className="projacktor-downloads-grid">
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
                      className="projacktor-dl-btn-play"
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

        {/* Модальное окно серий для сериалов */}
        {episodesModalItem && (
          <div
            className="projacktor-episodes-modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setEpisodesModalItem(null);
              }
            }}
          >
            <div className="projacktor-episodes-modal-box">
              <div className="projacktor-episodes-modal-header">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                    {episodesModalItem.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ds-text-dim)", marginTop: 2 }}>
                    Выборочная загрузка и онлайн просмотр серий
                  </div>
                </div>
                <Focusable
                  className="ds-btn ds-btn--compact ds-btn--icon"
                  noFocusRing
                  onActivate={() => setEpisodesModalItem(null)}
                  onClick={() => setEpisodesModalItem(null)}
                  title="Закрыть (B)"
                >
                  <FaTimes style={{ fontSize: 12 }} />
                </Focusable>
              </div>

              <div className="projacktor-episodes-modal-list">
                {isActiveEpisodesLoading ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--ds-text-dim)", fontSize: 13 }}>
                    <FaSpinner style={{ animation: "projacktor-spin 0.9s linear infinite", marginRight: 8 }} />
                    Загрузка серий из торрента...
                  </div>
                ) : activeEpisodes.length === 0 ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--ds-text-dim)", fontSize: 13 }}>
                    Серии пока не найдены. Если торрент только добавлен, подождите несколько секунд подключения к раздаче.
                  </div>
                ) : (
                  activeEpisodes.map((ep: EpisodeItem) => {
                    const isEpCompleted =
                      ep.downloaded || (ep.size > 0 && ep.completed >= ep.size);
                    const isEpPartial = ep.completed > 0 && !isEpCompleted;

                    return (
                      <Focusable
                        key={ep.index}
                        noFocusRing
                        className="projacktor-episode-row"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "var(--ds-surface)",
                          border: "1px solid var(--ds-border)",
                          borderRadius: 0,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={ep.name}>
                            <span style={{ color: "var(--ds-accent)", marginRight: 6 }}>#{ep.index + 1}</span>
                            {ep.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ds-text-dim)", marginTop: 2 }}>
                            {ep.size > 0 ? formatBytes(ep.size) : ""}
                            {isEpCompleted && (
                              <span style={{ color: "var(--ds-success)", marginLeft: 8, fontWeight: 600 }}>
                                ✓ Скачано
                              </span>
                            )}
                            {isEpPartial && (
                              <span style={{ color: "var(--ds-accent)", marginLeft: 8 }}>
                                {formatBytes(ep.completed)} / {formatBytes(ep.size)} (
                                {((ep.completed / ep.size) * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>

                        <Focusable flow-children="horizontal" noFocusRing style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Focusable
                            className="ds-btn ds-btn--compact ds-btn--primary"
                            noFocusRing
                            onActivate={() => {
                              watchOnline(episodesModalItem, ep.index);
                            }}
                            onClick={() => {
                              watchOnline(episodesModalItem, ep.index);
                            }}
                            title="Смотреть онлайн"
                          >
                            <FaPlay style={{ fontSize: 10, marginRight: 4 }} />
                            Онлайн
                          </Focusable>

                          {!isEpCompleted && (
                            <Focusable
                              className="ds-btn ds-btn--compact"
                              noFocusRing
                              onActivate={() => downloadEpisode(episodesModalItem, ep)}
                              onClick={() => downloadEpisode(episodesModalItem, ep)}
                              title="Скачать эту серию"
                            >
                              <FaDownload style={{ fontSize: 10, marginRight: 4 }} />
                              Скачать
                            </Focusable>
                          )}
                        </Focusable>
                      </Focusable>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Focusable>
    );
  }
);
