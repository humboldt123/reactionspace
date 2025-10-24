import { useState, useEffect, useCallback } from 'react';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { SearchModal } from './components/SearchModal';
import { DetailPanel } from './components/DetailPanel';
import { UploadZone } from './components/UploadZone';
import { AuthButton } from './components/AuthButton';
import { MobileView } from './components/MobileView';
import { TwitterLinkBar } from './components/TwitterLinkBar';
import { useIsMobile } from './hooks/useIsMobile';
import type { MediaItem } from './types';
import { api } from './api/client';

interface UploadQueueItem {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  itemName?: string;
}

interface TwitterUploadStatus {
  url: string;
  status: 'downloading' | 'uploading' | 'completed' | 'error';
  error?: string;
  count?: number;
}

function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTwitterLinkBarOpen, setIsTwitterLinkBarOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [twitterUploadStatus, setTwitterUploadStatus] = useState<TwitterUploadStatus | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Load config and items on mount
  useEffect(() => {
    // Fetch config
    api.getConfig().then(config => {
      setIsDemoMode(config.demo_mode);
    }).catch(err => {
      console.error('Failed to load config:', err);
    });

    // Fetch items
    api.getItems().then(setItems).catch(err => {
      console.error('Failed to load items:', err);
    });
  }, []);

  // Handle Cmd+K / Ctrl+K to open search, Enter to open Twitter link bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setIsTwitterLinkBarOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleItemDragEnd = useCallback(async (id: string, x: number, y: number) => {
    // Update local state immediately
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, x, y, positionLocked: true } : item
      )
    );

    // Update via API
    try {
      await api.updateItemPosition(id, x, y);
    } catch (error) {
      console.error('Failed to update item position:', error);
    }
  }, []);

  // Process upload queue
  useEffect(() => {
    const processQueue = async () => {
      const pendingItem = uploadQueue.find(item => item.status === 'pending');
      if (!pendingItem) return;

      // Mark as uploading
      setUploadQueue(prev => prev.map(item =>
        item.file === pendingItem.file
          ? { ...item, status: 'uploading' as const }
          : item
      ));

      try {
        const result = await api.uploadFile(pendingItem.file);

        // Add to items
        setItems(prev => [...prev, result.item]);

        // Mark as completed
        setUploadQueue(prev => prev.map(item =>
          item.file === pendingItem.file
            ? { ...item, status: 'completed' as const, itemName: result.item.name }
            : item
        ));

        // Remove from queue after 2 seconds
        setTimeout(() => {
          setUploadQueue(prev => prev.filter(item => item.file !== pendingItem.file));
        }, 2000);

      } catch (error) {
        console.error('Upload failed:', error);
        setUploadQueue(prev => prev.map(item =>
          item.file === pendingItem.file
            ? { ...item, status: 'error' as const, error: String(error) }
            : item
        ));

        // Remove from queue after 5 seconds
        setTimeout(() => {
          setUploadQueue(prev => prev.filter(item => item.file !== pendingItem.file));
        }, 5000);
      }
    };

    processQueue();
  }, [uploadQueue]);

  const handleUpload = useCallback(async (files: File[]) => {
    // Add all files to the queue
    const newQueueItems: UploadQueueItem[] = files.map(file => ({
      file,
      status: 'pending' as const,
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);
  }, []);

  const handleSelectSearchResult = useCallback((item: MediaItem) => {
    setSelectedItem(item);
  }, []);

  const handleItemClick = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      setSelectedItem(item);
    }
  }, [items]);

  const handleItemUpdate = useCallback(async (id: string, updates: Partial<MediaItem>) => {
    // Update local state immediately
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    );

    // Update selected item if it's the one being edited
    setSelectedItem((prev) =>
      prev?.id === id ? { ...prev, ...updates } : prev
    );

    // Update via API
    try {
      await api.updateItem(id, updates);
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  }, []);

  const handleDeleteAnimationComplete = useCallback(async (id: string) => {
    // Actually remove the item after animation completes
    setItems((prev) => prev.filter((item) => item.id !== id));
    setDeletingItemId(null);

    // Delete via API
    try {
      await api.deleteItem(id);
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  }, []);

  const handleTwitterLinkSubmit = useCallback(async (url: string) => {
    // Close the modal immediately
    setIsTwitterLinkBarOpen(false);

    // Show downloading status
    setTwitterUploadStatus({
      url,
      status: 'downloading',
    });

    try {
      // This happens in the background now
      const result = await api.uploadFromTwitter(url);

      // Update status to completed
      setTwitterUploadStatus({
        url,
        status: 'completed',
        count: 1, // Backend returns first item, but may have uploaded multiple
      });

      // Fetch all items to get all newly uploaded files
      const updatedItems = await api.getItems();
      setItems(updatedItems);

      // Clear status after a delay
      setTimeout(() => {
        setTwitterUploadStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to download from Twitter:', error);
      setTwitterUploadStatus({
        url,
        status: 'error',
        error: String(error),
      });

      // Clear error after 5 seconds
      setTimeout(() => {
        setTwitterUploadStatus(null);
      }, 5000);
    }
  }, []);

  // Render mobile view if on mobile
  if (isMobile) {
    return (
      <>
        <MobileView items={items} onItemClick={handleItemClick} />

        {/* Detail Panel */}
        <DetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleItemUpdate}
          onDelete={(id) => {
            // Trigger deletion animation
            setDeletingItemId(id);
            setSelectedItem(null);
          }}
        />
      </>
    );
  }

  // Desktop view
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: 'var(--bg-primary)' }}>
      {/* Upload Zone */}
      <UploadZone onUpload={handleUpload} isUploading={uploadQueue.length > 0} />

      {/* Upload Queue Status */}
      {(uploadQueue.length > 0 || twitterUploadStatus) && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            zIndex: 100,
            fontSize: '0.85em',
            maxWidth: '350px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {uploadQueue.length > 0 && (
            <>
              <div style={{ marginBottom: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Uploading {uploadQueue.filter(i => i.status !== 'completed').length} file(s)
              </div>
              {uploadQueue.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '6px 0',
                    borderBottom: idx < uploadQueue.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {item.status === 'uploading' && <div style={{ color: 'var(--accent)' }}>↻</div>}
                  {item.status === 'completed' && <div style={{ color: '#4ade80' }}>✓</div>}
                  {item.status === 'error' && <div style={{ color: '#ef4444' }}>✗</div>}
                  {item.status === 'pending' && <div style={{ color: 'var(--text-secondary)' }}>⋯</div>}
                  <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.itemName || item.file.name}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Twitter Upload Status */}
          {twitterUploadStatus && (
            <div
              style={{
                padding: '6px 0',
                borderTop: uploadQueue.length > 0 ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: uploadQueue.length > 0 ? '8px' : '0',
              }}
            >
              {twitterUploadStatus.status === 'downloading' && <div style={{ color: 'var(--accent)' }}>↓</div>}
              {twitterUploadStatus.status === 'uploading' && <div style={{ color: 'var(--accent)' }}>↻</div>}
              {twitterUploadStatus.status === 'completed' && <div style={{ color: '#4ade80' }}>✓</div>}
              {twitterUploadStatus.status === 'error' && <div style={{ color: '#ef4444' }}>✗</div>}
              <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {twitterUploadStatus.status === 'downloading' && 'Downloading from Twitter...'}
                {twitterUploadStatus.status === 'uploading' && 'Uploading from Twitter...'}
                {twitterUploadStatus.status === 'completed' && 'Twitter media uploaded'}
                {twitterUploadStatus.status === 'error' && `Error: ${twitterUploadStatus.error}`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Demo Mode Banner */}
      {isDemoMode && items.length === 0 && uploadQueue.length === 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 24px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            zIndex: 100,
            fontSize: '0.9em',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            maxWidth: '500px',
          }}
        >
          <div style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>
            Running in Demo Mode
          </div>
          <div style={{ fontSize: '0.85em' }}>
            Drag & drop images/videos anywhere to upload.
          </div>
        </div>
      )}

      {/* Header */}
      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '20px 30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            fontSize: '1.5em',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          ReactionSpace
        </h1>

        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <button
            onClick={() => setIsSearchOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Search</span>
            <kbd
              style={{
                fontSize: '0.75em',
                padding: '2px 6px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
            >
              ⌘K
            </kbd>
          </button>
          <AuthButton />
        </div>
      </header>

      {/* Canvas */}
      <InfiniteCanvas
        items={items}
        onItemDragEnd={handleItemDragEnd}
        onItemClick={handleItemClick}
        deletingItemId={deletingItemId}
        onDeleteAnimationComplete={handleDeleteAnimationComplete}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSearch={api.searchItems}
        onSelectItem={handleSelectSearchResult}
      />

      {/* Twitter Link Bar */}
      <TwitterLinkBar
        isOpen={isTwitterLinkBarOpen}
        onClose={() => setIsTwitterLinkBarOpen(false)}
        onSubmit={handleTwitterLinkSubmit}
        isLoading={false}
      />

      {/* Detail Panel */}
      <DetailPanel
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdate={handleItemUpdate}
        onDelete={(id) => {
          // Trigger deletion animation
          setDeletingItemId(id);
          setSelectedItem(null);
        }}
      />
    </div>
  );
}

export default App;
