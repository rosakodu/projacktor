import { FC, useState, useCallback, useEffect, useRef, memo } from "react";
import { Focusable, TextField } from "@decky/ui";
import { MediaItem } from "../types";
import { searchCatalog } from "../api";
import { Shelf } from "../components/Shelf";
import { getActiveDocument } from "../runtime/activeDoc";

interface SearchViewProps {
  onSelectMovie: (movie: MediaItem) => void;
}

export const SearchView: FC<SearchViewProps> = memo(({ onSelectMovie }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>("" );
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  // Авто-фокус на поле ввода при переходе в поиск
  useEffect(() => {
    let cancelled = false;
    const focusSearch = () => {
      if (cancelled) return true;
      const root = rootRef.current;
      const doc = getActiveDocument(root);

      const input = root
        ? root.querySelector<HTMLElement>("input, button, .ds-btn")
        : null;
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
    try {
      const results = await searchCatalog(searchQuery);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <Focusable
      ref={rootRef}
      flow-children="vertical"
      noFocusRing
      className="projacktor-content"
      onGamepadDirection={(evt: any) => {
        const btn = evt?.detail?.button;
        if (btn === 9) {
          // DPAD_UP: блокируем переход вверх на вкладки из поиска
          const doc = getActiveDocument(rootRef.current);
          const active = doc?.activeElement;
          const searchBar = rootRef.current?.querySelector("form, input, .ds-btn--primary");
          if (active && searchBar && (searchBar === active || searchBar.contains(active))) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            return false;
          }
        }
        return undefined;
      }}
    >
      <Focusable
        noFocusRing
        style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", padding: "0 52px" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          style={{ flex: 1, display: "flex" }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              {...({ placeholder: "Введите название фильма или сериала..." } as any)}
            />
          </div>
        </form>
        <Focusable
          className="ds-btn ds-btn--primary"
          noFocusRing
          onActivate={handleSearch}
          onClick={handleSearch}
        >
          {searchLoading ? "Поиск..." : "Найти"}
        </Focusable>
      </Focusable>

      <Shelf
        items={searchResults}
        onSelectMovie={onSelectMovie}
        loading={searchLoading}
      />
    </Focusable>
  );
});
