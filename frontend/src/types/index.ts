// Core types for ReactionSpace
export type MediaItem = {
  id: string;
  name?: string;
  description?: string;
  caption?: string; // Searchable tags/description of what's in the media
  filePath: string;
  thumbnailPath: string;
  previewVideoPath?: string; // MP4 preview for GIFs (for board view)
  fileType: 'image' | 'video';
  fileSize?: number; // Size in bytes (optional for existing items)
  x: number;
  y: number;
  width: number;
  height: number;
  positionLocked: boolean;
  manualClusterId?: string;
  createdAt: Date;
}

export type CanvasState = {
  x: number;
  y: number;
  scale: number;
}

export type ViewportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type SearchResult = {
  item: MediaItem;
  score: number;
}
