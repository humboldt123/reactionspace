from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from app.models.schemas import MediaItem, MediaItemUpdate, PositionUpdate, SearchResult
from app.services.supabase_service import supabase_service
from app.services.umap_service import UMAPService
from app.core.auth import get_current_user_id_optional, get_current_user_id
from app.core.config import settings
import os

router = APIRouter()


@router.get("/items", response_model=List[MediaItem])
async def get_all_items(user_id: Optional[str] = Depends(get_current_user_id_optional)):
    """Get all media items for the current user."""
    try:
        items = await supabase_service.get_all_items(user_id)
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/storage")
async def get_storage_info(user_id: Optional[str] = Depends(get_current_user_id_optional)):
    """Get storage usage information for the current user."""
    try:
        items = await supabase_service.get_all_items(user_id)

        # Calculate total storage used from actual file sizes
        total_bytes = sum(item.file_size for item in items if item.file_size)

        return {
            "used_bytes": total_bytes,
            "limit_bytes": settings.STORAGE_LIMIT,
            "item_count": len(items)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/items/{item_id}", response_model=MediaItem)
async def get_item(
    item_id: str,
    user_id: Optional[str] = Depends(get_current_user_id_optional)
):
    """Get a single item by ID."""
    item = await supabase_service.get_item_by_id(item_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.patch("/items/{item_id}", response_model=MediaItem)
async def update_item(
    item_id: str,
    updates: MediaItemUpdate,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Update an item's metadata (name, description, caption, etc)."""
    try:
        item = await supabase_service.update_item(item_id, updates, user_id)
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/items/{item_id}/position", response_model=MediaItem)
async def update_position(
    item_id: str,
    position: PositionUpdate,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Update an item's position on the canvas."""
    try:
        updates = MediaItemUpdate(x=position.x, y=position.y)
        item = await supabase_service.update_item(item_id, updates, user_id)
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search", response_model=SearchResult)
async def search_items(
    q: str,
    user_id: Optional[str] = Depends(get_current_user_id_optional)
):
    """
    Search items by text query.
    Also includes spatially nearby items (within 300px radius).
    Limited to 100 results total.
    """
    try:
        # Maximum number of results to return
        MAX_RESULTS = 100

        # Get direct matches
        direct_matches = await supabase_service.search_items(q, user_id)

        # Get all items for spatial search
        all_items = await supabase_service.get_all_items(user_id)

        # Find nearby items
        PROXIMITY_RADIUS = 300
        nearby_items = {}  # Use dict to track by ID

        for match in direct_matches:
            for item in all_items:
                if item.id == match.id:
                    continue

                distance = ((item.x - match.x) ** 2 + (item.y - match.y) ** 2) ** 0.5
                if distance <= PROXIMITY_RADIUS:
                    nearby_items[item.id] = item

        # Combine results and remove duplicates
        seen = set()
        unique_results = []

        # Add direct matches first
        for item in direct_matches:
            if item.id not in seen:
                seen.add(item.id)
                unique_results.append(item)

        # Add nearby items
        for item in nearby_items.values():
            if item.id not in seen:
                seen.add(item.id)
                unique_results.append(item)

        # Apply limit to results
        limited_results = unique_results[:MAX_RESULTS]

        return SearchResult(items=limited_results, total=len(unique_results))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recompute-positions")
async def recompute_positions(
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """
    Recompute UMAP positions for all items.
    Useful when you want to regenerate the layout.
    """
    try:
        # Get all embeddings
        embeddings_data = await supabase_service.get_all_embeddings(user_id)

        if len(embeddings_data) < 2:
            return {"message": "Not enough items to compute positions"}

        # Extract vectors and item IDs
        vectors = [e["vector"] for e in embeddings_data]
        item_ids = [e["item_id"] for e in embeddings_data]

        # Compute 2D positions
        positions = UMAPService.compute_2d_positions(vectors)

        # Update each item's position
        for item_id, (x, y) in zip(item_ids, positions):
            updates = MediaItemUpdate(x=x, y=y)
            await supabase_service.update_item(item_id, updates, user_id)

        return {"message": f"Recomputed positions for {len(item_ids)} items"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Delete an item."""
    try:
        await supabase_service.delete_item(item_id, user_id)
        return {"message": "Item deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/account")
async def delete_account(user_id: Optional[str] = Depends(get_current_user_id)):
    """Delete the current user's account and all associated data."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        # Get all user's items
        items = await supabase_service.get_all_items(user_id)

        # Delete all items (this will also delete files from storage)
        for item in items:
            try:
                await supabase_service.delete_item(item.id, user_id)
            except Exception as e:
                print(f"Error deleting item {item.id}: {e}")
                # Continue deleting other items even if one fails

        # Note: We don't delete the user from Supabase Auth here
        # That should be done through Supabase's user management
        # For now, just delete all their data

        return {
            "message": "Account data deleted successfully",
            "items_deleted": len(items)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")
