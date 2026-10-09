import { FC, useState, useCallback, useEffect, useRef, memo } from "react";
import { Focusable, GamepadButton } from "@decky/ui";
import { FaHistory } from "react-icons/fa";
import { MediaItem } from "../types";
import { searchCatalog } from "../api";
import { Shelf } from "../components/Shelf";
import { GamepadTextField } from "../components";
import { getActiveDocument } from "../runtime/activeDoc";
import { RawButton, subscribeControllerInput } from "../runtime/controllerInput";
import { isModalOpen, isUserInTabs, isPlayerActive } from "../runtime/homeInputBus";
import { playCardNavSound } from "../runtime/navSound";
import { triggerHaptic } from "../runtime/haptics";
import { setBackdropMovie } from "../runtime/backdropBus";
import { getSearchHistory, addSearchHistory } from "../runtime/searchHistory";
import { useEnsureFocus } from "../hooks/useEnsureFocus";
import { useI18n } from "../i18n";

interface SearchViewProps {
  onSelectMovie: (movie: MediaItem) => void;
  onNavigateUp?: () => void;
}

export const SearchView: FC<SearchViewProps> = memo(({ onSelectMovie, onNavigateUp }) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
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

    const input = root.querySelector<HTMLInputElement>("input.DialogInput, input");
    if (input) {
      try {
        doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
        input.focus();
        input.classList.add("gpfocus");
        input.classList.add("gpfocuswithin");
        input.closest(".DialogInput_Wrapper")?.classList.add("gpfocuswithin");
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

  const lastChipStepAtRef = useRef<number>(0);
  const CHIP_STEP_COOLDOWN_MS = 160;

  const stepHistoryChip = useCallback((dir: 1 | -1) => {
    const now = Date.now();
    if (now - lastChipStepAtRef.current < CHIP_STEP_COOLDOWN_MS) return false;
    lastChipStepAtRef.current = now;

    const root = rootRef.current;
    if (!root) return false;
    const chips = Array.from(root.querySelectorAll<HTMLElement>(".projacktor-search-chip"));
    if (chips.length === 0) return false;

    const doc = getActiveDocument(root);
    const active = doc?.activeElement;
    const curIdx = chips.findIndex(
      (c) => c === active || c.contains(active as Node)
    );

    let nextIdx: number;
    if (curIdx === -1) {
      nextIdx = dir > 0 ? 0 : chips.length - 1;
    } else {
      nextIdx = curIdx + dir;
      if (nextIdx < 0 || nextIdx >= chips.length) {
        return false;
      }
    }

    const chip = chips[nextIdx];
    if (chip) {
      doc?.querySelectorAll(".gpfocus").forEach((el) => {
        if (el !== chip) el.classList.remove("gpfocus");
      });
      chip.focus();
      chip.classList.add("gpfocus", "gpfocuswithin");
      try {
        (chip as any).TakeFocus?.(0);
      } catch {}
      try {
        chip.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {}
      triggerHaptic("light", "both");
      playCardNavSound();
      return true;
    }
    return false;
  }, []);

  const focusFirstHistoryChip = useCallback(() => {
    lastChipStepAtRef.current = 0;
    const root = rootRef.current;
    if (!root) return false;
    const chip = root.querySelector<HTMLElement>(".projacktor-search-chip");
    if (chip) {
      const doc = getActiveDocument(chip);
      doc?.querySelectorAll(".gpfocus").forEach((el) => {
        if (el !== chip) el.classList.remove("gpfocus");
      });
      chip.focus();
      chip.classList.add("gpfocus", "gpfocuswithin");
      try {
        (chip as any).TakeFocus?.(0);
      } catch {}
      try {
        chip.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {}
      triggerHaptic("light", "both");
      playCardNavSound();
      return true;
    }
    return false;
  }, []);

  const chipsRowRef = useRef<HTMLDivElement>(null);

  const handleChipGamepadDirection = useCallback(
    (evt: any) => {
      const btn = evt?.detail?.button;
      if (btn === 11 || btn === GamepadButton.DIR_LEFT) {
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        stepHistoryChip(-1);
        return false;
      }
      if (btn === 12 || btn === GamepadButton.DIR_RIGHT) {
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        stepHistoryChip(1);
        return false;
      }
      if (btn === 9 || btn === GamepadButton.DIR_UP) {
        try {
          evt?.preventDefault?.();
          evt?.stopPropagation?.();
        } catch {}
        focusSearchInput();
        return false;
      }
      if (btn === 10 || btn === GamepadButton.DIR_DOWN) {
        if (searchResults.length > 0) {
          try {
            evt?.preventDefault?.();
            evt?.stopPropagation?.();
          } catch {}
          focusFirstCard();
          return false;
        }
      }
      return undefined;
    },
    [stepHistoryChip, focusSearchInput, searchResults.length, focusFirstCard]
  );

  // Сброс фона на чистый темный при монтировании вкладки поиска
  useEffect(() => {
    setBackdropMovie(null, true);
  }, []);

  // Авто-фокус на поле ввода при переходе в поиск
  useEnsureFocus(() => {
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
  }, []);

  const handleSearch = useCallback(
    async (queryOverride?: string | any) => {
      const root = rootRef.current;
      const input = root?.querySelector<HTMLInputElement>("input.DialogInput, input");
      const text = typeof queryOverride === "string" ? queryOverride : (input?.value || searchQuery);
      const query = text.trim();
      if (!query || searchLoading) return;
      setSearchQuery(query);
      // Сохраняем недавний запрос в историю
      const updatedHistory = addSearchHistory(query);
      setSearchHistory(updatedHistory);
      setSearchLoading(true);
      setBackdropMovie(null);
      try {
        input?.blur?.();
      } catch {}
      try {
        const results = await searchCatalog(query);
        setSearchResults(results);
      } finally {
        setSearchLoading(false);
      }
    },
    [searchQuery, searchLoading]
  );

  const handleSelectHistory = useCallback(
    (query: string) => {
      setSearchQuery(query);
      handleSearch(query);
    },
    [handleSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        handleSearch();
      } else if (e.key === "ArrowDown") {
        if (searchResults.length > 0) {
          e.preventDefault();
          focusFirstCard();
        } else if (searchHistory.length > 0) {
          e.preventDefault();
          focusFirstHistoryChip();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        onNavigateUp?.();
      } else if (e.key === "ArrowRight") {
        const root = rootRef.current;
        const btnSearch = root?.querySelector<HTMLElement>(".ds-btn--primary");
        if (btnSearch) {
          e.preventDefault();
          e.stopPropagation();
          const doc = getActiveDocument(btnSearch);
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          btnSearch.focus();
          btnSearch.classList.add("gpfocus", "gpfocuswithin");
          try { (btnSearch as any).TakeFocus?.(0); } catch {}
        }
      }
    },
    [handleSearch, searchResults.length, searchHistory.length, focusFirstCard, focusFirstHistoryChip, onNavigateUp]
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

      const isLeft =
        e.button === RawButton.DPAD_LEFT ||
        e.button === RawButton.LEFTSTICK_LEFT ||
        e.button === RawButton.LEFTPAD_LEFT ||
        e.button === 7 ||
        e.button === 22 ||
        e.button === 12;

      const isRight =
        e.button === RawButton.DPAD_RIGHT ||
        e.button === RawButton.LEFTSTICK_RIGHT ||
        e.button === RawButton.LEFTPAD_RIGHT ||
        e.button === 5 ||
        e.button === 23 ||
        e.button === 13;

      const isL2 =
        e.button === RawButton.L2 ||
        e.button === 28;

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

      const chipEl = (active && (active.classList?.contains("projacktor-search-chip") ? active : (active as HTMLElement)?.closest?.(".projacktor-search-chip"))) as HTMLElement | null;
      if (chipEl) {
        if (isLeft) {
          stepHistoryChip(-1);
          return;
        }
        if (isRight) {
          stepHistoryChip(1);
          return;
        }
        if (isUp) {
          focusSearchInput();
          return;
        }
        if (isDown) {
          if (searchResults.length > 0) {
            focusFirstCard();
          }
          return;
        }
      }

      if (isLeft) {
        const isSearchBtn = !!(active && (active.classList?.contains("ds-btn") || (active as HTMLElement)?.closest?.(".ds-btn")));
        if (isSearchBtn) {
          focusSearchInput();
        }
      } else if (isRight) {
        if (isInsideSearchBar) {
          const input = root.querySelector<HTMLInputElement>("input.DialogInput, input");
          if (active === input || input?.contains(active as Node)) {
            const btnSearch = root.querySelector<HTMLElement>(".ds-btn--primary");
            if (btnSearch) {
              const doc = getActiveDocument(btnSearch);
              doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
              btnSearch.focus();
              btnSearch.classList.add("gpfocus", "gpfocuswithin");
              try { (btnSearch as any).TakeFocus?.(0); } catch {}
            }
          }
        }
      } else if (isL2) {
        if (isInsideSearchBar) {
          const input = root.querySelector<HTMLInputElement>("input.DialogInput, input");
          const val = (input?.value || searchQuery).trim();
          if (val) {
            handleSearch(val);
          }
        }
      } else if (isUp) {
        if (!isInsideSearchBar) {
          // С карточки возвращаемся на поиск
          focusSearchInput();
        }
      } else if (isDown) {
        if (isInsideSearchBar) {
          if (searchResults.length > 0) {
            focusFirstCard();
          } else if (searchHistory.length > 0) {
            focusFirstHistoryChip();
          }
        }
      }
    });

    return un;
  }, [searchResults.length, searchHistory.length, searchQuery, handleSearch, focusSearchInput, focusFirstCard, focusFirstHistoryChip, stepHistoryChip, onNavigateUp]);

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
            if (onNavigateUp) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              onNavigateUp();
              return false;
            }
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
          if (isInsideSearchBar) {
            if (searchResults.length > 0) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstCard();
              return false;
            } else if (searchHistory.length > 0) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstHistoryChip();
              return false;
            }
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
          if (btn === 11 || btn === GamepadButton.DIR_LEFT) {
            const active = getActiveDocument(rootRef.current)?.activeElement;
            if (active && (active.classList?.contains("ds-btn") || (active as HTMLElement)?.closest?.(".ds-btn"))) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusSearchInput();
              return false;
            }
          }
          if (btn === 7 || btn === GamepadButton.TRIGGER_LEFT || btn === 28) {
            const root = rootRef.current;
            const input = root?.querySelector<HTMLInputElement>("input.DialogInput, input");
            const val = (input?.value || searchQuery).trim();
            if (val) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              handleSearch(val);
              return false;
            }
          }
          if (btn === 9) {
            if (onNavigateUp) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              onNavigateUp();
              return false;
            }
          } else if (btn === 10) {
            // DPAD_DOWN: переходим на карточки или на чипсы истории
            if (searchResults.length > 0) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstCard();
              return false;
            } else if (searchHistory.length > 0) {
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusFirstHistoryChip();
              return false;
            }
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
            if (btn === 7 || btn === GamepadButton.TRIGGER_LEFT || btn === 28) {
              const root = rootRef.current;
              const input = root?.querySelector<HTMLInputElement>("input.DialogInput, input");
              const val = (input?.value || searchQuery).trim();
              if (val) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                handleSearch(val);
                return false;
              }
            }
            if (btn === 9 || btn === GamepadButton.DIR_UP) {
              if (onNavigateUp) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                onNavigateUp();
                return false;
              }
            }
            if (btn === 12 || btn === GamepadButton.DIR_RIGHT) {
              const root = rootRef.current;
              const btnSearch = root?.querySelector<HTMLElement>(".ds-btn--primary");
              if (btnSearch) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                const doc = getActiveDocument(btnSearch);
                doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
                btnSearch.focus();
                btnSearch.classList.add("gpfocus");
                btnSearch.classList.add("gpfocuswithin");
                try { (btnSearch as any).TakeFocus?.(0); } catch {}
                return false;
              }
            }
            if (btn === 10) {
              // DPAD_DOWN: переходим на карточки или историю
              if (searchResults.length > 0) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                focusFirstCard();
                return false;
              } else if (searchHistory.length > 0) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                focusFirstHistoryChip();
                return false;
              }
            }
            return undefined;
          }}
          placeholder={t("enterMovieOrShowName")}
        />
        <Focusable
          className="ds-btn ds-btn--primary"
          noFocusRing
          tabIndex={0}
          onFocus={() => setBackdropMovie(null)}
          onActivate={() => handleSearch()}
          onClick={() => handleSearch()}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              onNavigateUp?.();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              focusSearchInput();
            }
          }}
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
            if (btn === 11 || btn === GamepadButton.DIR_LEFT) {
              // DPAD_LEFT: фокус на поле ввода
              try {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
              } catch {}
              focusSearchInput();
              return false;
            } else if (btn === 10) {
              // DPAD_DOWN: переходим на карточки или историю
              if (searchResults.length > 0) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                focusFirstCard();
                return false;
              } else if (searchHistory.length > 0) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                focusFirstHistoryChip();
                return false;
              }
            } else if (btn === 9 || btn === GamepadButton.DIR_UP) {
              if (onNavigateUp) {
                try {
                  evt?.preventDefault?.();
                  evt?.stopPropagation?.();
                } catch {}
                onNavigateUp();
                return false;
              }
            }
            return undefined;
          }}
        >
          {searchLoading ? t("searching") : t("searchBtn")}
        </Focusable>
      </Focusable>

      {/* Секция недавних поисковых запросов (минималистичные чипсы) */}
      {searchHistory.length > 0 && searchResults.length === 0 && (
        <div className="projacktor-search-history-section">
          <div className="projacktor-search-history-header">
            <div className="projacktor-search-history-title">
              <FaHistory style={{ fontSize: 11 }} />
              <span>{t("recentSearches")}</span>
            </div>
          </div>

          <Focusable
            ref={chipsRowRef}
            flow-children="horizontal"
            noFocusRing
            className="projacktor-search-history-chips"
            onGamepadDirection={handleChipGamepadDirection}
          >
            {searchHistory.map((q) => (
              <Focusable
                key={q}
                className="projacktor-search-chip"
                noFocusRing
                tabIndex={0}
                onActivate={() => {
                  triggerHaptic("click", "both");
                  handleSelectHistory(q);
                }}
                onClick={() => {
                  triggerHaptic("click", "both");
                  handleSelectHistory(q);
                }}
                onGamepadDirection={handleChipGamepadDirection}
                onKeyDown={(e: any) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    e.stopPropagation();
                    focusSearchInput();
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    e.stopPropagation();
                    stepHistoryChip(-1);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    stepHistoryChip(1);
                  } else if (e.key === "ArrowDown") {
                    if (searchResults.length > 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      focusFirstCard();
                    }
                  }
                }}
              >
                {q}
              </Focusable>
            ))}
          </Focusable>
        </div>
      )}

      <Shelf
        items={searchResults}
        onSelectMovie={onSelectMovie}
        loading={searchLoading}
        onNavigateUp={focusSearchInput}
      />
    </Focusable>
  );
});
