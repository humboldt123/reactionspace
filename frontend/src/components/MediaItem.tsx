import { useState, useRef, useEffect } from 'react';
import { Image, Group, Rect, Text } from 'react-konva';
import type { MediaItem as MediaItemType } from '../types';
import Konva from 'konva';

interface MediaItemProps {
  item: MediaItemType;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick?: (id: string, e?: MouseEvent) => void;
  isDeleting?: boolean;
  onDeleteAnimationComplete?: (id: string) => void;
  isSelected?: boolean;
  isDragFollowing?: boolean;
  visualOffset?: { x: number; y: number };
}

export function MediaItem({ item, onDragStart, onDragMove, onDragEnd, onClick, isDeleting, onDeleteAnimationComplete, isSelected, isDragFollowing, visualOffset = { x: 0, y: 0 } }: MediaItemProps) {
  const [image, setImage] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const animationRef = useRef<number | undefined>();

  // Set offset to center on mount so all scaling happens from center
  useEffect(() => {
    if (groupRef.current) {
      const centerX = item.width / 2;
      const centerY = item.height / 2;
      groupRef.current.offsetX(centerX);
      groupRef.current.offsetY(centerY);
    }
  }, [item.width, item.height]);

  useEffect(() => {
    setIsLoading(true);

    // Use preview video for GIFs if available, otherwise check if it's a real video
    const shouldUseVideo = item.fileType === 'video' || item.previewVideoPath;

    if (!shouldUseVideo) {
      // Static images - load as HTMLImageElement
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = item.filePath;
      img.onload = () => {
        setImage(img);
        setIsLoading(false);
        groupRef.current?.getLayer()?.batchDraw();
      };
      img.onerror = () => {
        setIsLoading(false);
      };

      return () => {
        img.onload = null;
        img.onerror = null;
      };
    } else {
      // For videos and GIF previews, create a video element
      const video = document.createElement('video');
      // Use preview video path for GIFs, otherwise use original file path
      video.src = item.previewVideoPath || item.filePath;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;

      // For real videos (not GIF previews), play only the first second
      const isRealVideo = item.fileType === 'video';
      if (isRealVideo) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = 0;
        });

        video.addEventListener('timeupdate', () => {
          // Loop back to start after 1 second
          if (video.currentTime >= 1) {
            video.currentTime = 0;
          }
        });
      }

      video.addEventListener('canplay', () => {
        video.play().catch(err => console.log('Video play failed:', err));
        setImage(video as any);
        setIsLoading(false);
        groupRef.current?.getLayer()?.batchDraw();
      });

      video.addEventListener('error', () => {
        setIsLoading(false);
      });

      video.load();

      return () => {
        video.pause();
        video.src = '';
      };
    }
  }, [item.filePath, item.previewVideoPath, item.fileType, item.width, item.height]);

  // Animate video frames (includes GIF previews which are loaded as videos)
  useEffect(() => {
    if (image && image instanceof HTMLVideoElement) {
      const layer = groupRef.current?.getLayer();

      const animate = () => {
        layer?.batchDraw();
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current !== undefined) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [image]);

  // Deletion animation effect
  useEffect(() => {
    if (isDeleting && groupRef.current && onDeleteAnimationComplete) {
      const group = groupRef.current;

      // Animate scale from 1 to 0 with snappy easing
      const tween = new Konva.Tween({
        node: group,
        duration: 0.3, // Faster than before
        scaleX: 0,
        scaleY: 0,
        opacity: 0,
        easing: Konva.Easings.BackEaseIn, // Snappy shrink-in effect
        onFinish: () => {
          onDeleteAnimationComplete(item.id);
        },
      });

      tween.play();

      return () => {
        tween.destroy();
      };
    }
  }, [isDeleting, item.id, onDeleteAnimationComplete]);

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    setIsDragging(true);
    setIsHovered(false); // Clear hover state when starting drag

    // Notify parent that drag started
    if (onDragStart) {
      onDragStart(item.id);
    }

    // Set grabbing cursor during drag
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'grabbing';
    }
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Get the group's position during drag
    const group = e.target;

    // The group's x() and y() now include the center offset we added
    // Subtract the offset to get the top-left corner position
    const centerX = item.width / 2;
    const centerY = item.height / 2;
    const newX = group.x() - centerX;
    const newY = group.y() - centerY;

    // Notify parent of new position during drag
    if (onDragMove) {
      onDragMove(item.id, newX, newY);
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; // Prevent event from bubbling to Stage

    // Get the group's position after drag
    const group = e.target;

    // The group's x() and y() now include the center offset we added
    // Subtract the offset to get the top-left corner position for storage
    const centerX = item.width / 2;
    const centerY = item.height / 2;
    const newX = group.x() - centerX;
    const newY = group.y() - centerY;

    // Reset cursor after drag
    const container = e.target.getStage()?.container();
    if (container) {
      container.style.cursor = 'grab';
    }

    // Clear dragging state and report position
    setIsDragging(false);
    onDragEnd(item.id, newX, newY);
  };

  // Calculate position accounting for center offset
  const centerX = item.width / 2;
  const centerY = item.height / 2;

  return (
    <Group
      ref={groupRef}
      x={item.x + centerX + visualOffset.x} // Add offset to compensate for center origin + visual drag offset
      y={item.y + centerY + visualOffset.y} // Add offset to compensate for center origin + visual drag offset
      draggable={!isDeleting && !isDragFollowing} // Disable dragging for following items
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={(e) => {
        if (!isDragging && !isDeleting && onClick) {
          // Pass the native mouse event
          const nativeEvent = e.evt;
          onClick(item.id, nativeEvent);
        }
      }}
      onMouseEnter={(e) => {
        if (!isDragging && !isDeleting) {
          setIsHovered(true);
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = 'pointer';
        }
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'grab';
      }}
    >
      {/* Selection outline */}
      {isSelected && (
        <Rect
          x={-2}
          y={-2}
          width={item.width + 4}
          height={item.height + 4}
          stroke="rgba(94, 129, 244, 1)"
          strokeWidth={2}
          cornerRadius={4}
          listening={false}
        />
      )}

      {/* Subtle shadow on hover (not while dragging) */}
      {isHovered && !isDragging && !isSelected && (
        <Rect
          x={-4}
          y={-4}
          width={item.width + 8}
          height={item.height + 8}
          fill="black"
          opacity={0.3}
          cornerRadius={6}
          blur={8}
        />
      )}

      {/* Loading placeholder */}
      {isLoading && !image && (
        <Rect
          width={item.width}
          height={item.height}
          fill="rgba(255, 255, 255, 0.05)"
          cornerRadius={4}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={1}
        />
      )}

      {/* Image */}
      {image && (
        <Image
          ref={imageRef}
          image={image}
          width={item.width}
          height={item.height}
          cornerRadius={4}
          opacity={isHovered ? 0.6 : 1}
          shadowEnabled={isHovered}
          shadowColor="black"
          shadowBlur={isHovered ? 20 : 0}
          shadowOpacity={isHovered ? 0.5 : 0}
        />
      )}

      {/* Label in corner on hover */}
      {isHovered && item.name && (
        <Text
          text={item.name}
          x={8}
          y={item.height - 12}
          width={item.width - 16} // Add padding on both sides
          fontSize={8}
          fontFamily="monospace"
          fill="#f5f5f5"
          ellipsis={true}
          wrap="none"
        />
      )}
    </Group>
  );
}
