import { useState, useEffect } from 'react';

interface UploadZoneProps {
  onUpload: (files: File[]) => Promise<void>;
  isUploading: boolean;
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Use window-level event listeners for drag and drop
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;

      // Check if we're dragging files (not just text)
      const hasFiles = e.dataTransfer?.types?.includes('Files') ||
                       e.dataTransfer?.types?.includes('application/x-moz-file');

      if (hasFiles) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      // Ensure dropEffect is set to 'copy' for better cross-platform support
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter = 0;

      console.log('Drop event:', {
        types: e.dataTransfer?.types,
        filesLength: e.dataTransfer?.files?.length,
        items: e.dataTransfer?.items?.length,
      });

      // Check if we have files
      if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
        console.log('No files in drop event');
        return;
      }

      // Convert FileList to array and filter
      const files = Array.from(e.dataTransfer.files).filter((file) => {
        console.log('File:', {
          name: file.name,
          type: file.type,
          size: file.size,
        });

        // On Linux, some files might not have a type set
        // Try to accept files without type if they have common image/video extensions
        if (!file.type) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
          const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

          if (ext && (imageExts.includes(ext) || videoExts.includes(ext))) {
            console.log(`Accepting file without type based on extension: ${ext}`);
            return true;
          }

          console.log(`Skipping file without type or recognized extension: ${file.name}`);
          return false;
        }

        return file.type.startsWith('image/') || file.type.startsWith('video/');
      });

      console.log(`Filtered files: ${files.length} out of ${e.dataTransfer.files.length}`);

      if (files.length > 0) {
        await onUpload(files);
      } else {
        console.log('No valid image or video files found');
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onUpload]);

  return (
    <>
      {/* Drop zone overlay - shown when dragging */}
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '60px 80px',
              border: '4px dashed var(--accent)',
              borderRadius: 16,
              fontSize: '2em',
              color: 'var(--text-primary)',
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            Drop images or videos here
          </div>
        </div>
      )}
    </>
  );
}
