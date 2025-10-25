import type { MediaItem } from '../types';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const BACKEND_URL = API_BASE.replace('/api', '');

// Helper to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    return {
      'Authorization': `Bearer ${session.access_token}`,
    };
  }

  return {};
}

// Helper to convert backend file paths to full URLs
function normalizeFilePath(path: string): string {
  if (path.startsWith('http')) return path;
  if (path.startsWith('/uploads')) return `${BACKEND_URL}${path}`;
  return path;
}

// Helper to normalize item from backend
function normalizeItem(item: any): MediaItem {
  return {
    ...item,
    filePath: normalizeFilePath(item.file_path || item.filePath),
    thumbnailPath: normalizeFilePath(item.thumbnail_path || item.thumbnailPath),
    previewVideoPath: item.preview_video_path ? normalizeFilePath(item.preview_video_path) : (item.previewVideoPath || undefined),
    fileType: item.file_type || item.fileType,
    fileSize: item.file_size || item.fileSize || 0,
    positionLocked: item.position_locked ?? item.positionLocked ?? false,
    createdAt: new Date(item.created_at || item.createdAt),
  };
}

export const api = {
  async getConfig(): Promise<{ demo_mode: boolean; supabase_configured: boolean }> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('Failed to fetch config');
    return await res.json();
  },

  async getItems(): Promise<MediaItem[]> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/items`, {
      headers: authHeaders,
    });
    if (!res.ok) throw new Error('Failed to fetch items');
    const data = await res.json();
    return data.map(normalizeItem);
  },

  async getStorage(): Promise<{ used_bytes: number; limit_bytes: number; item_count: number; is_pro: boolean; global_warning?: boolean; global_used_bytes?: number }> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/storage`, {
      headers: authHeaders,
    });
    if (!res.ok) throw new Error('Failed to fetch storage info');
    return await res.json();
  },

  async uploadFile(file: File): Promise<{ item: MediaItem; message: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = await getAuthHeaders();

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Upload failed');
    }

    const data = await res.json();
    return {
      ...data,
      item: normalizeItem(data.item),
    };
  },

  async updateItemPosition(id: string, x: number, y: number): Promise<MediaItem> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/items/${id}/position`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ x, y }),
    });

    if (!res.ok) throw new Error('Failed to update position');
    const data = await res.json();
    return normalizeItem(data);
  },

  async searchItems(query: string): Promise<MediaItem[]> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
      headers: authHeaders,
    });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return data.items.map(normalizeItem);
  },

  async updateItem(id: string, updates: Partial<MediaItem>): Promise<MediaItem> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/items/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) throw new Error('Failed to update item');
    const data = await res.json();
    return normalizeItem(data);
  },

  async deleteItem(id: string): Promise<void> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/items/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    if (!res.ok) throw new Error('Failed to delete item');
  },

  async batchDeleteItems(itemIds: string[]): Promise<{ deleted: number; failed: number }> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/items/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(itemIds),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Batch delete failed');
    }

    return await res.json();
  },

  async uploadFromTwitter(url: string): Promise<{ item: MediaItem; message: string }> {
    const authHeaders = await getAuthHeaders();

    const res = await fetch(`${API_BASE}/upload/twitter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Twitter upload failed');
    }

    const data = await res.json();
    return {
      ...data,
      item: normalizeItem(data.item),
    };
  },

  async deleteAccount(): Promise<{ message: string; items_deleted: number }> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/account`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to delete account');
    }

    return await res.json();
  },
};
