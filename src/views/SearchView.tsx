import { FC, useState, useCallback, memo } from "react";
import { Focusable, TextField } from "@decky/ui";
import { MediaItem } from "../types";
import { searchCatalog } from "../api";
import { Shelf } from "../components/Shelf";

interface SearchViewProps {
  onSelectMovie: (movie: MediaItem) => void;
}

export const SearchView: FC<SearchViewProps> = memo(({ onSelectMovie }) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

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
    <div className="projacktor-content">
      <Focusable
        noFocusRing
        style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}
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
    </div>
  );
});
