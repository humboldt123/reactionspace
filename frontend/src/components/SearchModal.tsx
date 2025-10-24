import { useState, useEffect, useRef } from 'react';
import type { MediaItem } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<MediaItem[]>;
  onSelectItem: (item: MediaItem) => void;
}

export function SearchModal({ isOpen, onClose, onSearch, onSelectItem }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search as user types
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      const searchResults = await onSearch(query);
      setResults(searchResults);
      setSelectedIndex(0);
    }, 200);

    return () => clearTimeout(searchTimeout);
  }, [query, onSearch]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelectItem(results[selectedIndex]);
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, onSelectItem]);

  if (!isOpen) return null;

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
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '600px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          zIndex: 1001,
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reactions... (try: is:image, before:2024-12-31, after:2024-01-01)"
          style={{
            width: '100%',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            borderRadius: 0,
            padding: '16px 20px',
            fontSize: '1em',
          }}
        />

        {/* Results */}
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          {results.length === 0 && query.trim() !== '' && (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              No results found
            </div>
          )}

          {results.map((item, index) => (
            <div
              key={item.id}
              onClick={() => {
                onSelectItem(item);
                onClose();
              }}
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex ? 'var(--bg-tertiary)' : 'transparent',
                borderLeft: index === selectedIndex ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ fontWeight: 500, flex: 1 }}>{item.name || 'Untitled'}</div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '0.7em',
                  color: 'var(--text-secondary)',
                  opacity: 0.6,
                  flexShrink: 0
                }}>
                  {item.filePath.split('.').pop()?.toLowerCase() || item.fileType}
                </div>
              </div>
              {item.description && (
                <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {item.description}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            fontSize: '0.8em',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', marginBottom: '6px' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
            Filters: is:image, is:video, is:gif, before:YYYY-MM-DD, after:YYYY-MM-DD
          </div>
        </div>
      </div>
    </>
  );
}
