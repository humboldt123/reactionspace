from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from app.models.schemas import MediaItem, MediaItemUpdate, PositionUpdate, SearchResult
from app.services.supabase_service import supabase_service
from app.services.twitter_service import TwitterService
from app.services.openai_service import OpenAIService, client as openai_client
from app.services.umap_service import UMAPService
from app.core.auth import get_current_user_id_optional, get_current_user_id
from app.core.config import settings
from app.utils.aspect_ratio import calculate_aspect_ratio
import os
import uuid
import base64
import tempfile
import shutil
import subprocess
import requests
import cv2
import numpy as np
import traceback

router = APIRouter()


class CropRequest(BaseModel):
    crop_top: int = 0
    crop_bottom: int = 0
    crop_left: int = 0
    crop_right: int = 0
    caption: Optional[str] = None


class ConvertToGifRequest(BaseModel):
    crop_top: int = 0
    crop_bottom: int = 0
    caption: Optional[str] = None


def detect_bars(frame: np.ndarray, threshold: float = 15.0, min_bar_pct: float = 0.05) -> tuple:
    """
    Detect solid color bars at top and bottom of a video frame.
    Checks variance of edge pixels (left/right 20%) per row.
    Returns (top_crop, bottom_crop) in pixels.
    """
    h, w = frame.shape[:2]
    edge_width = max(1, int(w * 0.2))
    min_bar_height = int(h * min_bar_pct)

    # Scan from top
    top_crop = 0
    for row_idx in range(h):
        row = frame[row_idx]
        edge_pixels = np.concatenate([row[:edge_width], row[w - edge_width:]])
        if np.std(edge_pixels.astype(float)) < threshold:
            top_crop = row_idx + 1
        else:
            break

    # Scan from bottom
    bottom_crop = 0
    for row_idx in range(h - 1, -1, -1):
        row = frame[row_idx]
        edge_pixels = np.concatenate([row[:edge_width], row[w - edge_width:]])
        if np.std(edge_pixels.astype(float)) < threshold:
            bottom_crop = h - row_idx
        else:
            break

    # Only report significant bars
    if top_crop < min_bar_height:
        top_crop = 0
    if bottom_crop < min_bar_height:
        bottom_crop = 0

    return top_crop, bottom_crop


@router.get("/items", response_model=List[MediaItem])
async def get_all_items(user_id: Optional[str] = Depends(get_current_user_id_optional)):
    """Get all media items for the current user."""
    try:
        items = await supabase_service.get_all_items(user_id)
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_storage_info_internal(user_id: Optional[str]) -> dict:
    """Internal helper to get storage info (used by other endpoints)."""
    items = await supabase_service.get_all_items(user_id)
    total_bytes = sum(item.file_size for item in items if item.file_size)

    # Check if user is pro
    is_pro = False
    if user_id:
        is_pro = await supabase_service.is_user_pro(user_id)
    limit_bytes = settings.STORAGE_LIMIT_PRO if is_pro else settings.STORAGE_LIMIT

    # Calculate global storage used across all users
    all_items = await supabase_service.get_all_items_global()  # Get truly all items
    global_bytes = sum(item.file_size for item in all_items if item.file_size)

    # Warning if approaching Supabase free tier limit (1GB)
    global_warning = global_bytes > settings.GLOBAL_STORAGE_WARNING * 0.8  # Warn at 80% of 1GB

    return {
        "used_bytes": total_bytes,
        "limit_bytes": limit_bytes,
        "item_count": len(items),
        "is_pro": is_pro,
        "global_used_bytes": global_bytes,
        "global_warning": global_warning
    }


@router.get("/storage")
async def get_storage_info(user_id: Optional[str] = Depends(get_current_user_id_optional)):
    """Get storage usage information for the current user."""
    try:
        return await get_storage_info_internal(user_id)
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


