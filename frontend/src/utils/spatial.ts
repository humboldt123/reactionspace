import RBush from 'rbush';
import type { MediaItem, ViewportBounds } from '../types';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  item: MediaItem;
}

export class SpatialIndex {
  private tree: RBush<SpatialItem>;

  constructor() {
    this.tree = new RBush<SpatialItem>();
  }

  insert(item: MediaItem): void {
    const spatialItem: SpatialItem = {
      minX: item.x,
      minY: item.y,
      maxX: item.x + item.width,
      maxY: item.y + item.height,
      item,
    };
    this.tree.insert(spatialItem);
  }

  remove(item: MediaItem): void {
    const spatialItem: SpatialItem = {
      minX: item.x,
      minY: item.y,
      maxX: item.x + item.width,
      maxY: item.y + item.height,
      item,
    };
    this.tree.remove(spatialItem);
  }

  search(bounds: ViewportBounds): MediaItem[] {
    const results = this.tree.search({
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
    });
    return results.map((r) => r.item);
  }

  clear(): void {
    this.tree.clear();
  }

  rebuild(items: MediaItem[]): void {
    this.clear();
    items.forEach((item) => this.insert(item));
  }
}
