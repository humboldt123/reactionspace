import { useState, useEffect, useCallback, useMemo } from 'react';
import { InfiniteCanvas } from './components/InfiniteCanvas';
import { SearchModal } from './components/SearchModal';
import { DetailPanel } from './components/DetailPanel';
import { UploadZone } from './components/UploadZone';
import { AuthButton } from './components/AuthButton';
import { AccountSettings } from './components/AccountSettings';
import { MobileView } from './components/MobileView';
import { TwitterLinkBar } from './components/TwitterLinkBar';
import { Toast } from './components/Toast';
import { useIsMobile } from './hooks/useIsMobile';
import { useAuth } from './contexts/AuthContext';
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

interface PasteConfirmation {
  type: 'files' | 'twitter';
  data: File[] | string;
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
  const [pasteConfirm, setPasteConfirm] = useState<PasteConfirmation | null>(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageLimit, setStorageLimit] = useState(1024 * 1024 * 1024); // 1GB default
  const [globalWarning, setGlobalWarning] = useState(false);
  const [globalUsedBytes, setGlobalUsedBytes] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'error' | 'success' | 'info'>('error');
  const isMobile = useIsMobile();
  const { user, signOut } = useAuth();

  // Detect platform for keyboard shortcuts display
  // Use userAgentData if available (modern), fallback to userAgent (legacy)
  const isMac = useMemo(() => {
    // Modern approach
    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform.toUpperCase().includes('MAC');
    }
    // Fallback for older browsers
    if (navigator.platform) {
      return navigator.platform.toUpperCase().includes('MAC');
    }
    // Last resort - check userAgent string
    return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  }, []);

  // Load config, items, and storage on mount
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

    // Fetch storage info
    api.getStorage().then(storage => {
      setStorageUsed(storage.used_bytes);
      setStorageLimit(storage.limit_bytes);
      setGlobalWarning(storage.global_warning || false);
      setGlobalUsedBytes(storage.global_used_bytes || 0);
      setIsPro(storage.is_pro || false);
    }).catch(err => {
      console.error('Failed to load storage info:', err);
    });
  }, []);

  // Refresh storage info when items change
  useEffect(() => {
    if (user) {
      api.getStorage().then(storage => {
        setStorageUsed(storage.used_bytes);
        setStorageLimit(storage.limit_bytes);
        setGlobalWarning(storage.global_warning || false);
        setGlobalUsedBytes(storage.global_used_bytes || 0);
        setIsPro(storage.is_pro || false);
      }).catch(err => {
        console.error('Failed to refresh storage info:', err);
      });
    }
  }, [items.length, user]);

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

  const handleBatchItemDragEnd = useCallback(async (updates: Array<{ id: string; x: number; y: number }>) => {
    // Update local state immediately for all items
    setItems((prev) =>
      prev.map((item) => {
        const update = updates.find(u => u.id === item.id);
        return update ? { ...item, x: update.x, y: update.y, positionLocked: true } : item;
      })
    );

    // Update via API (in parallel)
    try {
      await Promise.all(
        updates.map(update => api.updateItemPosition(update.id, update.x, update.y))
      );
    } catch (error) {
      console.error('Failed to update item positions:', error);
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
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Show toast with error
        setToastMessage(errorMessage);
        setToastType('error');

        setUploadQueue(prev => prev.map(item =>
          item.file === pendingItem.file
            ? { ...item, status: 'error' as const, error: errorMessage }
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
    // Check if user is signed in
    if (!user) {
      setToastMessage('Please sign in to upload files');
      setToastType('error');
      return;
    }

    // Add all files to the queue
    const newQueueItems: UploadQueueItem[] = files.map(file => ({
      file,
      status: 'pending' as const,
    }));

    setUploadQueue(prev => [...prev, ...newQueueItems]);
  }, [user]);

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

  const handleBatchDelete = useCallback(async (itemIds: string[]) => {
    try {
      // Remove items from UI immediately
      setItems((prev) => prev.filter((item) => !itemIds.includes(item.id)));

      // Delete via API
      const result = await api.batchDeleteItems(itemIds);

      // Show success message
      setToastMessage(`Deleted ${result.deleted} item${result.deleted !== 1 ? 's' : ''}`);
      setToastType('success');

      // If any failed, show warning
      if (result.failed > 0) {
        setTimeout(() => {
          setToastMessage(`Warning: ${result.failed} item${result.failed !== 1 ? 's' : ''} failed to delete`);
          setToastType('error');
        }, 2500);
      }
    } catch (error) {
      console.error('Failed to batch delete items:', error);
      setToastMessage('Failed to delete items');
      setToastType('error');

      // Refresh items list to restore any that weren't deleted
      const updatedItems = await api.getItems();
      setItems(updatedItems);
    }
  }, []);

  const handleTwitterLinkSubmit = useCallback(async (url: string) => {
    // Check if user is signed in
    if (!user) {
      setToastMessage('Please sign in to upload files');
      setToastType('error');
      setIsTwitterLinkBarOpen(false);
      return;
    }

    // Close the modal immediately
    setIsTwitterLinkBarOpen(false);

    // Show downloading status
    setTwitterUploadStatus({
      url,
      status: 'downloading',
    });

    try {
      // This happens in the background now
      await api.uploadFromTwitter(url);

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
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Show toast with error
      setToastMessage(errorMessage);
      setToastType('error');

      setTwitterUploadStatus({
        url,
        status: 'error',
        error: errorMessage,
      });

      // Clear error after 5 seconds
      setTimeout(() => {
        setTwitterUploadStatus(null);
      }, 5000);
    }
  }, [user]);

  // Handle clipboard paste (Cmd+V / Ctrl+V)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // Check if clipboard contains text (might be a Twitter link)
      const textItem = Array.from(items).find(item => item.type === 'text/plain');
      if (textItem) {
        textItem.getAsString(async (text) => {
          // Check if it's a Twitter/X URL
          const twitterUrlPattern = /(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[^\s]+/i;
          if (twitterUrlPattern.test(text.trim())) {
            e.preventDefault();

            if (!user) {
              setToastMessage('Please sign in to upload files');
              setToastType('error');
              return;
            }

            // Show confirmation dialog
            setPasteConfirm({
              type: 'twitter',
              data: text.trim(),
            });
            return;
          }
        });
      }

      // Check if clipboard contains image/video files
      const mediaItems = Array.from(items).filter(item =>
        item.type.startsWith('image/') || item.type.startsWith('video/')
      );

      if (mediaItems.length > 0) {
        e.preventDefault();

        if (!user) {
          setToastMessage('Please sign in to upload files');
          setToastType('error');
          return;
        }

        // Collect files
        const files: File[] = [];
        for (const item of mediaItems) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }

        if (files.length > 0) {
          // Show confirmation dialog
          setPasteConfirm({
            type: 'files',
            data: files,
            count: files.length,
          });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [user]);

  const handlePasteConfirm = useCallback(async () => {
    if (!pasteConfirm) return;

    if (pasteConfirm.type === 'twitter') {
      await handleTwitterLinkSubmit(pasteConfirm.data as string);
    } else if (pasteConfirm.type === 'files') {
      await handleUpload(pasteConfirm.data as File[]);
    }

    setPasteConfirm(null);
  }, [pasteConfirm, handleUpload, handleTwitterLinkSubmit]);

  const handlePasteCancel = useCallback(() => {
    setPasteConfirm(null);
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    try {
      await api.deleteAccount();
      await signOut();
      setShowAccountSettings(false);
      setItems([]);
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account. Please try again.');
    }
  }, [signOut]);

  // Render mobile view if on mobile
  if (isMobile) {
    return (
      <>
        <MobileView
          items={items}
          onItemClick={handleItemClick}
          onAccountClick={() => setShowAccountSettings(true)}
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

        {/* Account Settings */}
        {showAccountSettings && user && (
          <AccountSettings
            user={user}
            onClose={() => setShowAccountSettings(false)}
            onSignOut={async () => {
              await signOut();
              setShowAccountSettings(false);
            }}
            onDeleteAccount={handleDeleteAccount}
            storageUsed={storageUsed}
            storageLimit={storageLimit}
            isDemoMode={isDemoMode}
            isPro={isPro}
            globalWarning={globalWarning}
            globalUsedBytes={globalUsedBytes}
          />
        )}
      </>
    );
  }

  // Desktop view
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: 'var(--bg-primary)' }}>
      {/* Upload Zone */}
      <UploadZone onUpload={handleUpload} isUploading={uploadQueue.length > 0} />

      {/* Toast Notifications */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Paste Confirmation Dialog */}
      {pasteConfirm && (
        <>
          {/* Backdrop */}
          <div
            onClick={handlePasteCancel}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 2000,
              animation: 'fadeIn 0.2s ease-out',
            }}
          />

          {/* Dialog */}
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
              zIndex: 2001,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              animation: 'scaleIn 0.2s ease-out',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: '1.1em' }}>
              {pasteConfirm.type === 'twitter' ? 'Upload from Twitter?' : 'Upload Files?'}
            </h3>
            <p style={{ margin: '12px 0', color: 'var(--text-secondary)' }}>
              {pasteConfirm.type === 'twitter'
                ? 'Download and upload media from this tweet?'
                : `Upload ${pasteConfirm.count} file${pasteConfirm.count === 1 ? '' : 's'} from clipboard?`}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={handlePasteCancel}>Cancel</button>
              <button
                onClick={handlePasteConfirm}
                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-primary)' }}
              >
                Upload
              </button>
            </div>
          </div>
        </>
      )}

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
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>
          <AuthButton onAccountClick={() => setShowAccountSettings(true)} />
        </div>
      </header>

      {/* Account Settings */}
      {showAccountSettings && user && (
        <AccountSettings
          user={user}
          onClose={() => setShowAccountSettings(false)}
          onSignOut={async () => {
            await signOut();
            setShowAccountSettings(false);
          }}
          onDeleteAccount={handleDeleteAccount}
          storageUsed={storageUsed}
          storageLimit={storageLimit}
          isDemoMode={isDemoMode}
          isPro={isPro}
          globalWarning={globalWarning}
          globalUsedBytes={globalUsedBytes}
        />
      )}

      {/* Canvas */}
      <InfiniteCanvas
        items={items}
        onItemDragEnd={handleItemDragEnd}
        onBatchItemDragEnd={handleBatchItemDragEnd}
        onItemClick={handleItemClick}
        deletingItemId={deletingItemId}
        onDeleteAnimationComplete={handleDeleteAnimationComplete}
        onBatchDelete={handleBatchDelete}
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
