import { useState, useEffect, useCallback } from "react";
import { rpcGetSteamLanguage } from "../api";
import { Locale, getLocale, setLocale, subscribeLocale } from "./state";

export * from "./state";

export const translations = {
  ru: {
    // Вкладки
    movies: "Главная",
    tv: "Сериалы",
    cartoons: "Мультфильмы",
    anime: "Аниме",
    search: "Поиск",
    watchlist: "Избранное",
    history: "Просмотрено",
    library: "Загрузки",
    settings: "Настройки",

    // Кнопки и действия
    watchOnline: "Смотреть онлайн",
    download: "Скачать",
    addToWatchlist: "В избранное",
    inWatchlist: "В избранном",
    removeFromWatchlist: "Удалить из избранного",
    clearHistory: "Очистить историю",
    delete: "Удалить",
    pause: "Пауза",
    resume: "Возобновить",
    goToCatalog: "Перейти в каталог",
    save: "Сохранить",
    saved: "Сохранено",
    clearCache: "Очистить кеш",
    clearing: "Очистка...",
    cleared: "Кеш очищен",
    check: "Проверить",
    paste: "Вставить",
    enterParserUrl: "Введите URL парсера",
    port: "Порт",
    cachePostersMetadata: "Кеш постеров и метаданных",
    enterMovieOrShowName: "Введите название фильма или сериала...",
    searchBtn: "Найти",
    searching: "Поиск...",
    watchingToday: "Сегодня смотрят",
    trendingToday: "Сегодня в тренде",
    topRated: "Высокий рейтинг",
    checkAgain: "Проверить снова",
    episodesNotFound: "Серии пока не найдены",
    episodesWaitDesc: "Если торрент только добавлен, подождите несколько секунд подключения к раздаче.",
    noData: "Нет данных",
    loading: "Загрузка...",
    onlineBadge: "Онлайн",
    downloadedBadge: "✓ Скачано",
    inLibraryBadge: "В библиотеке",
    pausedBadge: "⏸ Пауза",
    seriesBadge: "Сериал",
    movieBadge: "Фильм",
    episodes: "Серии",
    foundCount: "Найдено",
    loadingEpisodes: "Загрузка серий из торрента...",
    watch: "Смотреть",
    watchFile: "Смотреть файл",
    downloadThisEpisode: "Скачать эту серию",
    noEpisodesYet: "Серии пока не найдены",
    torrents: "Раздачи",
    searchingTorrents: "Поиск лучших раздач...",
    noTorrentsYet: "Раздач пока нет в сети",
    noTorrentsDesc: "Для данного релиза не найдено подходящих раздач на трекерах (включая TS и цифровые релизы).",
    close: "Закрыть",
    hideEpisodes: "Скрыть серии",
    selectEpisode: "Выбор серии",
    downloadSleepMagicBlack: "Загрузка с выключенным экраном (Magic Black)",
    connectingSeedsLoadingEpisodes: "Подключение к сидерам и загрузка серий...",
    torrentNoSeeds: "Раздача недоступна: 0 сидеров в сети (↑). Выберите раздачу с сидами.",
    failedToGetEpisodesTimeout: "Не удалось получить список серий (таймаут ответа сидеров).",
    retry: "Повторить",
    watchEpisodeOnline: "Смотреть серию онлайн",
    downloadEpisode: "Загрузить серию",
    downloadEpisodeMagicBlack: "Скачать серию с выключенным экраном",
    noTitle: "Без названия",
    details: "Подробнее",
    shelf: "Полка",
    prevTab: "Предыдущая вкладка (L1)",
    nextTab: "Следующая вкладка (R1)",
    rewind10s: "Перемотка назад (-10с)",
    fastForward10s: "Перемотка вперед (+10с)",
    play: "Воспроизведение",
    restart: "Начать сначала",
    selectSubtitles: "Выбор субтитров (X)",
    selectAudio: "Выбор звуковой дорожки (Y)",
    subtitles: "Субтитры",
    disableSubtitles: "Отключить субтитры",
    noSubtitlesFound: "Субтитры в раздаче не найдены",
    unsupported: "не поддерживаются",
    audioTrack: "Аудиодорожка",
    defaultTrack: "Дорожка по умолчанию",
    trackNumber: "Дорожка #",
    subtitlesNumber: "Субтитры #",
    audioLang: "Аудио",
    bufferingStream: "Буферизация видеопотока...",
    streamPlaybackError: "Ошибка воспроизведения потока. Проверьте файл.",
    openProject: "Открыть проект",
    episodesOf: "из",
    episodesPlural: "серий",

    // Настройки
    jackettParserUrl: "Ссылка на парсер Jackett",
    downloadDirectory: "Путь для загрузки",
    internalStorage: "Внутренняя память (SSD)",
    microSDCard: "Карта памяти (MicroSD)",
    torrserverStatus: "Статус TorrServer",
    jacredStatus: "Статус JacRed",
    checking: "Проверка...",
    connected: "Подключено",
    notConnected: "Не подключено",
    running: "Запущен",
    stopped: "Остановлен",
    freeSpace: "Свободно",
    totalSpace: "Всего",
    usedSpace: "Занято",
    externalDrives: "Накопители",

    // Пустые состояния и уведомления
    watchlistEmptyTitle: "В избранном пусто",
    watchlistEmptyDesc:
      "Добавляйте фильмы, сериалы и мультфильмы кнопкой «В избранное» из каталога или поиска.",
    historyEmptyTitle: "История просмотров пуста",
    historyEmptyDesc:
      "Здесь будут отображаться фильмы и серии, которые вы начали смотреть онлайн или офлайн.",
    libraryEmptyTitle: "Нет активных или скачанных загрузок",
    libraryEmptyDesc:
      "Здесь отображается очередь скачивания и сохраненные на диск файлы.",
    rescanLibraryBtn: "Найти скачанные файлы",
    rescanningLibraryBtn: "Поиск файлов...",
    rescannedSuccess: "Найдено файлов:",
    loadingWatchlist: "Загрузка избранного...",
    loadingHistory: "Загрузка истории...",
    loadingLibrary: "Загрузка...",
  },
  en: {
    // Tabs
    movies: "Home",
    tv: "TV Shows",
    cartoons: "Cartoons",
    anime: "Anime",
    search: "Search",
    watchlist: "Favorites",
    history: "History",
    library: "Downloads",
    settings: "Settings",

    // Buttons and actions
    watchOnline: "Watch Online",
    download: "Download",
    addToWatchlist: "Add to Favorites",
    inWatchlist: "In Favorites",
    removeFromWatchlist: "Remove from Favorites",
    clearHistory: "Clear History",
    delete: "Delete",
    pause: "Pause",
    resume: "Resume",
    goToCatalog: "Go to Catalog",
    save: "Save",
    saved: "Saved",
    clearCache: "Clear Cache",
    clearing: "Clearing...",
    cleared: "Cache Cleared",
    check: "Check",
    paste: "Paste",
    enterParserUrl: "Enter parser URL",
    port: "Port",
    cachePostersMetadata: "Posters and metadata cache",
    enterMovieOrShowName: "Enter movie or TV show title...",
    searchBtn: "Search",
    searching: "Searching...",
    watchingToday: "Watching Today",
    trendingToday: "Trending Today",
    topRated: "Top Rated",
    checkAgain: "Check again",
    episodesNotFound: "Episodes not found yet",
    episodesWaitDesc: "If the torrent was just added, please wait a few seconds to connect to seeds.",
    noData: "No data",
    loading: "Loading...",
    onlineBadge: "Online",
    downloadedBadge: "✓ Downloaded",
    inLibraryBadge: "In Library",
    pausedBadge: "⏸ Paused",
    seriesBadge: "TV Show",
    movieBadge: "Movie",
    episodes: "Episodes",
    foundCount: "Found",
    loadingEpisodes: "Loading episodes from torrent...",
    watch: "Watch",
    watchFile: "Watch file",
    downloadThisEpisode: "Download this episode",
    noEpisodesYet: "Episodes not found yet",
    torrents: "Torrents",
    searchingTorrents: "Searching for best torrents...",
    noTorrentsYet: "No torrents available yet",
    noTorrentsDesc: "No suitable torrents found on trackers for this release (including TS and digital releases).",
    close: "Close",
    hideEpisodes: "Hide episodes",
    selectEpisode: "Select episode",
    downloadSleepMagicBlack: "Download with screen off (Magic Black)",
    connectingSeedsLoadingEpisodes: "Connecting to seeds and loading episodes...",
    torrentNoSeeds: "Torrent unavailable: 0 seeders online (↑). Please select a torrent with seeds.",
    failedToGetEpisodesTimeout: "Failed to get episodes list (seeder response timeout).",
    retry: "Retry",
    watchEpisodeOnline: "Watch episode online",
    downloadEpisode: "Download episode",
    downloadEpisodeMagicBlack: "Download episode with screen off",
    noTitle: "Untitled",
    details: "Details",
    shelf: "Shelf",
    prevTab: "Previous tab (L1)",
    nextTab: "Next tab (R1)",
    rewind10s: "Rewind (-10s)",
    fastForward10s: "Fast forward (+10s)",
    play: "Play",
    restart: "Restart",
    selectSubtitles: "Select subtitles (X)",
    selectAudio: "Select audio track (Y)",
    subtitles: "Subtitles",
    disableSubtitles: "Disable subtitles",
    noSubtitlesFound: "No subtitles found in torrent",
    unsupported: "not supported",
    audioTrack: "Audio track",
    defaultTrack: "Default track",
    trackNumber: "Track #",
    subtitlesNumber: "Subtitles #",
    audioLang: "Audio",
    bufferingStream: "Buffering video stream...",
    streamPlaybackError: "Stream playback error. Check file.",
    openProject: "Open project",
    episodesOf: "of",
    episodesPlural: "episodes",

    // Settings
    jackettParserUrl: "Jackett Parser URL",
    downloadDirectory: "Download Directory",
    internalStorage: "Internal Storage (SSD)",
    microSDCard: "MicroSD Card",
    torrserverStatus: "TorrServer Status",
    jacredStatus: "JacRed Status",
    checking: "Checking...",
    connected: "Connected",
    notConnected: "Not Connected",
    running: "Running",
    stopped: "Stopped",
    freeSpace: "Free",
    totalSpace: "Total",
    usedSpace: "Used",
    externalDrives: "Drives",

    // Empty states and notifications
    watchlistEmptyTitle: "Favorites is empty",
    watchlistEmptyDesc:
      "Add movies, TV shows, and cartoons with «Add to Favorites» button from catalog or search.",
    historyEmptyTitle: "History is empty",
    historyEmptyDesc:
      "Movies and episodes you watched online or offline will appear here.",
    libraryEmptyTitle: "No active or downloaded files",
    libraryEmptyDesc:
      "Download queue and saved files on disk will appear here.",
    rescanLibraryBtn: "Find Downloaded Files",
    rescanningLibraryBtn: "Scanning Files...",
    rescannedSuccess: "Files found:",
    loadingWatchlist: "Loading favorites...",
    loadingHistory: "Loading history...",
    loadingLibrary: "Loading...",
  },
} as const;

export type TranslationKey = keyof typeof translations.ru;

export function t(key: TranslationKey): string {
  const loc = getLocale();
  return translations[loc]?.[key] ?? translations.ru[key] ?? key;
}

export function useI18n() {
  const [locale, setLoc] = useState<Locale>(getLocale());

  useEffect(() => {
    return subscribeLocale((newLoc) => setLoc(newLoc));
  }, []);

  const translate = useCallback(
    (key: TranslationKey): string => {
      return translations[locale]?.[key] ?? translations.ru[key] ?? key;
    },
    [locale]
  );

  return {
    locale,
    t: translate,
    setLocale,
  };
}

let initPromise: Promise<Locale> | null = null;

export function initI18n(): Promise<Locale> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const steamLang = await rpcGetSteamLanguage();
      const isEn =
        typeof steamLang === "string" && steamLang.toLowerCase().startsWith("en");
      const loc: Locale = isEn ? "en" : "ru";
      setLocale(loc);
      return loc;
    } catch {
      return "ru";
    }
  })();
  return initPromise;
}
