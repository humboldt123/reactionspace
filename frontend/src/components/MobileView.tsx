import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthButton } from './AuthButton';
import type { MediaItem } from '../types';
import { api } from '../api/client';
import { FaGoogle } from 'react-icons/fa';

interface MobileViewProps {
  items: MediaItem[];
  onItemClick?: (id: string) => void;
}

export function MobileView({ items, onItemClick }: MobileViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<MediaItem[]>(items);
  const [isSearching, setIsSearching] = useState(false);

  // Update filtered items when search query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        // No search query, order by distance from origin (semantic clustering)
        const sortedItems = [...items].sort((a, b) => {
          const distA = Math.sqrt(a.x * a.x + a.y * a.y);
          const distB = Math.sqrt(b.x * b.x + b.y * b.y);
          return distA - distB;
        });
        setFilteredItems(sortedItems);
        return;
      }

      setIsSearching(true);
      try {
        const results = await api.searchItems(searchQuery);
        setFilteredItems(results);
      } catch (error) {
        console.error('Search failed:', error);
        setFilteredItems(items);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, items]);

  // If not signed in, show sign-in prompt
  if (!user) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          padding: '20px',
        }}
      >
        <h1
          style={{
            fontSize: '2em',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          ReactionSpace
        </h1>
        <p
          style={{
            fontSize: '1em',
            color: 'var(--text-secondary)',
            marginBottom: '32px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          Sign in to access your reaction collection
        </p>
        <button
          onClick={signInWithGoogle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 24px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '1em',
            color: 'var(--text-primary)',
            transition: 'all 0.2s',
          }}
        >
          <FaGoogle size={20} />
          <span>Sign in with Google</span>
        </button>
      </div>
    );
  }

  // Signed in - show the mobile interface
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Header with search bar and account button */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search reactions..."
          style={{
            flex: 1,
            padding: '10px 14px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: '1em',
            color: 'var(--text-primary)',
          }}
        />
        <AuthButton />
      </div>

      {/* Media list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        {isSearching && (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: 'var(--text-secondary)',
            }}
          >
            Searching...
          </div>
        )}

        {!isSearching && filteredItems.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-secondary)',
            }}
          >
            {searchQuery.trim() ? 'No results found' : 'No items yet'}
          </div>
        )}

        {!isSearching && filteredItems.length > 0 && (
          <div
            style={{
              columnCount: 2,
              columnGap: '8px',
            }}
          >
            {filteredItems.map((item) => (
              <div
                key={item.id}
                style={{
                  breakInside: 'avoid',
                  marginBottom: '8px',
                }}
              >
                <MobileMediaItem
                  item={item}
                  onClick={() => onItemClick?.(item.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Component for rendering individual media items in mobile view
function MobileMediaItem({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // For videos, we want to show a preview (first second looping)
  const isVideo = item.fileType === 'video';
  const hasPreviewVideo = !!item.previewVideoPath;
  const isGif = hasPreviewVideo && item.fileType !== 'video';

  useEffect(() => {
    if (videoRef.current && (isVideo || isGif)) {
      const video = videoRef.current;

      const handleCanPlay = () => {
        video.play().catch((err) => console.log('Video play failed:', err));
        setIsLoaded(true);
      };

      video.addEventListener('canplay', handleCanPlay);

      if (isVideo) {
        // For real videos, loop only the first second
        const handleTimeUpdate = () => {
          if (video.currentTime >= 1) {
            video.currentTime = 0;
          }
        };
        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
          video.removeEventListener('canplay', handleCanPlay);
          video.removeEventListener('timeupdate', handleTimeUpdate);
        };
      }

      return () => {
        video.removeEventListener('canplay', handleCanPlay);
      };
    }
  }, [isVideo, isGif]);

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.opacity = '0.8';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      {/* Media content */}
      <div
        style={{
          width: '100%',
          aspectRatio: `${item.width} / ${item.height}`,
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {isVideo || isGif ? (
          <video
            ref={videoRef}
            src={isGif ? item.previewVideoPath : item.filePath}
            muted
            loop
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <img
            src={item.filePath}
            alt={item.name || 'Media item'}
            onLoad={() => setIsLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}

        {!isLoaded && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'var(--text-secondary)',
              fontSize: '0.9em',
            }}
          >
            Loading...
          </div>
        )}

        {/* Name overlay at bottom */}
        {item.name && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '4px 6px',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              fontFamily: 'monospace',
              fontSize: '0.7em',
              color: '#f5f5f5',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.name}
          </div>
        )}
      </div>
    </div>
  );
}
