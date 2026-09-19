import { FC, memo, useState, useEffect, useCallback, useMemo } from "react";
import { CatalogCategory, MediaItem, SectorKey } from "../types";
import { useCatalogCategory } from "../hooks/useCatalogCategory";
import { SectorShelf } from "../components/SectorShelf";
import { useI18n } from "../i18n";

interface CatalogViewProps {
  category: CatalogCategory;
  onSelectMovie: (movie: MediaItem) => void;
}

interface SectionConfig {
  key: SectorKey;
  title: string;
}

export const CatalogView: FC<CatalogViewProps> = memo(({ category, onSelectMovie }) => {
  const { t } = useI18n();
  const { watchingItems, trendingItems, topRatedItems, loading } =
    useCatalogCategory(category);

  const sections: SectionConfig[] = useMemo(
    () => [
      { key: "watching_today", title: t("watchingToday") },
      { key: "trending_today", title: t("trendingToday") },
      { key: "top_rated", title: t("topRated") },
    ],
    [t]
  );

  const [sectionIndex, setSectionIndex] = useState<number>(0);

  // При переключении вкладок всегда сбрасываем на первый раздел
  useEffect(() => {
    setSectionIndex(0);
  }, [category]);

  const onPrevSection = useCallback(() => {
    setSectionIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const onNextSection = useCallback(() => {
    setSectionIndex((prev) => (prev < sections.length - 1 ? prev + 1 : prev));
  }, [sections.length]);

  const currentSection = sections[sectionIndex] || sections[0];

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
        hasNextSection={sectionIndex < sections.length - 1}
      />
    </div>
  );
});


