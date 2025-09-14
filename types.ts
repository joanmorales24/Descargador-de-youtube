
export interface VideoFormat {
  format_id: string;
  format_note?: string;
  ext: string;
  resolution?: string;
  acodec?: string;
  vcodec?: string;
  url: string;
  filesize?: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnailUrl: string;
  author: string;
  duration: string;
  formats: VideoFormat[];
}

export type RecentStatus = 'ok' | 'error' | 'cancel';

export interface RecentItem {
  id: string; // unique id for list ops
  name: string; // filename suggested
  size: number; // bytes downloaded (may be 0 if unknown)
  type: string; // mime type
  status: RecentStatus;
  href?: string; // relative API path to re-download (e.g., /api/download?...)
  createdAt?: number; // epoch ms
}
