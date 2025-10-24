from typing import List, Optional
from app.core.config import settings
from app.models.schemas import MediaItem, MediaItemCreate, MediaItemUpdate
from app.utils.search_filters import parse_search_query

# Check if Supabase is configured
SUPABASE_CONFIGURED = (
    settings.SUPABASE_URL and
    settings.SUPABASE_URL != "https://your-project.supabase.co" and
    settings.SUPABASE_SERVICE_KEY and
    settings.SUPABASE_SERVICE_KEY != "your_service_key"
)

if SUPABASE_CONFIGURED:
    from supabase import create_client, Client


class SupabaseService:
    def __init__(self):
        if SUPABASE_CONFIGURED:
            self.client: Client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY
            )
        else:
            self.client = None

    async def create_item(self, item: MediaItemCreate) -> MediaItem:
        """Create a new media item in the database."""
        data = {
            "name": item.name,
            "description": item.description,
            "keywords": item.keywords,
            "file_path": item.file_path,
            "thumbnail_path": item.thumbnail_path,
            "preview_video_path": item.preview_video_path,
            "file_type": item.file_type,
            "file_size": item.file_size,
            "x": item.x,
            "y": item.y,
            "width": item.width,
            "height": item.height,
            "user_id": item.user_id,
        }

        result = self.client.table("items").insert(data).execute()
        return MediaItem(**result.data[0])

    async def get_all_items(self, user_id: Optional[str] = None) -> List[MediaItem]:
        """Get all media items for the current user (or public items if not authenticated)."""
        query = self.client.table("items").select("*")

        # Filter by user_id
        if user_id:
            # Authenticated: return only this user's items
            query = query.eq("user_id", user_id)
        else:
            # Not authenticated: return only public items (where user_id is NULL)
            query = query.is_("user_id", "null")

        result = query.execute()
        return [MediaItem(**item) for item in result.data]

    async def get_item_by_id(self, item_id: str, user_id: Optional[str] = None) -> Optional[MediaItem]:
        """Get a single media item by ID (must belong to user or be public)."""
        query = self.client.table("items").select("*").eq("id", item_id)

        # Filter by user_id
        if user_id:
            # Authenticated: return only if it belongs to this user
            query = query.eq("user_id", user_id)
        else:
            # Not authenticated: return only if it's a public item
            query = query.is_("user_id", "null")

        result = query.execute()
        if result.data:
            return MediaItem(**result.data[0])
        return None

    async def update_item(self, item_id: str, updates: MediaItemUpdate, user_id: Optional[str] = None) -> MediaItem:
        """Update a media item, optionally filtered by user_id."""
        data = updates.model_dump(exclude_unset=True)
        query = self.client.table("items").update(data).eq("id", item_id)

        # Filter by user_id if provided
        if user_id:
            query = query.eq("user_id", user_id)

        result = query.execute()
        if not result.data:
            raise Exception("Item not found or permission denied")
        return MediaItem(**result.data[0])

    async def search_items(self, query: str, user_id: Optional[str] = None) -> List[MediaItem]:
        """
        Search items by name, description, or keywords, optionally filtered by user_id.

        Supports filter syntax:
        - before:YYYY-MM-DD - Show results before this date
        - after:YYYY-MM-DD - Show results after this date
        - is:image/gif - Filter by MIME type
        - is:video - Filter by type category
        """
        # Parse query to extract filters
        filters = parse_search_query(query)

        # Build base query
        if filters.query.strip():
            # Text search on name, description, or keywords
            db_query = self.client.table("items").select("*").or_(
                f"name.ilike.%{filters.query}%,description.ilike.%{filters.query}%,keywords.ilike.%{filters.query}%"
            )
        else:
            # No text query, just get all items (will be filtered)
            db_query = self.client.table("items").select("*")

        # Apply date filters
        if filters.before_date:
            db_query = db_query.lt("created_at", filters.before_date.isoformat())

        if filters.after_date:
            db_query = db_query.gt("created_at", filters.after_date.isoformat())

        # Apply MIME type filters
        if filters.mime_types:
            # Build OR condition for MIME types
            mime_conditions = []
            for mime_type in filters.mime_types:
                if mime_type in ['image', 'video']:
                    # Match any image/* or video/*
                    mime_conditions.append(f"file_type.eq.{mime_type}")
                else:
                    # Exact MIME type match (e.g., image/gif)
                    # For Supabase, we store "image" or "video" in file_type
                    # So we need to handle this differently
                    if mime_type.startswith('image/'):
                        mime_conditions.append("file_type.eq.image")
                    elif mime_type.startswith('video/'):
                        mime_conditions.append("file_type.eq.video")

            if mime_conditions:
                # Use the first condition (simplified for now)
                # Supabase doesn't support complex OR conditions easily in this format
                if 'image' in filters.mime_types or any(m.startswith('image/') for m in filters.mime_types):
                    db_query = db_query.eq("file_type", "image")
                elif 'video' in filters.mime_types or any(m.startswith('video/') for m in filters.mime_types):
                    db_query = db_query.eq("file_type", "video")

        # Filter by user_id
        if user_id:
            # Authenticated: search only this user's items
            db_query = db_query.eq("user_id", user_id)
        else:
            # Not authenticated: search only public items
            db_query = db_query.is_("user_id", "null")

        result = db_query.execute()
        items = [MediaItem(**item) for item in result.data]

        # Post-filter for specific file types like GIF (check file extension)
        if filters.mime_types:
            specific_types = [mt for mt in filters.mime_types if '/' in mt and mt not in ['image', 'video']]
            if specific_types:
                filtered_items = []
                for item in items:
                    file_ext = item.file_path.lower().split('.')[-1]
                    for mime_type in specific_types:
                        # Extract extension from MIME type (e.g., "image/gif" -> "gif")
                        expected_ext = mime_type.split('/')[-1]
                        if file_ext == expected_ext:
                            filtered_items.append(item)
                            break
                items = filtered_items

        return items

    async def store_embedding(self, item_id: str, vector: List[float]) -> None:
        """Store an embedding vector for an item."""
        data = {
            "item_id": item_id,
            "vector": vector
        }
        self.client.table("embeddings").insert(data).execute()

    async def get_all_embeddings(self, user_id: Optional[str] = None) -> List[dict]:
        """Get all embeddings with their item IDs for the current user (or public items if not authenticated)."""
        if user_id:
            # Authenticated: get embeddings for this user's items
            result = self.client.table("embeddings").select(
                "item_id, vector, items!inner(user_id)"
            ).eq("items.user_id", user_id).execute()
        else:
            # Not authenticated: get embeddings for public items only
            result = self.client.table("embeddings").select(
                "item_id, vector, items!inner(user_id)"
            ).is_("items.user_id", "null").execute()

        return result.data

    async def delete_item(self, item_id: str, user_id: Optional[str] = None) -> None:
        """Delete a media item and its file from storage, optionally filtered by user_id."""
        # First, get the item to retrieve the file path
        item = await self.get_item_by_id(item_id, user_id)
        if not item:
            raise Exception("Item not found or permission denied")

        # Extract storage path from file URL
        # URL format: https://.../storage/v1/object/public/reactions/reactions/filename.ext
        # We need: reactions/filename.ext
        try:
            file_path = item.file_path
            if "/object/public/" in file_path:
                # Extract path after bucket name
                parts = file_path.split("/object/public/")
                if len(parts) > 1:
                    storage_path = parts[1].split("/", 1)[1] if "/" in parts[1] else parts[1]
                else:
                    storage_path = None
            elif file_path.startswith("/uploads/"):
                # Handle local file paths (shouldn't happen in Supabase mode, but just in case)
                storage_path = file_path.replace("/uploads/", "")
            else:
                storage_path = None

            # Delete file from storage
            if storage_path:
                self.client.storage.from_(settings.STORAGE_BUCKET).remove([storage_path])
        except Exception as e:
            # Log error but continue with database deletion
            print(f"Warning: Failed to delete file from storage: {e}")

        # Delete from database
        query = self.client.table("items").delete().eq("id", item_id)

        # Filter by user_id if provided
        if user_id:
            query = query.eq("user_id", user_id)

        result = query.execute()
        if not result.data:
            raise Exception("Item not found or permission denied")

    async def upload_file(self, file_path: str, file_data: bytes, content_type: str) -> str:
        """Upload a file to Supabase storage."""
        result = self.client.storage.from_(settings.STORAGE_BUCKET).upload(
            file_path, file_data, {"content-type": content_type}
        )

        # Get public URL
        public_url = self.client.storage.from_(settings.STORAGE_BUCKET).get_public_url(file_path)
        return public_url


# Use mock storage if Supabase is not configured
if SUPABASE_CONFIGURED:
    supabase_service = SupabaseService()
else:
    from app.services.mock_storage import mock_storage_service
    supabase_service = mock_storage_service  # type: ignore
