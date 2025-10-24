import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { MediaItem } from './MediaItem';
import type { MediaItem as MediaItemType, ViewportBounds } from '../types';
import { useCanvasState } from '../hooks/useCanvasState';
import { SpatialIndex } from '../utils/spatial';
import { api } from '../api/client';

interface InfiniteCanvasProps {
  items: MediaItemType[];
  onItemDragEnd: (id: string, x: number, y: number) => void;
  onItemClick?: (id: string) => void;
  deletingItemId: string | null;
  onDeleteAnimationComplete: (id: string) => void;
}

export function InfiniteCanvas({ items, onItemDragEnd, onItemClick, deletingItemId, onDeleteAnimationComplete }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const { canvasState, handleWheel, handleDragEnd, panTo } = useCanvasState();
  const [isInitialized, setIsInitialized] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ used_bytes: number; limit_bytes: number; item_count: number } | null>(null);

  // Center the canvas on initial load
  useEffect(() => {
    if (containerRef.current && !isInitialized) {
      const centerX = containerRef.current.clientWidth / 2;
      const centerY = containerRef.current.clientHeight / 2;
      panTo(centerX, centerY);
      setIsInitialized(true);
    }
  }, [panTo, isInitialized]);

  // Fetch storage info when items change
  useEffect(() => {
    api.getStorage().then(setStorageInfo).catch(err => {
      console.error('Failed to fetch storage info:', err);
    });
  }, [items]);

  // Build spatial index synchronously when items change
  const spatialIndex = useMemo(() => {
    const index = new SpatialIndex();
    index.rebuild(items);
    return index;
  }, [items]);

  // Calculate visible items based on viewport bounds
  const visibleItems = useMemo(() => {
    if (!containerRef.current) return items;

    const bounds: ViewportBounds = {
      minX: -canvasState.x / canvasState.scale,
      minY: -canvasState.y / canvasState.scale,
      maxX: (-canvasState.x + containerRef.current.clientWidth) / canvasState.scale,
      maxY: (-canvasState.y + containerRef.current.clientHeight) / canvasState.scale,
    };

    // Add some padding to the viewport for smooth experience
    const padding = 500;
    bounds.minX -= padding;
    bounds.minY -= padding;
    bounds.maxX += padding;
    bounds.maxY += padding;

    return spatialIndex.search(bounds);
  }, [canvasState, items, spatialIndex]);

  // Set up wheel event listener for zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => handleWheel(e);
    container.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  const handleStageDragEnd = useCallback((e: any) => {
    handleDragEnd(e.target.x(), e.target.y());
  }, [handleDragEnd]);

  // calculate grid properties based on zoom
  const gridScale = Math.pow(canvasState.scale, 0.3); // scale slowly (cube root!)
  const gridSize = 40 * gridScale;
  const gridOpacity = Math.max(0.1, 1 - (canvasState.scale - 1) * 0.5); // and fade as zoom increases

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        cursor: 'grab',
        position: 'relative',
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: `
          linear-gradient(90deg, rgba(42, 42, 42, ${gridOpacity}) 1px, transparent 1px),
          linear-gradient(rgba(42, 42, 42, ${gridOpacity}) 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: 'center center',
      }}
    >
      <Stage
        ref={stageRef}
        width={containerRef.current?.clientWidth || window.innerWidth}
        height={containerRef.current?.clientHeight || window.innerHeight}
        draggable
        x={canvasState.x}
        y={canvasState.y}
        scaleX={canvasState.scale}
        scaleY={canvasState.scale}
        onDragEnd={handleStageDragEnd}
      >
        <Layer ref={layerRef}>
          {visibleItems.map((item) => (
            <MediaItem
              key={item.id}
              item={item}
              onDragEnd={onItemDragEnd}
              onClick={onItemClick}
              isDeleting={deletingItemId === item.id}
              onDeleteAnimationComplete={onDeleteAnimationComplete}
            />
          ))}
        </Layer>
      </Stage>

      {/* Canvas info overlay */}
      {storageInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            padding: '8px 12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: '0.85em',
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
            fontFamily: 'Palatino',
          }}
        >
          {(() => {
            const usedMB = storageInfo.used_bytes / (1024 * 1024);
            const limitMB = storageInfo.limit_bytes / (1024 * 1024);

            // format used storage and limit!
            const usedDisplay = usedMB >= 1024 ? `${(usedMB / 1024).toFixed(1)} GB` : `${Math.round(usedMB)} MB`;
            const limitDisplay = limitMB >= 1024 ? `${(limitMB / 1024).toFixed(1)} GB` : `${Math.round(limitMB)} MB`;

            return `${storageInfo.item_count} items (${usedDisplay} / ${limitDisplay})`;
          })()}
        </div>
      )}
    </div>
  );
}
