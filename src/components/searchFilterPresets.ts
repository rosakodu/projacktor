import { DiscoverFilters, GENRE_LIST, COUNTRY_LIST, SORT_OPTIONS } from "../services/discoverService";
import { Locale, TranslationKey } from "../i18n";

export interface FilterChipOption {
  key: string;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

export interface FilterRowConfig {
  id: string;
  label: string;
  chips: FilterChipOption[];
}

interface YearPreset {
  key: string;
  labelRu: string;
  labelEn: string;
  yearFrom?: number;
  yearTo?: number;
}

const YEAR_PRESETS: YearPreset[] = [
  { key: "2026", labelRu: "2026", labelEn: "2026", yearFrom: 2026, yearTo: 2026 },
  { key: "2025", labelRu: "2025", labelEn: "2025", yearFrom: 2025, yearTo: 2025 },
  { key: "2024", labelRu: "2024", labelEn: "2024", yearFrom: 2024, yearTo: 2024 },
  { key: "2023", labelRu: "2023", labelEn: "2023", yearFrom: 2023, yearTo: 2023 },
  { key: "2020s", labelRu: "2020-е", labelEn: "2020s", yearFrom: 2020, yearTo: 2029 },
  { key: "2010s", labelRu: "2010-е", labelEn: "2010s", yearFrom: 2010, yearTo: 2019 },
  { key: "2000s", labelRu: "2000-е", labelEn: "2000s", yearFrom: 2000, yearTo: 2009 },
];

const RATING_VALUES = [6, 7, 8, 9] as const;

export function buildFilterRows(
  filters: DiscoverFilters,
  locale: Locale,
  t: (key: TranslationKey) => string,
  updateFilters: (patch: Partial<DiscoverFilters>) => void
): FilterRowConfig[] {
  const isEn = locale === "en";

  const typeChips: FilterChipOption[] = [
    { key: "all", label: t("filterAll"), isActive: filters.mediaType === "all", onSelect: () => updateFilters({ mediaType: "all" }) },
    { key: "movie", label: t("filterMovies"), isActive: filters.mediaType === "movie", onSelect: () => updateFilters({ mediaType: "movie" }) },
    { key: "tv", label: t("filterTvShows"), isActive: filters.mediaType === "tv", onSelect: () => updateFilters({ mediaType: "tv" }) },
  ];

  const genreChips: FilterChipOption[] = [
    { key: "all", label: t("filterAll"), isActive: filters.genreId === undefined, onSelect: () => updateFilters({ genreId: undefined }) },
    ...GENRE_LIST.map((g) => ({
      key: String(g.id),
      label: isEn ? g.nameEn : g.nameRu,
      isActive: filters.genreId === g.id,
      onSelect: () => updateFilters({ genreId: filters.genreId === g.id ? undefined : g.id }),
    })),
  ];

  const yearChips: FilterChipOption[] = [
    {
      key: "all",
      label: t("filterAll"),
      isActive: filters.yearFrom === undefined && filters.yearTo === undefined,
      onSelect: () => updateFilters({ yearFrom: undefined, yearTo: undefined }),
    },
    ...YEAR_PRESETS.map((p) => {
      const active = filters.yearFrom === p.yearFrom && filters.yearTo === p.yearTo;
      return {
        key: p.key,
        label: isEn ? p.labelEn : p.labelRu,
        isActive: active,
        onSelect: () => updateFilters(active ? { yearFrom: undefined, yearTo: undefined } : { yearFrom: p.yearFrom, yearTo: p.yearTo }),
      };
    }),
    {
      key: "classic",
      label: t("filterClassic"),
      isActive: filters.yearFrom === undefined && filters.yearTo === 1999,
      onSelect: () => {
        const active = filters.yearFrom === undefined && filters.yearTo === 1999;
        updateFilters(active ? { yearFrom: undefined, yearTo: undefined } : { yearFrom: undefined, yearTo: 1999 });
      },
    },
  ];

  const ratingChips: FilterChipOption[] = [
    { key: "any", label: t("filterAnyRating"), isActive: filters.ratingMin === undefined, onSelect: () => updateFilters({ ratingMin: undefined }) },
    ...RATING_VALUES.map((val) => ({
      key: String(val),
      label: `★ ${val}+`,
      isActive: filters.ratingMin === val,
      onSelect: () => updateFilters({ ratingMin: filters.ratingMin === val ? undefined : val }),
    })),
  ];

  const countryChips: FilterChipOption[] = [
    { key: "all", label: t("filterAll"), isActive: !filters.country, onSelect: () => updateFilters({ country: undefined }) },
    ...COUNTRY_LIST.map((c) => ({
      key: c.code,
      label: isEn ? c.nameEn : c.nameRu,
      isActive: filters.country === c.code,
      onSelect: () => updateFilters({ country: filters.country === c.code ? undefined : c.code }),
    })),
  ];

  const sortChips: FilterChipOption[] = SORT_OPTIONS.map((opt) => ({
    key: opt.value,
    label: isEn ? opt.labelEn : opt.labelRu,
    isActive: (filters.sortBy ?? "popularity.desc") === opt.value,
    onSelect: () => updateFilters({ sortBy: opt.value as DiscoverFilters["sortBy"] }),
  }));

  return [
    { id: "type", label: t("filterType"), chips: typeChips },
    { id: "genre", label: t("filterGenre"), chips: genreChips },
    { id: "year", label: t("filterYear"), chips: yearChips },
    { id: "rating", label: t("filterRating"), chips: ratingChips },
    { id: "country", label: t("filterCountry"), chips: countryChips },
    { id: "sort", label: t("filterSort"), chips: sortChips },
  ];
}
