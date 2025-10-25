import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { MediaItem } from './MediaItem';
import type { MediaItem as MediaItemType, ViewportBounds } from '../types';
import { useCanvasState } from '../hooks/useCanvasState';
import { SpatialIndex } from '../utils/spatial';
import { api } from '../api/client';
import Konva from 'konva';

interface InfiniteCanvasProps {
  items: MediaItemType[];
  onItemDragEnd: (id: string, x: number, y: number) => void;
  onItemClick?: (id: string) => void;
  deletingItemId: string | null;
  onDeleteAnimationComplete: (id: string) => void;
  onBatchItemDragEnd?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  onBatchDelete?: (itemIds: string[]) => void;
}

interface SelectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function InfiniteCanvas({ items, onItemDragEnd, onItemClick, deletingItemId, onDeleteAnimationComplete, onBatchItemDragEnd, onBatchDelete }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const { canvasState, handleWheel, handleDragEnd, panTo } = useCanvasState();
  const [isInitialized, setIsInitialized] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ used_bytes: number; limit_bytes: number; item_count: number } | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const justFinishedSelectionRef = useRef(false);
  const [preBoxSelectionIds, setPreBoxSelectionIds] = useState<Set<string>>(new Set());

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

  // Handle when an item starts being dragged
  const handleItemDragStart = useCallback((id: string) => {
    setDraggedItemId(id);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  // Handle when an item is being dragged (called during drag)
  const handleItemDragMove = useCallback((id: string, newX: number, newY: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Calculate the offset from original position
    const deltaX = newX - item.x;
    const deltaY = newY - item.y;

    // Update drag offset for other selected items to follow
    setDragOffset({ x: deltaX, y: deltaY });
  }, [items]);

  // Handle dragging of a single item (could be part of a group)
  const handleItemDragEnd = useCallback((id: string, newX: number, newY: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // If this item is part of a selection, move all selected items
    if (selectedItemIds.has(id) && selectedItemIds.size > 1) {
      const deltaX = newX - item.x;
      const deltaY = newY - item.y;

      const updates = Array.from(selectedItemIds).map(selectedId => {
        const selectedItem = items.find(i => i.id === selectedId);
        if (!selectedItem) return null;

        return {
          id: selectedId,
          x: selectedItem.x + deltaX,
          y: selectedItem.y + deltaY,
        };
      }).filter(Boolean) as Array<{ id: string; x: number; y: number }>;

      // Use batch update if available
      if (onBatchItemDragEnd) {
        onBatchItemDragEnd(updates);
      } else {
        // Fallback to individual updates
        updates.forEach(update => {
          onItemDragEnd(update.id, update.x, update.y);
        });
      }
    } else {
      // Single item drag
      onItemDragEnd(id, newX, newY);
    }

    // Clear drag state
    setDraggedItemId(null);
    setDragOffset({ x: 0, y: 0 });
  }, [items, selectedItemIds, onItemDragEnd, onBatchItemDragEnd]);

  // Handle mouse down on stage for selection
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only start selection if clicking on empty canvas (Layer, not an item)
    const clickedOnEmpty = e.target === layerRef.current || e.target === stageRef.current;

    if (!clickedOnEmpty) {
      return;
    }

    // Only start selection if holding Cmd (Mac) or Ctrl (other platforms)
    const isModifierPressed = e.evt.metaKey || e.evt.ctrlKey;
    if (!isModifierPressed) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) return;

    // Get pointer position in canvas coordinates
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Convert screen coordinates to canvas coordinates
    const x = (pos.x - canvasState.x) / canvasState.scale;
    const y = (pos.y - canvasState.y) / canvasState.scale;

    // Save the current selection before starting box selection
    setPreBoxSelectionIds(new Set(selectedItemIds));

    setIsSelecting(true);
    setSelectionBox({ x1: x, y1: y, x2: x, y2: y });

    // Disable stage dragging while selecting
    stage.draggable(false);
  }, [canvasState.x, canvasState.y, canvasState.scale, selectedItemIds]);

  // Handle mouse move for selection
  const handleStageMouseMove = useCallback(() => {
    if (!isSelecting || !selectionBox) return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Convert screen coordinates to canvas coordinates
    const x = (pos.x - canvasState.x) / canvasState.scale;
    const y = (pos.y - canvasState.y) / canvasState.scale;

    setSelectionBox(prev => prev ? { ...prev, x2: x, y2: y } : null);

    // Calculate which items are in the selection box
    if (selectionBox) {
      const minX = Math.min(selectionBox.x1, x);
      const maxX = Math.max(selectionBox.x1, x);
      const minY = Math.min(selectionBox.y1, y);
      const maxY = Math.max(selectionBox.y1, y);

      const boxSelected = new Set<string>();
      items.forEach(item => {
        // Check if item intersects with selection box
        const itemMinX = item.x;
        const itemMaxX = item.x + item.width;
        const itemMinY = item.y;
        const itemMaxY = item.y + item.height;

        if (itemMaxX >= minX && itemMinX <= maxX &&
            itemMaxY >= minY && itemMinY <= maxY) {
          boxSelected.add(item.id);
        }
      });

      // Merge the box selection with previously selected items
      const combined = new Set([...preBoxSelectionIds, ...boxSelected]);
      setSelectedItemIds(combined);
    }
  }, [isSelecting, selectionBox, items, canvasState.x, canvasState.y, canvasState.scale, preBoxSelectionIds]);

  // Handle mouse up to finish selection
  const handleStageMouseUp = useCallback(() => {
    if (isSelecting) {
      // Mark that we just finished a selection to prevent the click handler from clearing
      justFinishedSelectionRef.current = true;

      // Clear the flag after a short delay (enough time for click event to fire)
      setTimeout(() => {
        justFinishedSelectionRef.current = false;
      }, 50);

      setIsSelecting(false);
      setSelectionBox(null);
      // Keep selectedItemIds - they stay selected!

      // Re-enable stage dragging
      const stage = stageRef.current;
      if (stage) {
        stage.draggable(true);
      }
    }
  }, [isSelecting]);

  // Handle clicking on items or empty space
  const handleItemClickInternal = useCallback((id: string, e?: MouseEvent) => {
    const isMultiSelect = e && (e.metaKey || e.ctrlKey);

    if (isMultiSelect) {
      // Cmd/Ctrl+click: toggle this item in selection
      setSelectedItemIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    } else {
      // Regular click: just open detail panel, don't select
      if (onItemClick) {
        onItemClick(id);
      }
    }
  }, [onItemClick]);

  // Clear selection when clicking on empty space (not during selection)
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Don't clear selection if we just finished a selection drag
    if (justFinishedSelectionRef.current) {
      return;
    }

    const clickedOnEmpty = e.target === layerRef.current || e.target === stageRef.current;
    if (clickedOnEmpty) {
      setSelectedItemIds(new Set());
    }
  }, []);

  // Handle Delete key to delete selected items
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemIds.size > 0) {
        // Prevent default backspace behavior (going back in browser)
        e.preventDefault();

        const itemIdsToDelete = Array.from(selectedItemIds);

        // Clear selection immediately for better UX
        setSelectedItemIds(new Set());

        // Call parent callback if provided
        if (onBatchDelete) {
          onBatchDelete(itemIdsToDelete);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, onBatchDelete]);

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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
      >
        <Layer ref={layerRef}>
          {visibleItems.map((item) => {
            // Calculate if this item should follow the dragged item
            const isFollowing = selectedItemIds.has(item.id) &&
                               draggedItemId !== null &&
                               draggedItemId !== item.id &&
                               selectedItemIds.has(draggedItemId);

            // Calculate the visual offset for following items
            const visualOffset = isFollowing ? dragOffset : { x: 0, y: 0 };

            return (
              <MediaItem
                key={item.id}
                item={item}
                onDragStart={handleItemDragStart}
                onDragMove={handleItemDragMove}
                onDragEnd={handleItemDragEnd}
                onClick={handleItemClickInternal}
                isDeleting={deletingItemId === item.id}
                onDeleteAnimationComplete={onDeleteAnimationComplete}
                isSelected={selectedItemIds.has(item.id)}
                isDragFollowing={isFollowing}
                visualOffset={visualOffset}
              />
            );
          })}

          {/* Selection rectangle */}
          {selectionBox && (
            <Rect
              x={Math.min(selectionBox.x1, selectionBox.x2)}
              y={Math.min(selectionBox.y1, selectionBox.y2)}
              width={Math.abs(selectionBox.x2 - selectionBox.x1)}
              height={Math.abs(selectionBox.y2 - selectionBox.y1)}
              fill="rgba(94, 129, 244, 0.1)"
              stroke="rgba(94, 129, 244, 0.8)"
              strokeWidth={1 / canvasState.scale}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Canvas info overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {/* Selection count */}
        {selectedItemIds.size > 0 && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(94, 129, 244, 0.9)',
              border: '1px solid rgba(94, 129, 244, 1)',
              borderRadius: 6,
              fontSize: '0.85em',
              color: 'white',
              fontFamily: 'Palatino',
            }}
          >
            {selectedItemIds.size} selected
          </div>
        )}

        {/* Storage info */}
        {storageInfo && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: '0.85em',
              color: 'var(--text-secondary)',
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
    </div>
  );
}
