import { FC, useState, useCallback, useEffect, useRef, memo } from "react";
import { Focusable } from "@decky/ui";
import { FaPaste } from "react-icons/fa";
import { MediaItem } from "../types";
import { searchCatalog } from "../api";
import { Shelf } from "../components/Shelf";
import { GamepadTextField } from "../components";
import { getActiveDocument } from "../runtime/activeDoc";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen, isUserInTabs, isPlayerActive } from "../runtime/homeInputBus";
import { playCardNavSound } from "../runtime/navSound";
import { setBackdropMovie } from "../runtime/backdropBus";
import { useI18n } from "../i18n";

interface SearchViewProps {
  onSelectMovie: (movie: MediaItem) => void;
}

export const SearchView: FC<SearchViewProps> = memo(({ onSelectMovie }) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const lastNavAtRef = useRef<number>(0);

  const focusSearchInput = useCallback(() => {
    const now = Date.now();
    if (now - lastNavAtRef.current < 100) return;
    lastNavAtRef.current = now;

    // Сбрасываем фон фильма на чистый темный фон поиска
    setBackdropMovie(null);

    const root = rootRef.current;
    if (!root) return;
    const doc = getActiveDocument(root);

    // Скроллим контейнер наверх к строке поиска
    const parentScroll = root.closest(".projacktor-content-scroll") as HTMLElement | null;
    if (parentScroll) {
      parentScroll.scrollTo({ top: 0, behavior: "smooth" });
    }

    const input = root.querySelector<HTMLElement>(".projacktor-gamepad-textfield, input, .DialogInput");
    if (input) {
      try {
        doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        input.focus();
        input.classList.add("gpfocus");
        playCardNavSound();
      } catch {}
    }
  }, []);

  const focusFirstCard = useCallback(() => {
    const now = Date.now();
    if (now - lastNavAtRef.current < 100) return;
    lastNavAtRef.current = now;

    const root = rootRef.current;
    if (!root) return;
    const doc = getActiveDocument(root);

    const firstCard = root.querySelector<HTMLElement>(".projacktor-shelf .projacktor-card");
    if (firstCard) {
      try {
        doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        firstCard.focus();
        firstCard.classList.add("gpfocus");
        playCardNavSound();
        if (searchResults.length > 0) {
          setBackdropMovie(searchResults[0]);
        }
      } catch {}
    }
  }, [searchResults]);

  // Сброс фона на чистый темный при монтировании вкладки поиска
  useEffect(() => {
    setBackdropMovie(null, true);
  }, []);

  // Авто-фокус на поле ввода при переходе в поиск
  useEffect(() => {
    let cancelled = false;
    const focusSearch = () => {
      if (cancelled) return true;
      if (isModalOpen() || isUserInTabs()) return true;
      const root = rootRef.current;
      if (!root) return false;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement;
      if (active && active !== doc?.body && root.contains(active)) {
        return true;
      }

      const input = root.querySelector<HTMLElement>("input, button, .ds-btn");
      if (input) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          input.focus();
          input.classList.add("gpfocus");
        } catch {}
        return true;
      }
      return false;
    };

    if (!focusSearch()) {
      const t1 = setTimeout(focusSearch, 40);
      const t2 = setTimeout(focusSearch, 120);
      const t3 = setTimeout(focusSearch, 260);
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
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setBackdropMovie(null);
    try {
      const results = await searchCatalog(searchQuery);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchLoading]);

  const handlePaste = useCallback(async () => {
    try {
      let text = "";
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        text = await navigator.clipboard.readText();
      }
      if (text && typeof text === "string") {
        setSearchQuery(text.trim());
      }
    } catch (err) {
      console.warn("Не удалось прочитать буфер обмена:", err);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        handleSearch();
      } else if (e.key === "ArrowDown") {
        if (searchResults.length > 0) {
          e.preventDefault();
          focusFirstCard();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
      }
    },
    [handleSearch, searchResults.length, focusFirstCard]
  );

  // Подписка на события контроллера для надежной вертикальной навигации между поиском и результатами
  useEffect(() => {
    const un = subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (isModalOpen() || isPlayerActive()) return;

      const root = rootRef.current;
      if (!root) return;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement;
      if (!active || !root.contains(active as Node)) return;

      const searchBar = root.querySelector(".projacktor-search-bar-row, form");
      const isInsideSearchBar = !!(searchBar && (searchBar === active || searchBar.contains(active as Node)));

      const isUp =
        e.button === RawButton.DPAD_UP ||
        e.button === RawButton.LEFTSTICK_UP ||
        e.button === RawButton.LEFTPAD_UP ||
        e.button === 4 ||
        e.button === 20;

      const isDown =
        e.button === RawButton.DPAD_DOWN ||
        e.button === RawButton.LEFTSTICK_DOWN ||
        e.button === RawButton.LEFTPAD_DOWN ||
        e.button === 6 ||
        e.button === 21;

      if (isUp) {
        if (!isInsideSearchBar) {
          // С карточки возвращаемся на поиск
          focusSearchInput();
        }
      } else if (isDown) {
        if (isInsideSearchBar && searchResults.length > 0) {
          focusFirstCard();
        }
      }
    });

    return un;
  }, [searchResults.length, focusSearchInput, focusFirstCard]);

  return (
    <Focusable
      ref={rootRef}
      flow-children="vertical"
      noFocusRing
      className="projacktor-content projacktor-search-view"
      onGamepadDirection={(evt: any) => {
        const btn = evt?.detail?.button;
        const doc = getActiveDocument(rootRef.current);
        const active = doc?.activeElement;
        const root = rootRef.current;
        if (!root) return undefined;

        const searchBar = root.querySelector(".projacktor-search-bar-row, form");
        const isInsideSearchBar = !!(searchBar && (searchBar === active || searchBar.contains(active as Node)));

        if (btn === 9) {
          // DPAD_UP:
          if (isInsideSearchBar) {
            // В строке поиска блокируем переход вверх на вкладки
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            return false;
          } else {
            // На карточке или ниже — возвращаемся на строку поиска!
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            focusSearchInput();
            return false;
          }
        } else if (btn === 10) {
          // DPAD_DOWN:
          if (isInsideSearchBar && searchResults.length > 0) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            focusFirstCard();
            return false;
          }
        }
        return undefined;
      }}
    >
      <Focusable
        flow-children="row"
        noFocusRing
        className="projacktor-search-bar-row"
        style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", padding: "0 52px" }}
        onGamepadDirection={(evt: any) => {
          const btn = evt?.detail?.button;
          if (btn === 9) {
            // DPAD_UP: блокируем переход на вкладки
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            return false;
          } else if (btn === 10 && searchResults.length > 0) {
            // DPAD_DOWN: переходим на карточки
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            focusFirstCard();
            return false;
          }
          return undefined;
        }}
      >
        <GamepadTextField
          className="projacktor-search-input"
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={handleSearch}
          onFocus={() => setBackdropMovie(null)}
          onKeyDown={handleKeyDown}
          onGamepadDirection={(evt: any) => {
            const btn = evt?.detail?.button;
            if (btn === 10 && searchResults.length > 0) {
              // DPAD_DOWN: переходим на карточки
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstCard();
              return false;
            }
            return undefined;
          }}
          placeholder={t("enterMovieOrShowName")}
        />
        <Focusable
          className="ds-btn ds-btn--compact"
          noFocusRing
          onFocus={() => setBackdropMovie(null)}
          onActivate={handlePaste}
          onClick={handlePaste}
          style={{
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            height: 38,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
          onGamepadDirection={(evt: any) => {
            const btn = evt?.detail?.button;
            if (btn === 11) {
              // DPAD_LEFT: фокус на поле ввода
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusSearchInput();
              return false;
            } else if (btn === 10 && searchResults.length > 0) {
              // DPAD_DOWN: переходим на карточки
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstCard();
              return false;
            }
            return undefined;
          }}
          aria-label={t("paste")}
        >
          <FaPaste style={{ fontSize: 11 }} /> {t("paste")}
        </Focusable>
        <Focusable
          className="ds-btn ds-btn--primary"
          noFocusRing
          onFocus={() => setBackdropMovie(null)}
          onActivate={handleSearch}
          onClick={handleSearch}
          style={{
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            height: 38,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          onGamepadDirection={(evt: any) => {
            const btn = evt?.detail?.button;
            if (btn === 10 && searchResults.length > 0) {
              // DPAD_DOWN: переходим на карточки
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstCard();
              return false;
            } else if (btn === 9) {
              // DPAD_UP: блокируем переход на вкладки
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              return false;
            }
            return undefined;
          }}
        >
          {searchLoading ? t("searching") : t("searchBtn")}
        </Focusable>
      </Focusable>

      <Shelf
        items={searchResults}
        onSelectMovie={onSelectMovie}
        loading={searchLoading}
        onNavigateUp={focusSearchInput}
      />
    </Focusable>
  );
});
