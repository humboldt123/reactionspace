import { useState, useCallback } from 'react';
import type { CanvasState } from '../types';

const INITIAL_STATE: CanvasState = {
  x: 0,
  y: 0,
  scale: 1,
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;
const SCALE_BY = 1.1;

export function useCanvasState() {
  const [canvasState, setCanvasState] = useState<CanvasState>(INITIAL_STATE);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    const stage = e.currentTarget as HTMLDivElement;
    const rect = stage.getBoundingClientRect();

    // Get mouse position relative to the stage
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setCanvasState((prev) => {
      // Calculate new scale
      const oldScale = prev.scale;
      const direction = e.deltaY > 0 ? -1 : 1;
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY)
      );

      // Calculate new position to zoom towards mouse
      const mousePointTo = {
        x: (mouseX - prev.x) / oldScale,
        y: (mouseY - prev.y) / oldScale,
      };

      const newPos = {
        x: mouseX - mousePointTo.x * newScale,
        y: mouseY - mousePointTo.y * newScale,
      };

      return {
        scale: newScale,
        x: newPos.x,
        y: newPos.y,
      };
    });
  }, []);

  const handleDragEnd = useCallback((x: number, y: number) => {
    setCanvasState((prev) => ({ ...prev, x, y }));
  }, []);

  const panTo = useCallback((x: number, y: number, scale?: number) => {
    setCanvasState({
      x,
      y,
      scale: scale ?? canvasState.scale,
    });
  }, [canvasState.scale]);

  return {
    canvasState,
    handleWheel,
    handleDragEnd,
    panTo,
  };
}
