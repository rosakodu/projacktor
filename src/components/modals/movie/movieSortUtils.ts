import { TorrentItem } from "../../../api";
import { TorrentSortMode } from "./types";

export function sortTorrentsByMode(list: TorrentItem[], sortMode: TorrentSortMode): TorrentItem[] {
  if (!list || list.length === 0) return [];
  const copy = [...list];
  if (sortMode === "newest") {
    return copy.sort((a, b) => {
      const ta = a.pub_date ? new Date(a.pub_date).getTime() : 0;
      const tb = b.pub_date ? new Date(b.pub_date).getTime() : 0;
      const va = isNaN(ta) ? 0 : ta, vb = isNaN(tb) ? 0 : tb;
      if (va !== vb) return vb - va;
      return (b.seeds || 0) - (a.seeds || 0);
    });
  }
  if (sortMode === "oldest") {
    return copy.sort((a, b) => {
      const ta = a.pub_date ? new Date(a.pub_date).getTime() : 0;
      const tb = b.pub_date ? new Date(b.pub_date).getTime() : 0;
      const va = isNaN(ta) ? 0 : ta, vb = isNaN(tb) ? 0 : tb;
      if (va > 0 && vb > 0 && va !== vb) return va - vb;
      if (va > 0) return -1;
      if (vb > 0) return 1;
      return (b.seeds || 0) - (a.seeds || 0);
    });
  }
  return copy.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
}
