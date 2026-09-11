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

  // Авто-фокус на поле ввода при переходе в поиск (если фокус не на табах)
  useEffect(() => {
    let cancelled = false;
    const focusSearch = () => {
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

      const input = root
        ? root.querySelector<HTMLElement>("input, button, .ds-btn")
        : null;
      if (input) {
        try {
          input.focus();
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
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await searchCatalog(searchQuery);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  return (
    <Focusable
      ref={rootRef}
      flow-children="vertical"
      noFocusRing
      className="projacktor-content"
    >
      <Focusable
        noFocusRing
        style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", padding: "0 52px" }}
      >
        <div style={{ flex: 1 }}>
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            {...({ placeholder: "Введите название фильма или сериала..." } as any)}
          />
        </div>
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
        title={searchResults.length > 0 ? "Результаты поиска" : "Поиск"}
        items={searchResults}
        onSelectMovie={onSelectMovie}
        loading={searchLoading}
      />
    </Focusable>
  );
});