@router.post("/items/{item_id}/analyze-video")
async def analyze_video(
    item_id: str,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Analyze a video for caption bars before GIF conversion."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    item = await supabase_service.get_item_by_id(item_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.file_type != "video":
        raise HTTPException(status_code=400, detail="Only video items can be analyzed")

    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, "source.mp4")

        # Download the video
        response = requests.get(item.file_path, stream=True)
        response.raise_for_status()
        with open(video_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Extract a frame
        video = cv2.VideoCapture(video_path)
        total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        original_width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
        original_height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))

        target_frame = min(10, max(0, total_frames // 4))
        video.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        success, frame = video.read()
        video.release()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to extract video frame")

        # Detect bars
        crop_top, crop_bottom = detect_bars(frame)
        bars_detected = crop_top > 0 or crop_bottom > 0

        # Extract text from bar regions using OpenAI Vision
        extracted_caption = ""
        if bars_detected:
            bar_regions = []
            if crop_top > 0:
                bar_regions.append(frame[:crop_top])
            if crop_bottom > 0:
                bar_regions.append(frame[original_height - crop_bottom:])

            if bar_regions:
                combined_bars = np.vstack(bar_regions)
                bar_frame_path = os.path.join(temp_dir, "bars.jpg")
                cv2.imwrite(bar_frame_path, combined_bars)

                try:
                    scaled_bytes, mime_type = OpenAIService.scale_image_if_needed(bar_frame_path)
                    img_b64 = base64.b64encode(scaled_bytes).decode("utf-8")

                    resp = openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Extract ALL text visible in this image. Return ONLY the text, nothing else. If no text is visible, return an empty string."},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{img_b64}"}}
                            ]
                        }],
                        max_tokens=200
                    )
                    extracted_caption = resp.choices[0].message.content.strip()
                except Exception as e:
                    print(f"OCR extraction failed: {e}")

        # Generate full frame preview (uncropped, for visual crop UI)
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        preview_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "bars_detected": bars_detected,
            "crop_top": crop_top,
            "crop_bottom": crop_bottom,
            "preview_image": preview_b64,
            "extracted_caption": extracted_caption,
            "original_width": original_width,
            "original_height": original_height,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Analyze video error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/items/{item_id}/crop-video")
