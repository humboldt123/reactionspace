"""
Mock storage service for demo mode (when Supabase isn't configured)
Stores files locally and uses in-memory database
"""
import os
import uuid
from typing import List, Optional
from datetime import datetime
from app.models.schemas import MediaItem, MediaItemCreate, MediaItemUpdate
from app.utils.search_filters import parse_search_query

# in-memory storage
items_db = {}
embeddings_db = {}

class MockStorageService:
    def __init__(self):
        # create local storage directory
        # TODO: dont hardcode this wtf
        self.storage_dir = "/Users/vish/Documents/Programming/reactionspace/backend/uploads"
        os.makedirs(self.storage_dir, exist_ok=True)

    async def create_item(self, item: MediaItemCreate) -> MediaItem:
        """Create a new media item in memory."""
        item_id = str(uuid.uuid4())
        new_item = MediaItem(
            id=item_id,
            name=item.name,
            description=item.description,
            keywords=item.keywords,
            file_path=item.file_path,
            thumbnail_path=item.thumbnail_path,
            preview_video_path=item.preview_video_path,
            file_type=item.file_type,
            file_size=item.file_size,
            x=item.x,
            y=item.y,
            width=item.width,
            height=item.height,
            position_locked=False,
            user_id=item.user_id,
            created_at=datetime.now()
        )
        items_db[item_id] = new_item
        return new_item

    async def get_all_items(self, user_id: Optional[str] = None) -> List[MediaItem]:
        """Get all media items for the current user (or public items if not authenticated)."""
        items = list(items_db.values())
        if user_id:
            # Authenticated: return only this user's items
            items = [item for item in items if item.user_id == user_id]
        else:
            # Not authenticated: return only public items
            items = [item for item in items if item.user_id is None]
        return items

    async def get_item_by_id(self, item_id: str, user_id: Optional[str] = None) -> Optional[MediaItem]:
        """Get a single media item by ID (must belong to user or be public)."""
        item = items_db.get(item_id)
        if not item:
            return None

        if user_id:
            # Authenticated: return only if it belongs to this user
            return item if item.user_id == user_id else None
        else:
            # Not authenticated: return only if it's public
            return item if item.user_id is None else None

    async def update_item(self, item_id: str, updates: MediaItemUpdate, user_id: Optional[str] = None) -> MediaItem:
        """Update a media item, optionally filtered by user_id."""
        item = items_db.get(item_id)
        if not item:
            raise ValueError("Item not found")

        # Check user_id if provided
        if user_id and item.user_id != user_id:
            raise ValueError("Item not found or permission denied")

        # Apply updates
        for key, value in updates.model_dump(exclude_unset=True).items():
            setattr(item, key, value)

        items_db[item_id] = item
        return item

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
        query_lower = filters.query.lower()

        results = []
        for item in items_db.values():
            # Filter by user_id
            if user_id:
                # Authenticated: search only this user's items
                if item.user_id != user_id:
                    continue
            else:
                # Not authenticated: search only public items
                if item.user_id is not None:
                    continue

            # Apply text search (if query is not empty)
            if filters.query.strip():
                text_match = (
                    (item.name and query_lower in item.name.lower()) or
                    (item.description and query_lower in item.description.lower()) or
                    (item.keywords and query_lower in item.keywords.lower())
                )
                if not text_match:
                    continue

            # Apply date filters
            if filters.before_date and item.created_at >= filters.before_date:
                continue

            if filters.after_date and item.created_at <= filters.after_date:
                continue

            # Apply MIME type filters
            if filters.mime_types:
                mime_match = False
                for mime_type in filters.mime_types:
                    if mime_type in ['image', 'video']:
                        # Match type category
                        if item.file_type == mime_type:
                            mime_match = True
                            break
                    elif '/' in mime_type:
                        # Specific MIME type like image/gif - check file extension
                        file_ext = item.file_path.lower().split('.')[-1]
                        expected_ext = mime_type.split('/')[-1]
                        if file_ext == expected_ext:
                            mime_match = True
                            break

                if not mime_match:
                    continue

            results.append(item)
        return results

    async def store_embedding(self, item_id: str, vector: List[float]) -> None:
        """Store an embedding vector for an item."""
        embeddings_db[item_id] = vector

    async def get_all_embeddings(self, user_id: Optional[str] = None) -> List[dict]:
        """Get all embeddings with their item IDs for the current user (or public items if not authenticated)."""
        results = []
        for item_id, vector in embeddings_db.items():
            item = items_db.get(item_id)
            if not item:
                continue

            # Filter by user_id
            if user_id:
                # Authenticated: get embeddings for this user's items
                if item.user_id != user_id:
                    continue
            else:
                # Not authenticated: get embeddings for public items only
                if item.user_id is not None:
                    continue

            results.append({"item_id": item_id, "vector": vector})
        return results

    async def delete_item(self, item_id: str, user_id: Optional[str] = None) -> None:
        """Delete a media item and its file from local storage, optionally filtered by user_id."""
        item = items_db.get(item_id)
        if not item:
            raise ValueError("Item not found")

        # Check user_id if provided
        if user_id and item.user_id != user_id:
            raise ValueError("Item not found or permission denied")

        # Delete file from local storage
        try:
            if item.file_path and item.file_path.startswith("/uploads/"):
                file_path = item.file_path.replace("/uploads/", "")
                local_path = os.path.join(self.storage_dir, file_path)
                if os.path.exists(local_path):
                    os.remove(local_path)
        except Exception as e:
            # Log error but continue with database deletion
            print(f"Warning: Failed to delete local file: {e}")

        # Delete from items and embeddings
        del items_db[item_id]
        if item_id in embeddings_db:
            del embeddings_db[item_id]

    async def upload_file(self, file_path: str, file_data: bytes, content_type: str) -> str:
        """Upload a file to local storage."""
        local_path = os.path.join(self.storage_dir, file_path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)

        with open(local_path, "wb") as f:
            f.write(file_data)

        # Return a URL that the frontend can access
        # For now, just return the relative path
        return f"/uploads/{file_path}"


mock_storage_service = MockStorageService()
