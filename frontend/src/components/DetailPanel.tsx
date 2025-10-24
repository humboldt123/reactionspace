import { useState, useRef, useEffect } from 'react';
import { FaVolumeUp, FaVolumeMute, FaDownload, FaTrash } from 'react-icons/fa';
import type { MediaItem } from '../types';

interface DetailPanelProps {
  item: MediaItem | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<MediaItem>) => void;
  onDelete: (id: string) => void;
}

export function DetailPanel({ item, onClose, onUpdate, onDelete }: DetailPanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedCaption, setEditedCaption] = useState('');
  const [isHoveringMedia, setIsHoveringMedia] = useState(false);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (item) {
      setEditedName(item.name || '');
      setEditedCaption(item.caption || '');
      setDownloadFilename(item.name || 'reaction');
      setIsMuted(true); // Reset to muted when opening new item
    }
  }, [item]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (isEditingCaption && captionInputRef.current) {
      captionInputRef.current.focus();
      captionInputRef.current.select();
    }
  }, [isEditingCaption]);

  // Play video when panel opens
  useEffect(() => {
    if (item?.fileType === 'video' && videoRef.current) {
      videoRef.current.play().catch(err => console.log('Video play failed:', err));
    }
  }, [item]);

  // Update video muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditingName && !isEditingCaption && !showDownloadDialog && !showDeleteConfirm) {
        onClose();
      }
    };

    if (item) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [item, onClose, isEditingName, isEditingCaption, showDownloadDialog, showDeleteConfirm]);

  if (!item) return null;

  const handleNameSave = () => {
    if (editedName !== item.name) {
      onUpdate(item.id, { name: editedName });
    }
    setIsEditingName(false);
  };

  const handleCaptionSave = () => {
    if (editedCaption !== item.caption) {
      onUpdate(item.id, { caption: editedCaption });
    }
    setIsEditingCaption(false);
  };

  const handleDownload = async () => {
    const ext = item.fileType === 'video' ? 'mp4' : item.filePath.split('.').pop();
    const filename = `${downloadFilename}.${ext}`;

    try {
      // Fetch file as blob to bypass CORS restrictions
      const response = await fetch(item.filePath);
      const blob = await response.blob();

      // Create object URL and trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }

    setShowDownloadDialog(false);
  };

  const handleDelete = () => {
    onDelete(item.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const fileExtension = item.filePath.split('.').pop()?.toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 200,
        }}
      />

      {/* Detail Panel */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          width: '350px',
          maxHeight: 'calc(100vh - 40px)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          zIndex: 201,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'var(--text-primary)',
            borderRadius: 4,
            cursor: 'pointer',
            zIndex: 10,
            fontSize: '14px',
            lineHeight: '24px',
          }}
        >
          ×
        </button>

        {/* Media preview */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '280px',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
          onMouseEnter={() => setIsHoveringMedia(true)}
          onMouseLeave={() => setIsHoveringMedia(false)}
        >
          {item.fileType === 'image' ? (
            <img
              src={item.filePath}
              alt={item.name}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <video
              ref={videoRef}
              src={item.filePath}
              loop
              muted={isMuted}
              playsInline
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          )}

          {/* Unmute button for videos (top-left) */}
          {item.fileType === 'video' && isHoveringMedia && (
            <button
              onClick={() => setIsMuted(!isMuted)}
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                width: 32,
                height: 32,
                padding: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isMuted ? <FaVolumeMute size={16} /> : <FaVolumeUp size={16} />}
            </button>
          )}

          {/* Download button on hover (bottom-right) */}
          {isHoveringMedia && (
            <button
              onClick={() => setShowDownloadDialog(true)}
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                width: 32,
                height: 32,
                padding: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaDownload size={16} />
            </button>
          )}
        </div>

        {/* Info section */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {/* Name/Title */}
          <div style={{ marginBottom: '16px' }}>
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                style={{
                  width: '100%',
                  fontSize: '1.2em',
                  fontWeight: 500,
                }}
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                style={{
                  fontSize: '1.2em',
                  fontWeight: 500,
                  cursor: 'pointer',
                  margin: 0,
                  padding: '4px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.name || 'Untitled'}
              </h2>
            )}
          </div>

          {/* Caption */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
              Caption
            </div>
            {isEditingCaption ? (
              <input
                ref={captionInputRef}
                type="text"
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                onBlur={handleCaptionSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCaptionSave();
                  if (e.key === 'Escape') setIsEditingCaption(false);
                }}
                style={{ width: '100%' }}
              />
            ) : (
              <div
                onClick={() => setIsEditingCaption(true)}
                style={{
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  minHeight: '24px',
                  color: item.caption ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.caption || 'Click to add caption...'}
              </div>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
                Description
              </div>
              <div>{item.description}</div>
            </div>
          )}

          {/* Technical details */}
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 4,
              fontSize: '0.75em',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
            }}
          >
            <div>type: {fileExtension}</div>
            <div>size: {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'Unknown'}</div>
            <div>position: ({Math.round(item.x)}, {Math.round(item.y)})</div>
            <div>created: {new Date(item.createdAt).toLocaleDateString()}</div>
          </div>

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              marginTop: '16px',
              width: '100%',
              backgroundColor: '#ef4444',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaTrash size={14} />
            Delete Reaction
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '400px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '20px',
            zIndex: 202,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '1.1em' }}>Delete Reaction?</h3>
          <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
            Are you sure you want to delete "{item.name || 'this reaction'}"? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button
              onClick={handleDelete}
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Download dialog */}
      {showDownloadDialog && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '400px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '20px',
            zIndex: 202,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '1.1em' }}>Download File</h3>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.85em', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Filename
            </label>
            <input
              type="text"
              value={downloadFilename}
              onChange={(e) => setDownloadFilename(e.target.value)}
              style={{ width: '100%' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDownload();
              }}
            />
            <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginTop: 4 }}>
              Will be saved as: {downloadFilename}.{item.fileType === 'video' ? 'mp4' : item.filePath.split('.').pop()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDownloadDialog(false)}>Cancel</button>
            <button onClick={handleDownload} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              Download
            </button>
          </div>
        </div>
      )}
    </>
  );
}
