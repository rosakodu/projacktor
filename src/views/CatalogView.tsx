import { FC, memo, useState, useEffect, useCallback } from "react";
import { CatalogCategory, MediaItem, SectorKey } from "../types";
import { useCatalogCategory } from "../hooks/useCatalogCategory";
import { SectorShelf } from "../components/SectorShelf";

interface CatalogViewProps {
  category: CatalogCategory;
  onSelectMovie: (movie: MediaItem) => void;
}

interface SectionConfig {
  key: SectorKey;
  title: string;
}

const SECTIONS: SectionConfig[] = [
  { key: "watching_today", title: "Сегодня смотрят" },
  { key: "trending_today", title: "Сегодня в тренде" },
  { key: "top_rated", title: "Высокий рейтинг" },
];

export const CatalogView: FC<CatalogViewProps> = memo(({ category, onSelectMovie }) => {
  const { watchingItems, trendingItems, topRatedItems, loading } =
    useCatalogCategory(category);

  const [sectionIndex, setSectionIndex] = useState<number>(0);

  // При переключении вкладок всегда сбрасываем на первый раздел («Сегодня смотрят»)
  useEffect(() => {
    setSectionIndex(0);
  }, [category]);

  const onPrevSection = useCallback(() => {
    setSectionIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const onNextSection = useCallback(() => {
    setSectionIndex((prev) => (prev < SECTIONS.length - 1 ? prev + 1 : prev));
  }, []);

  const currentSection = SECTIONS[sectionIndex] || SECTIONS[0];

  const currentItems =
    sectionIndex === 0
      ? watchingItems
      : sectionIndex === 1
      ? trendingItems
      : topRatedItems;

  return (
    <div className="projacktor-content">
      <SectorShelf
        key={`${category}-${currentSection.key}`}
        title={currentSection.title}
        items={currentItems}
        onSelectMovie={onSelectMovie}
        loading={loading}
        onPrevSection={onPrevSection}
        onNextSection={onNextSection}
        hasPrevSection={sectionIndex > 0}
        hasNextSection={sectionIndex < SECTIONS.length - 1}
      />
    </div>
  );
});


