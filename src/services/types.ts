export interface StorageDrive {
  id: string;
  name: string;
  path: string;
  total: number;
  used: number;
  free: number;
  is_removable: boolean;
  writable?: boolean;
}

export interface DiskSpaceInfo {
  total: number;
  used: number;
  free: number;
  path: string;
  drives: StorageDrive[];
}

export type TorrentSortMode = "seeds" | "size" | "quality" | "date";

export interface DaemonStatus {
  aria2: boolean;
  torrserver: boolean;
  jacred: boolean;
  webserver: boolean;
}