async def crop_video(
    item_id: str,
    request: CropRequest = CropRequest(),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Crop a video (remove caption bars) and re-upload as MP4."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    item = await supabase_service.get_item_by_id(item_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.file_type != "video":
        raise HTTPException(status_code=400, detail="Only video items can be cropped")
    if request.crop_top <= 0 and request.crop_bottom <= 0 and request.crop_left <= 0 and request.crop_right <= 0:
        raise HTTPException(status_code=400, detail="No crop values specified")

    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, "source.mp4")

        # Download video
        response = requests.get(item.file_path, stream=True)
        response.raise_for_status()
        with open(video_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Crop with ffmpeg: crop=w:h:x:y
        cropped_path = os.path.join(temp_dir, "cropped.mp4")
        crop_w = f"iw-{request.crop_left}-{request.crop_right}"
        crop_h = f"ih-{request.crop_top}-{request.crop_bottom}"
        cmd = [
            'ffmpeg', '-i', video_path,
            '-vf', f'crop={crop_w}:{crop_h}:{request.crop_left}:{request.crop_top}',
            '-c:a', 'copy', '-y', cropped_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        # Read cropped video
        with open(cropped_path, 'rb') as f:
            mp4_data = f.read()

        # Generate thumbnail from cropped video
        video = cv2.VideoCapture(cropped_path)
        total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
        actual_width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
        target_frame = min(10, max(0, total_frames // 4))
        video.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        success, frame = video.read()
        video.release()

        thumbnail_data = None
        if success:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            thumbnail_data = buffer.tobytes()

        display_width, display_height = calculate_aspect_ratio(actual_width, actual_height)

        # Upload cropped video
        file_id = str(uuid.uuid4())
        mp4_storage_path = f"reactions/{file_id}.mp4"
        mp4_url = await supabase_service.upload_file(mp4_storage_path, mp4_data, "video/mp4")

        # Upload thumbnail
        thumb_url = mp4_url
        if thumbnail_data:
            thumb_storage_path = f"reactions/{file_id}_thumb.jpg"
            thumb_url = await supabase_service.upload_file(thumb_storage_path, thumbnail_data, "image/jpeg")

        # Delete old files
        old_files = []
        if item.file_path:
            parts = item.file_path.split("/reactions/")
            if len(parts) > 1:
                old_files.append(f"reactions/{parts[-1]}")
        if item.thumbnail_path and item.thumbnail_path != item.file_path:
            parts = item.thumbnail_path.split("/reactions/")
            if len(parts) > 1:
                old_files.append(f"reactions/{parts[-1]}")
        if old_files:
            try:
                supabase_service.client.storage.from_(settings.STORAGE_BUCKET).remove(old_files)
            except Exception as e:
                print(f"Warning: Failed to delete old files: {e}")

        # Update item
        updates = MediaItemUpdate(
            file_path=mp4_url,
            thumbnail_path=thumb_url,
            file_type="video",
            file_size=len(mp4_data) + (len(thumbnail_data) if thumbnail_data else 0),
        )
        if request.caption:
            existing_desc = item.description or ""
            if existing_desc:
                updates.description = f"{existing_desc} | Caption: {request.caption}"
            else:
                updates.description = request.caption

        updated_item = await supabase_service.update_item(item_id, updates, user_id)
        return updated_item

    except HTTPException:
        raise
    except Exception as e:
        print(f"Crop video error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Crop failed: {str(e)}")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/items/{item_id}/convert-to-gif")
async def convert_to_gif(
    item_id: str,
    request: ConvertToGifRequest = ConvertToGifRequest(),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Convert a video item to a GIF with optional cropping."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get the item
    item = await supabase_service.get_item_by_id(item_id, user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.file_type != "video":
        raise HTTPException(status_code=400, detail="Only video items can be converted to GIF")

    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, "source.mp4")

        # Download the video from Supabase
        response = requests.get(item.file_path, stream=True)
        response.raise_for_status()
        with open(video_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Build ffmpeg filter chain with optional crop
        gif_path = os.path.join(temp_dir, "output.gif")
        filters = []

        if request.crop_top > 0 or request.crop_bottom > 0:
            crop_h = f"ih-{request.crop_top}-{request.crop_bottom}"
            filters.append(f"crop=iw:{crop_h}:0:{request.crop_top}")

        filters.append("fps=15")
        filters.append("scale=640:-1:flags=lanczos")
        filters.append("split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse")

        cmd = [
            'ffmpeg', '-i', video_path,
            '-vf', ','.join(filters),
            '-loop', '0', '-y', gif_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        # Read the GIF
        with open(gif_path, 'rb') as f:
            gif_data = f.read()

        # Read the original MP4 for preview
        with open(video_path, 'rb') as f:
            mp4_data = f.read()

        # Get GIF dimensions
        actual_width, actual_height = TwitterService.get_media_dimensions(gif_path, "image")
        display_width, display_height = calculate_aspect_ratio(actual_width, actual_height)

        # Upload GIF to Supabase storage
        file_id = str(uuid.uuid4())
        gif_storage_path = f"reactions/{file_id}.gif"
        gif_url = await supabase_service.upload_file(gif_storage_path, gif_data, "image/gif")

        # Upload MP4 as preview video
        mp4_storage_path = f"reactions/{file_id}.mp4"
        preview_url = await supabase_service.upload_file(mp4_storage_path, mp4_data, "video/mp4")

        total_size = len(gif_data) + len(mp4_data)

        # Delete old files from storage
        old_files = []
        if item.file_path:
            parts = item.file_path.split("/reactions/")
            if len(parts) > 1:
                old_files.append(f"reactions/{parts[-1]}")
        if item.preview_video_path:
            parts = item.preview_video_path.split("/reactions/")
            if len(parts) > 1:
                old_files.append(f"reactions/{parts[-1]}")
        if old_files:
            try:
                supabase_service.client.storage.from_(settings.STORAGE_BUCKET).remove(old_files)
            except Exception as e:
                print(f"Warning: Failed to delete old files: {e}")

        # Update the item in the database
        updates = MediaItemUpdate(
            file_path=gif_url,
            thumbnail_path=gif_url,
            preview_video_path=preview_url,
            file_type="image",
            file_size=total_size,
        )
        # Append extracted caption to description if provided
        if request.caption:
            existing_desc = item.description or ""
            if existing_desc:
                updates.description = f"{existing_desc} | Caption: {request.caption}"
            else:
                updates.description = request.caption
        updated_item = await supabase_service.update_item(item_id, updates, user_id)

        return updated_item

    except HTTPException:
        raise
    except Exception as e:
        print(f"Convert to GIF error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    finally:
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


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


@router.post("/items/batch-delete")
async def batch_delete_items(
    item_ids: List[str],
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Delete multiple items at once."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        deleted_count = 0
        failed_count = 0

        for item_id in item_ids:
            try:
                await supabase_service.delete_item(item_id, user_id)
                deleted_count += 1
            except Exception as e:
                print(f"Error deleting item {item_id}: {e}")
                failed_count += 1

        return {
            "message": f"Deleted {deleted_count} items",
            "deleted": deleted_count,
            "failed": failed_count
        }
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
