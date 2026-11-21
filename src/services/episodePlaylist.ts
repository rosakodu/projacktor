import { rpcPrepareStream } from "../api/client";
import { sortEpisodes } from "../api/utils";
import type { EpisodeItem, PlayerMediaInfo, PlaylistItem } from "../types";

export function buildEpisodePlaylist(
  episodes: EpisodeItem[],
  mediaInfo: PlayerMediaInfo,
  magnet?: string,
): PlaylistItem[] {
  return sortEpisodes(episodes).map((episode) => ({
    filePath: episode.downloaded && episode.path.startsWith("/") ? episode.path : undefined,
    title: `${mediaInfo.title} - ${episode.name}`,
    downloaded: episode.downloaded,
    episodeIndex: episode.index,
    magnet,
    mediaInfo: {
      ...mediaInfo,
      episodeName: episode.name,
      episodeNumber: episode.index,
      duration: undefined,
    },
  }));
}

export async function preparePlaylistEpisode(item: PlaylistItem, forceOnline = false) {
  if (item.filePath && !forceOnline) {
    return { filePath: item.filePath, isOnline: !!item.isOnline, torrentHash: item.torrentHash, mediaInfo: item.mediaInfo };
  }

  const mediaId = item.mediaInfo?.mediaId;
  if (!mediaId || item.episodeIndex === undefined) return null;
  const result = await rpcPrepareStream(
    mediaId, item.episodeIndex, forceOnline || !item.downloaded, item.magnet || "",
  );
  const filePath = result?.stream_url || result?.file_path;
  if (!result?.success || !filePath) return null;

  return {
    filePath,
    isOnline: result.online !== false && !!result.stream_url && !result.stream_url.includes("file="),
    torrentHash: result.torrent_hash,
    mediaInfo: item.mediaInfo && { ...item.mediaInfo, duration: result.duration || undefined },
  };
}
