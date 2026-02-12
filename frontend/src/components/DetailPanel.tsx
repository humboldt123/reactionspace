import { useState, useRef, useEffect } from 'react';
import { FaVolumeUp, FaVolumeMute, FaDownload, FaTrash, FaExchangeAlt, FaCrop } from 'react-icons/fa';
import type { MediaItem } from '../types';
import { api } from '../api/client';
import type { VideoAnalysis } from '../api/client';

interface DetailPanelProps {
  item: MediaItem | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<MediaItem>) => void;
  onDelete: (id: string) => void;
}

export function DetailPanel({ item, onClose, onUpdate, onDelete }: DetailPanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingKeywords, setIsEditingKeywords] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedKeywords, setEditedKeywords] = useState('');
  const [isHoveringMedia, setIsHoveringMedia] = useState(false);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysis | null>(null);
  const [showCropPreview, setShowCropPreview] = useState(false);
  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);
  const [editedCaption, setEditedCaption] = useState('');
  const [dragging, setDragging] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
  const cropImageRef = useRef<HTMLDivElement>(null);
  const [showConvertButton, setShowConvertButton] = useState(() => {
    return localStorage.getItem('showConvertToGif') !== 'false';
  });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const keywordsInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (item) {
      setEditedName(item.name || '');
      setEditedDescription(item.description || '');
      setEditedKeywords(item.keywords || '');
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
    if (isEditingDescription && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
      descriptionInputRef.current.select();
    }
  }, [isEditingDescription]);

  useEffect(() => {
    if (isEditingKeywords && keywordsInputRef.current) {
      keywordsInputRef.current.focus();
      keywordsInputRef.current.select();
    }
  }, [isEditingKeywords]);

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
      if (e.key === 'Escape' && !isEditingName && !isEditingDescription && !isEditingKeywords && !showDownloadDialog && !showDeleteConfirm && !showCropPreview) {
        onClose();
      }
    };

    if (item) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [item, onClose, isEditingName, isEditingDescription, isEditingKeywords, showDownloadDialog, showDeleteConfirm, showCropPreview]);

  if (!item) return null;

  const handleNameSave = () => {
    if (editedName !== item.name) {
      onUpdate(item.id, { name: editedName });
    }
    setIsEditingName(false);
  };

  const handleDescriptionSave = () => {
    if (editedDescription !== item.description) {
      onUpdate(item.id, { description: editedDescription });
    }
    setIsEditingDescription(false);
  };

  const handleKeywordsSave = () => {
    if (editedKeywords !== item.keywords) {
      onUpdate(item.id, { keywords: editedKeywords });
    }
    setIsEditingKeywords(false);
  };

  const handleDownload = async () => {
    const ext = item.fileType === 'video' ? 'mp4' : item.filePath.split('.').pop();
    const filename = `${downloadFilename}.${ext}`;
    const mimeType = item.fileType === 'video' ? 'video/mp4' : `image/${ext}`;

    try {
      const response = await fetch(item.filePath);
      const blob = await response.blob();

      // On iOS, use Web Share API so user can "Save to Photos"
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS && navigator.share && navigator.canShare) {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setShowDownloadDialog(false);
            return;
          } catch (e) {
            // User cancelled share or share failed, fall through to download
            if ((e as Error).name === 'AbortError') {
              setShowDownloadDialog(false);
              return;
            }
          }
        }
      }

      // Fallback: standard download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Detail Panel */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
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
          animation: 'slideInFromLeft 0.3s ease-out',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
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

          {/* Unmute button for videos (bottom-left) */}
          {item.fileType === 'video' && isHoveringMedia && (
            <button
              onClick={() => setIsMuted(!isMuted)}
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                width: 28,
                height: 28,
                padding: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              {isMuted ? <FaVolumeMute size={14} /> : <FaVolumeUp size={14} />}
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
                width: 28,
                height: 28,
                padding: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
              }}
            >
              <FaDownload size={12} />
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

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
              Description
            </div>
            {isEditingDescription ? (
              <textarea
                ref={descriptionInputRef}
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                onBlur={handleDescriptionSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleDescriptionSave();
                  }
                  if (e.key === 'Escape') {
                    setIsEditingDescription(false);
                  }
                }}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                }}
              />
            ) : (
              <div
                onClick={() => setIsEditingDescription(true)}
                style={{
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  minHeight: '24px',
                  color: item.description ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.description || 'Click to add description...'}
              </div>
            )}
          </div>

          {/* Keywords */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginBottom: 4 }}>
              Keywords
            </div>
            {isEditingKeywords ? (
              <input
                ref={keywordsInputRef}
                type="text"
                value={editedKeywords}
                onChange={(e) => setEditedKeywords(e.target.value)}
                onBlur={handleKeywordsSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleKeywordsSave();
                  if (e.key === 'Escape') setIsEditingKeywords(false);
                }}
                style={{ width: '100%' }}
                placeholder="keyword1 keyword2 keyword3"
              />
            ) : (
              <div
                onClick={() => setIsEditingKeywords(true)}
                style={{
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                  minHeight: '24px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.keywords ? (
                  item.keywords.split(/\s+/).filter(k => k.trim()).map((keyword, idx) => (
                    <span
                      key={idx}
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--text-primary)',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: '0.85em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {keyword}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>Click to add keywords...</span>
                )}
              </div>
            )}
          </div>

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
            <div>
              size: {item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'Unknown'}
              {fileExtension === 'gif' && item.previewVideoPath && ' (includes preview)'}
            </div>
            <div>position: ({Math.round(item.x)}, {Math.round(item.y)})</div>
            <div>created: {new Date(item.createdAt).toLocaleDateString()}</div>
          </div>

          {/* Crop button (always visible for videos) */}
          {item.fileType === 'video' && (
            <button
              onClick={async () => {
                setIsAnalyzing(true);
                try {
                  const analysis = await api.analyzeVideo(item.id);
                  setAnalysisResult(analysis);
                  setCropTop(analysis.crop_top);
                  setCropBottom(analysis.crop_bottom);
                  setCropLeft(0);
                  setCropRight(0);
                  setEditedCaption(analysis.extracted_caption || '');
                  setShowCropPreview(true);
                } catch (err) {
                  console.error('Analysis failed:', err);
                  alert('Could not analyze video: ' + (err instanceof Error ? err.message : 'Unknown error'));
                } finally {
                  setIsAnalyzing(false);
                }
              }}
              disabled={isAnalyzing || isCropping}
              style={{
                marginTop: '16px',
                width: '100%',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: (isAnalyzing || isCropping) ? 0.6 : 1,
                cursor: (isAnalyzing || isCropping) ? 'wait' : 'pointer',
              }}
            >
              <FaCrop size={14} />
              {isAnalyzing ? 'Analyzing...' : isCropping ? 'Cropping...' : 'Crop Video'}
            </button>
          )}

          {/* Convert to GIF button (toggleable for videos) */}
          {item.fileType === 'video' && showConvertButton && (
            <button
              onClick={async () => {
                setIsConverting(true);
                try {
                  const updatedItem = await api.convertToGif(item.id);
                  onUpdate(item.id, updatedItem);
                  onClose();
                } catch (err) {
                  console.error('Convert to GIF failed:', err);
                  alert('Failed to convert: ' + (err instanceof Error ? err.message : 'Unknown error'));
                } finally {
                  setIsConverting(false);
                }
              }}
              disabled={isConverting}
              style={{
                marginTop: '8px',
                width: '100%',
                backgroundColor: 'var(--accent)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isConverting ? 0.6 : 1,
                cursor: isConverting ? 'wait' : 'pointer',
              }}
            >
              <FaExchangeAlt size={14} />
              {isConverting ? 'Converting...' : 'Convert to GIF'}
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              marginTop: '8px',
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

          {/* Toggle convert button visibility */}
          {item.fileType === 'video' && (
            <div
              onClick={() => {
                const newValue = !showConvertButton;
                setShowConvertButton(newValue);
                localStorage.setItem('showConvertToGif', String(newValue));
              }}
              style={{
                marginTop: '8px',
                fontSize: '0.75em',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'center',
                opacity: 0.6,
              }}
            >
              {showConvertButton ? 'Hide' : 'Show'} Convert to GIF button
            </div>
          )}
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
            animation: 'scaleIn 0.2s ease-out',
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
            animation: 'scaleIn 0.2s ease-out',
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

      {/* Crop preview modal */}
      {showCropPreview && analysisResult && (() => {
        const imgH = analysisResult.original_height;
        const imgW = analysisResult.original_width;
        const scale = cropImageRef.current ? cropImageRef.current.clientHeight / imgH : 1;
        const topPx = cropTop * scale;
        const bottomPx = cropBottom * scale;
        const leftPx = cropLeft * scale;
        const rightPx = cropRight * scale;

        const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
          if (!dragging || !cropImageRef.current) return;
          const rect = cropImageRef.current.getBoundingClientRect();
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const relY = clientY - rect.top;
          const relX = clientX - rect.left;
          const containerH = rect.height;
          const containerW = rect.width;
          const currentScale = containerH / imgH;

          if (dragging === 'top') {
            const px = Math.round(Math.max(0, Math.min(relY / currentScale, imgH - cropBottom - 20)));
            setCropTop(px);
          } else if (dragging === 'bottom') {
            const fromBottom = containerH - relY;
            const px = Math.round(Math.max(0, Math.min(fromBottom / currentScale, imgH - cropTop - 20)));
            setCropBottom(px);
          } else if (dragging === 'left') {
            const px = Math.round(Math.max(0, Math.min(relX / currentScale, imgW - cropRight - 20)));
            setCropLeft(px);
          } else if (dragging === 'right') {
            const fromRight = containerW - relX;
            const px = Math.round(Math.max(0, Math.min(fromRight / currentScale, imgW - cropLeft - 20)));
            setCropRight(px);
          }
        };

        const stopDrag = () => setDragging(null);

        return (
          <div
            onMouseMove={dragging ? handleDrag : undefined}
            onMouseUp={dragging ? stopDrag : undefined}
            onMouseLeave={dragging ? stopDrag : undefined}
            onTouchMove={dragging ? handleDrag : undefined}
            onTouchEnd={dragging ? stopDrag : undefined}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '450px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '20px',
              zIndex: 202,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              animation: 'scaleIn 0.2s ease-out',
              maxHeight: '80vh',
              overflowY: 'auto',
              userSelect: dragging ? 'none' : undefined,
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.1em' }}>Crop Video</h3>

            {/* Visual crop area */}
            <div
              ref={cropImageRef}
              style={{
                position: 'relative',
                width: '100%',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: '12px',
                cursor: dragging ? (dragging === 'left' || dragging === 'right' ? 'ew-resize' : 'ns-resize') : undefined,
              }}
            >
              <img
                src={`data:image/jpeg;base64,${analysisResult.preview_image}`}
                alt="Crop preview"
                draggable={false}
                style={{ width: '100%', display: 'block' }}
              />

              {/* Top crop overlay */}
              {topPx > 0 && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: topPx,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Bottom crop overlay */}
              {bottomPx > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: bottomPx,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Top handle */}
              <div
                onMouseDown={(e) => { e.preventDefault(); setDragging('top'); }}
                onTouchStart={() => setDragging('top')}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: topPx - 4,
                  height: 8,
                  cursor: 'ns-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <div style={{
                  width: '100%', height: 2,
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 4px rgba(59,130,246,0.5)',
                }} />
                <div style={{
                  position: 'absolute',
                  width: 32, height: 14,
                  backgroundColor: '#3b82f6',
                  borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 12, height: 2, backgroundColor: 'white', borderRadius: 1 }} />
                </div>
              </div>

              {/* Bottom handle */}
              <div
                onMouseDown={(e) => { e.preventDefault(); setDragging('bottom'); }}
                onTouchStart={() => setDragging('bottom')}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  bottom: bottomPx - 4,
                  height: 8,
                  cursor: 'ns-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <div style={{
                  width: '100%', height: 2,
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 4px rgba(59,130,246,0.5)',
                }} />
                <div style={{
                  position: 'absolute',
                  width: 32, height: 14,
                  backgroundColor: '#3b82f6',
                  borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 12, height: 2, backgroundColor: 'white', borderRadius: 1 }} />
                </div>
              </div>

              {/* Left crop overlay */}
              {leftPx > 0 && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0,
                  width: leftPx,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Right crop overlay */}
              {rightPx > 0 && (
                <div style={{
                  position: 'absolute', top: 0, right: 0, bottom: 0,
                  width: rightPx,
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  pointerEvents: 'none',
                }} />
              )}

              {/* Left handle */}
              <div
                onMouseDown={(e) => { e.preventDefault(); setDragging('left'); }}
                onTouchStart={() => setDragging('left')}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: leftPx - 4,
                  width: 8,
                  cursor: 'ew-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <div style={{
                  height: '100%', width: 2,
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 4px rgba(59,130,246,0.5)',
                }} />
                <div style={{
                  position: 'absolute',
                  height: 32, width: 14,
                  backgroundColor: '#3b82f6',
                  borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ height: 12, width: 2, backgroundColor: 'white', borderRadius: 1 }} />
                </div>
              </div>

              {/* Right handle */}
              <div
                onMouseDown={(e) => { e.preventDefault(); setDragging('right'); }}
                onTouchStart={() => setDragging('right')}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  right: rightPx - 4,
                  width: 8,
                  cursor: 'ew-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <div style={{
                  height: '100%', width: 2,
                  backgroundColor: '#3b82f6',
                  boxShadow: '0 0 4px rgba(59,130,246,0.5)',
                }} />
                <div style={{
                  position: 'absolute',
                  height: 32, width: 14,
                  backgroundColor: '#3b82f6',
                  borderRadius: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ height: 12, width: 2, backgroundColor: 'white', borderRadius: 1 }} />
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0
                ? `Crop: ${[cropTop > 0 ? `${cropTop}px top` : '', cropBottom > 0 ? `${cropBottom}px bottom` : '', cropLeft > 0 ? `${cropLeft}px left` : '', cropRight > 0 ? `${cropRight}px right` : ''].filter(Boolean).join(', ')} (${analysisResult.original_width - cropLeft - cropRight}x${analysisResult.original_height - cropTop - cropBottom})`
                : `Drag the blue handles to crop (${analysisResult.original_width}x${analysisResult.original_height})`
              }
            </div>

            {/* Extracted caption */}
            {analysisResult.extracted_caption && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  fontSize: '0.85em',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  marginBottom: 4,
                }}>
                  Extracted caption
                </label>
                <textarea
                  value={editedCaption}
                  onChange={(e) => setEditedCaption(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: '1.5',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => {
                setShowCropPreview(false);
                setAnalysisResult(null);
                setDragging(null);
              }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const hasCrop = cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0;
                  if (!hasCrop) {
                    setShowCropPreview(false);
                    setAnalysisResult(null);
                    return;
                  }
                  setShowCropPreview(false);
                  setIsCropping(true);
                  try {
                    const updatedItem = await api.cropVideo(item.id, {
                      crop_top: cropTop,
                      crop_bottom: cropBottom,
                      crop_left: cropLeft,
                      crop_right: cropRight,
                      caption: editedCaption || undefined,
                    });
                    onUpdate(item.id, updatedItem);
                    onClose();
                  } catch (err) {
                    console.error('Crop failed:', err);
                    alert('Failed to crop video: ' + (err instanceof Error ? err.message : 'Unknown error'));
                  } finally {
                    setIsCropping(false);
                  }
                }}
                disabled={cropTop <= 0 && cropBottom <= 0 && cropLeft <= 0 && cropRight <= 0}
                style={{
                  backgroundColor: (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: 'white',
                  opacity: (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) ? 1 : 0.5,
                }}
              >
                Crop
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}
