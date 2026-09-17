export interface AudioTrack {
  index: number;
  codec: string;
  channels: number;
  lang: string;
  title: string;
}

export interface SubtitleTrack {
  index: number | string;
  codec: string;
  lang: string;
  title: string;
  url?: string;
  supported?: boolean;
}
