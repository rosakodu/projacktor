import { MediaItem, TorrentItem, rpcAddToLibrary, isTvRelease } from "../../../api";

export async function prepareMediaEntry(
  torrent: TorrentItem,
  movie: MediaItem,
  title: string,
  year: string,
  inLibrary: boolean
): Promise<number> {
  const payload = {
    magnet: torrent.magnet,
    tmdb_id: movie.id,
    title,
    year,
    media_type: (movie.media_type === "tv" || isTvRelease(torrent.title)) ? "tv" : (movie.media_type || "movie"),
    quality: torrent.quality || "",
    torrent_title: torrent.title || `${title} (${torrent.quality || ""})`.trim(),
    poster_path: movie.poster_path || "",
    backdrop_path: movie.backdrop_path || "",
    overview: movie.overview || "",
    in_library: inLibrary,
  };
  const res = await rpcAddToLibrary(JSON.stringify(payload));
  if (!res || !res.success || !res.id) {
    throw new Error(res?.error || "Не удалось инициализировать медиа");
  }
  return res.id;
}
