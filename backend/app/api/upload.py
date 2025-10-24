import os
import uuid
import cv2
import asyncio
import traceback
import subprocess
from typing import Optional
from PIL import Image
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from app.models.schemas import UploadResponse, MediaItemCreate
from app.services.openai_service import OpenAIService
from app.services.umap_service import UMAPService
from app.services.supabase_service import supabase_service
from app.services.twitter_service import TwitterService
from app.core.config import settings
from app.core.auth import get_current_user_id
from app.utils.aspect_ratio import calculate_aspect_ratio
from app.api.items import get_storage_info_internal

router = APIRouter()

# Global lock to prevent race conditions during UMAP computation
# When multiple uploads happen simultaneously, they must wait for each other
upload_lock = asyncio.Lock()


class TwitterUploadRequest(BaseModel):
    url: str


@router.post("/upload", response_model=UploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """
    Upload a media file (image or video).

    Flow:
    1. Validate and save file temporarily
    2. Upload to Supabase storage
    3. Use OpenAI Vision to generate caption
    4. Generate text embedding from caption
    5. Compute UMAP position from all embeddings
    6. Store in database
    """
    # Require authentication for uploads
    if not user_id:
        raise HTTPException(status_code=401, detail="You must be signed in to upload files")

    # Check if user is pro (TODO: implement proper pro check)
    is_pro = False
    max_file_size = settings.MAX_FILE_SIZE_PRO if is_pro else settings.MAX_FILE_SIZE
    storage_limit = settings.STORAGE_LIMIT_PRO if is_pro else settings.STORAGE_LIMIT

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Read file data
    file_data = await file.read()
    file_size = len(file_data)

    # Check file size limit (we'll check total size including preview later for GIFs)
    if file_size > max_file_size:
        max_size_mb = max_file_size / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_size_mb:.0f}MB for {'Pro' if is_pro else 'Free'} accounts."
        )

    # Initial storage check (will check again with preview video size for GIFs)
    storage_info = await get_storage_info_internal(user_id)
    if storage_info['used_bytes'] + file_size > storage_limit:
        used_mb = storage_info['used_bytes'] / (1024 * 1024)
        limit_mb = storage_limit / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Storage limit exceeded. You're using {used_mb:.1f}MB of {limit_mb:.0f}MB. Delete some items to free up space."
        )

    try:
        # Generate unique filename
        file_ext = file.filename.split(".")[-1]
        file_id = str(uuid.uuid4())
        file_name = f"{file_id}.{file_ext}"

        # Save temporarily for OpenAI Vision
        temp_path = f"/tmp/{file_name}"
        with open(temp_path, "wb") as f:
            f.write(file_data)

        # Determine file type
        file_type = "video" if file.content_type.startswith("video") else "image"
        is_gif = file.content_type == "image/gif"

        # Convert GIF to MP4 for board preview
        preview_video_data = None
        preview_video_size = 0
        mp4_temp_path = None
        if is_gif:
            try:
                # Convert GIF to MP4 using ffmpeg
                mp4_file_name = f"{file_id}.mp4"
                mp4_temp_path = f"/tmp/{mp4_file_name}"

                # Run ffmpeg conversion
                subprocess.run([
                    'ffmpeg', '-i', temp_path,
                    '-movflags', 'faststart',
                    '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',  # Ensure even dimensions
                    '-y',  # Overwrite output file
                    mp4_temp_path
                ], check=True, capture_output=True)

                # Read the MP4 file
                with open(mp4_temp_path, 'rb') as f:
                    preview_video_data = f.read()
                    preview_video_size = len(preview_video_data)

                print(f"Successfully converted GIF to MP4: {mp4_file_name} ({preview_video_size} bytes)")
            except Exception as e:
                print(f"Warning: Failed to convert GIF to MP4: {e}")
                # Continue without video preview - will fall back to GIF

        # For GIFs with preview videos, check total storage size
        if preview_video_size > 0:
            total_size = file_size + preview_video_size
            storage_info = await get_storage_info_internal(user_id)
            if storage_info['used_bytes'] + total_size > storage_limit:
                used_mb = storage_info['used_bytes'] / (1024 * 1024)
                limit_mb = storage_limit / (1024 * 1024)
                total_mb = total_size / (1024 * 1024)
                raise HTTPException(
                    status_code=413,
                    detail=f"Storage limit exceeded. This upload ({total_mb:.1f}MB including preview) would exceed your limit. You're using {used_mb:.1f}MB of {limit_mb:.0f}MB."
                )

        # Get actual dimensions and calculate display size
        actual_width, actual_height = 0, 0
        if file_type == "image":
            try:
                with Image.open(temp_path) as img:
                    actual_width, actual_height = img.size
            except Exception as e:
                print(f"Failed to get image dimensions: {e}")
                actual_width, actual_height = 200, 200
        else:  # video
            try:
                video = cv2.VideoCapture(temp_path)
                actual_width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
                video.release()
            except Exception as e:
                print(f"Failed to get video dimensions: {e}")
                actual_width, actual_height = 200, 200

        # Calculate display dimensions based on aspect ratio
        display_width, display_height = calculate_aspect_ratio(actual_width, actual_height)

        # Generate AI caption
        if file_type == "image":
            ai_caption = await OpenAIService.generate_caption_from_image(temp_path, file_type)
        else:
            # For videos, extract 3 random frames and analyze them
            try:
                import random

                # Open video to get frame count
                video = cv2.VideoCapture(temp_path)
                total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))

                if total_frames < 1:
                    raise Exception("Video has no frames")

                # Pick 3 random frame indices (or fewer if video is short)
                num_frames = min(3, total_frames)
                frame_indices = random.sample(range(total_frames), num_frames)
                frame_indices.sort()  # Sort for efficient seeking

                # Extract frames
                frame_paths = []
                for idx in frame_indices:
                    video.set(cv2.CAP_PROP_POS_FRAMES, idx)
                    success, frame = video.read()

                    if success:
                        frame_path = f"/tmp/{file_id}_frame_{idx}.jpg"
                        cv2.imwrite(frame_path, frame)
                        frame_paths.append(frame_path)

                video.release()

                if not frame_paths:
                    raise Exception("Failed to extract any video frames")

                # Analyze the frames
                ai_caption = await OpenAIService.generate_caption_from_video_frames(frame_paths, file_type)

                # Clean up frames
                for frame_path in frame_paths:
                    os.remove(frame_path)

            except Exception as e:
                print(f"Video frame extraction error: {e}")
                # Fallback to filename
                filename_without_ext = file.filename.rsplit('.', 1)[0] if file.filename else "Video"
                ai_caption = {
                    "name": filename_without_ext,
                    "description": f"A video reaction",
                    "keywords": "video reaction clip"
                }

        # Generate text embedding from name + description + keywords
        text_for_embedding = f"{ai_caption['name']} {ai_caption['description']} {ai_caption['keywords']}"
        embedding = await OpenAIService.generate_text_embedding(text_for_embedding)

        # Upload to Supabase storage
        storage_path = f"reactions/{file_name}"
        file_url = await supabase_service.upload_file(
            storage_path,
            file_data,
            file.content_type
        )

        # Upload MP4 preview for GIFs
        preview_video_url = None
        if preview_video_data:
            try:
                preview_storage_path = f"reactions/{file_id}.mp4"
                preview_video_url = await supabase_service.upload_file(
                    preview_storage_path,
                    preview_video_data,
                    "video/mp4"
                )
                print(f"Uploaded MP4 preview to: {preview_video_url}")

                # Clean up temp MP4 file
                if mp4_temp_path and os.path.exists(mp4_temp_path):
                    os.remove(mp4_temp_path)
            except Exception as e:
                print(f"Warning: Failed to upload MP4 preview: {e}")
                # Clean up temp MP4 file even on error
                if mp4_temp_path and os.path.exists(mp4_temp_path):
                    try:
                        os.remove(mp4_temp_path)
                    except:
                        pass

        # CRITICAL SECTION: Use lock to prevent race conditions when multiple uploads happen simultaneously
        # Without this lock, concurrent uploads would:
        # 1. All get the same set of existing embeddings
        # 2. Each compute UMAP thinking they're the "last" item
        # 3. Cause database conflicts and incorrect positioning
        async with upload_lock:
            # Get all existing embeddings to compute UMAP (filtered by user_id)
            all_embeddings_data = await supabase_service.get_all_embeddings(user_id)
            all_embeddings = [e["vector"] for e in all_embeddings_data]

            # Validate and filter embeddings - ensure all have consistent dimensions
            expected_dim = len(embedding)  # New embedding dimension
            valid_embeddings = []

            for i, emb in enumerate(all_embeddings):
                if isinstance(emb, list) and len(emb) == expected_dim:
                    valid_embeddings.append(emb)
                else:
                    print(f"Warning: Skipping embedding {i} with invalid dimension: {len(emb) if isinstance(emb, list) else 'not a list'}")

            # Add new embedding
            valid_embeddings.append(embedding)

            print(f"Processing {len(valid_embeddings)} valid embeddings (expected dim: {expected_dim})")

            # Compute 2D positions
            positions = UMAPService.compute_2d_positions(valid_embeddings)
            new_position = positions[-1]  # Last position is for new item

            # Create item in database
            # For GIFs, store total size (original + preview video)
            total_file_size = len(file_data) + preview_video_size
            item_create = MediaItemCreate(
                name=ai_caption["name"],
                description=ai_caption["description"],
                keywords=ai_caption["keywords"],
                file_path=file_url,
                thumbnail_path=file_url,  # For now, same as file_path
                preview_video_path=preview_video_url,  # MP4 preview for GIFs
                file_type=file_type,
                file_size=total_file_size,  # Total size including preview video for GIFs
                x=new_position[0],
                y=new_position[1],
                width=display_width,
                height=display_height,
                user_id=user_id  # Add user_id to the item
            )

            item = await supabase_service.create_item(item_create)

            # Store embedding
            await supabase_service.store_embedding(item.id, embedding)

        # Clean up temp file
        os.remove(temp_path)

        return UploadResponse(
            item=item,
            message=f"Successfully uploaded {file_type}"
        )

    except Exception as e:
        # Log full traceback for debugging
        print(f"Upload error for file {file.filename}:")
        print(traceback.format_exc())

        # Clean up temp file if it exists
        try:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                os.remove(temp_path)
        except:
            pass

        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/upload/twitter", response_model=UploadResponse)
async def upload_from_twitter(
    request: TwitterUploadRequest,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """
    Download and upload media from a Twitter/X link.

    Flow:
    1. Download media from Twitter using yt-dlp
    2. Convert MP4 to GIF if it's a GIF tweet (Twitter stores GIFs as MP4s)
    3. Upload to Supabase storage
    4. Use OpenAI Vision to generate caption
    5. Generate text embedding from caption
    6. Compute UMAP position from all embeddings
    7. Store in database
    """
    # Require authentication for uploads
    if not user_id:
        raise HTTPException(status_code=401, detail="You must be signed in to upload files")

    # Check if user is pro (TODO: implement proper pro check)
    is_pro = False
    max_file_size = settings.MAX_FILE_SIZE_PRO if is_pro else settings.MAX_FILE_SIZE
    storage_limit = settings.STORAGE_LIMIT_PRO if is_pro else settings.STORAGE_LIMIT

    temp_path = None
    gif_path = None

    try:
        print(f"Downloading from Twitter: {request.url}")

        # Download from Twitter - returns list of files
        downloaded_files = TwitterService.download_from_twitter(request.url)

        print(f"Downloaded {len(downloaded_files)} file(s) from Twitter")

        # Check total size of all files before processing
        total_size = 0
        for temp_path_check, _, _, _ in downloaded_files:
            if os.path.exists(temp_path_check):
                total_size += os.path.getsize(temp_path_check)

        # Check if any single file exceeds limit
        for temp_path_check, _, _, _ in downloaded_files:
            if os.path.exists(temp_path_check):
                file_size = os.path.getsize(temp_path_check)
                if file_size > max_file_size:
                    max_size_mb = max_file_size / (1024 * 1024)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. One or more files exceed {max_size_mb:.0f}MB limit for {'Pro' if is_pro else 'Free'} accounts."
                    )

        # Check user storage limit
        storage_info = await get_storage_info_internal(user_id)
        if storage_info['used_bytes'] + total_size > storage_limit:
            used_mb = storage_info['used_bytes'] / (1024 * 1024)
            limit_mb = storage_limit / (1024 * 1024)
            total_mb = total_size / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"Storage limit exceeded. This upload ({total_mb:.1f}MB) would exceed your limit. You're using {used_mb:.1f}MB of {limit_mb:.0f}MB."
            )

        # Process each file and upload
        uploaded_items = []

        for file_idx, (temp_path, file_type, content_type, tweet_text) in enumerate(downloaded_files):
            print(f"Processing file {file_idx + 1}/{len(downloaded_files)}: {temp_path} (type: {file_type})")
            if tweet_text:
                print(f"Tweet text: {tweet_text[:100]}...")

            gif_path = None
            mp4_preview_path = None
            mp4_preview_size = 0

            # Check if this is a Twitter GIF (which is stored as MP4)
            # Twitter GIFs are typically short, looping MP4s
            # We'll convert MP4 videos to GIFs if they're short enough (< 10 seconds)
            is_twitter_gif = False
            if file_type == "video" and content_type == "video/mp4":
                try:
                    video = cv2.VideoCapture(temp_path)
                    fps = video.get(cv2.CAP_PROP_FPS)
                    frame_count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
                    duration = frame_count / fps if fps > 0 else 0
                    video.release()

                    # If video is short (< 10 seconds), treat it as a GIF
                    if duration < 10:
                        print(f"Video is {duration:.2f}s, converting to GIF")
                        is_twitter_gif = True
                except Exception as e:
                    print(f"Failed to check video duration: {e}")

            # Convert MP4 to GIF if it's a Twitter GIF
            if is_twitter_gif:
                try:
                    gif_path = TwitterService.convert_mp4_to_gif(temp_path)
                    print(f"Converted MP4 to GIF: {gif_path}")

                    # Keep MP4 as preview video
                    mp4_preview_path = temp_path
                    temp_path = gif_path  # Use GIF as main file
                    file_type = "image"
                    content_type = "image/gif"
                except Exception as e:
                    print(f"Warning: Failed to convert to GIF: {e}")
                    # Continue with MP4
                    mp4_preview_path = None
            else:
                mp4_preview_path = None

            # Get media dimensions
            actual_width, actual_height = TwitterService.get_media_dimensions(temp_path, file_type)

            # Calculate display dimensions based on aspect ratio
            display_width, display_height = calculate_aspect_ratio(actual_width, actual_height)

            # Read file data
            with open(temp_path, 'rb') as f:
                file_data = f.read()

            # Generate AI caption
            if file_type == "image":
                ai_caption = await OpenAIService.generate_caption_from_image(temp_path, file_type)

                # Append tweet text to description if available
                if tweet_text:
                    ai_caption["description"] = f"{ai_caption['description']} - Tweet: {tweet_text}"
            else:
                # For videos, extract 3 random frames and analyze them
                try:
                    import random

                    # Open video to get frame count
                    video = cv2.VideoCapture(temp_path)
                    total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))

                    if total_frames < 1:
                        raise Exception("Video has no frames")

                    # Pick 3 random frame indices (or fewer if video is short)
                    num_frames = min(3, total_frames)
                    frame_indices = random.sample(range(total_frames), num_frames)
                    frame_indices.sort()

                    # Extract frames
                    frame_paths = []
                    file_id = str(uuid.uuid4())
                    for idx in frame_indices:
                        video.set(cv2.CAP_PROP_POS_FRAMES, idx)
                        success, frame = video.read()

                        if success:
                            frame_path = f"/tmp/{file_id}_frame_{idx}.jpg"
                            cv2.imwrite(frame_path, frame)
                            frame_paths.append(frame_path)

                    video.release()

                    if not frame_paths:
                        raise Exception("Failed to extract any video frames")

                    # Analyze the frames
                    ai_caption = await OpenAIService.generate_caption_from_video_frames(frame_paths, file_type)

                    # Clean up frames
                    for frame_path in frame_paths:
                        os.remove(frame_path)

                except Exception as e:
                    print(f"Video frame extraction error: {e}")
                    # Fallback keywords
                    ai_caption = {
                        "name": "Twitter Video",
                        "description": "A video from Twitter",
                        "keywords": "twitter video clip"
                    }

                # Append tweet text to description if available
                if tweet_text:
                    ai_caption["description"] = f"{ai_caption['description']} - Tweet: {tweet_text}"

            # Generate text embedding from name + description + keywords
            text_for_embedding = f"{ai_caption['name']} {ai_caption['description']} {ai_caption['keywords']}"
            embedding = await OpenAIService.generate_text_embedding(text_for_embedding)

            # Generate unique filename for storage
            file_id = str(uuid.uuid4())
            file_ext = content_type.split('/')[-1]
            if file_ext == 'jpeg':
                file_ext = 'jpg'
            file_name = f"{file_id}.{file_ext}"

            # Upload to Supabase storage
            storage_path = f"reactions/{file_name}"
            file_url = await supabase_service.upload_file(
                storage_path,
                file_data,
                content_type
            )

            # Upload MP4 preview for converted GIFs
            preview_video_url = None
            if mp4_preview_path and os.path.exists(mp4_preview_path):
                try:
                    with open(mp4_preview_path, 'rb') as f:
                        mp4_data = f.read()
                        mp4_preview_size = len(mp4_data)

                    preview_storage_path = f"reactions/{file_id}.mp4"
                    preview_video_url = await supabase_service.upload_file(
                        preview_storage_path,
                        mp4_data,
                        "video/mp4"
                    )
                    print(f"Uploaded MP4 preview to: {preview_video_url} ({mp4_preview_size} bytes)")
                except Exception as e:
                    print(f"Warning: Failed to upload MP4 preview: {e}")
                    mp4_preview_size = 0

            # CRITICAL SECTION: Use lock to prevent race conditions
            async with upload_lock:
                # Get all existing embeddings to compute UMAP (filtered by user_id)
                all_embeddings_data = await supabase_service.get_all_embeddings(user_id)
                all_embeddings = [e["vector"] for e in all_embeddings_data]

                # Validate and filter embeddings
                expected_dim = len(embedding)
                valid_embeddings = []

                for i, emb in enumerate(all_embeddings):
                    if isinstance(emb, list) and len(emb) == expected_dim:
                        valid_embeddings.append(emb)
                    else:
                        print(f"Warning: Skipping embedding {i} with invalid dimension")

                # Add new embedding
                valid_embeddings.append(embedding)

                print(f"Processing {len(valid_embeddings)} valid embeddings (expected dim: {expected_dim})")

                # Compute 2D positions
                positions = UMAPService.compute_2d_positions(valid_embeddings)
                new_position = positions[-1]

                # Create item in database
                # For GIFs, store total size (original + preview video)
                total_file_size = len(file_data) + mp4_preview_size
                item_create = MediaItemCreate(
                    name=ai_caption["name"],
                    description=ai_caption["description"],
                    keywords=ai_caption["keywords"],
                    file_path=file_url,
                    thumbnail_path=file_url,
                    preview_video_path=preview_video_url,
                    file_type=file_type,
                    file_size=total_file_size,  # Total size including preview video for GIFs
                    x=new_position[0],
                    y=new_position[1],
                    width=display_width,
                    height=display_height,
                    user_id=user_id
                )

                item = await supabase_service.create_item(item_create)

                # Store embedding
                await supabase_service.store_embedding(item.id, embedding)

            uploaded_items.append(item)
            print(f"Uploaded file {file_idx + 1}/{len(downloaded_files)}: {item.name}")

            # Clean up temp files for this iteration
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if gif_path and gif_path != temp_path and os.path.exists(gif_path):
                os.remove(gif_path)
            if mp4_preview_path and mp4_preview_path != temp_path and os.path.exists(mp4_preview_path):
                os.remove(mp4_preview_path)

        print(f"Successfully uploaded {len(uploaded_items)} files from Twitter")

        # Return the first uploaded item (API currently expects single item response)
        if uploaded_items:
            return UploadResponse(
                item=uploaded_items[0],
                message=f"Successfully uploaded {len(uploaded_items)} file(s) from Twitter"
            )
        else:
            raise Exception("No files were uploaded")

    except Exception as e:
        # Log full traceback for debugging
        print(f"Twitter upload error for URL {request.url}:")
        print(traceback.format_exc())

        # Clean up temp files if they exist
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if gif_path and os.path.exists(gif_path):
                os.remove(gif_path)
        except:
            pass

        raise HTTPException(status_code=500, detail=f"Twitter upload failed: {str(e)}")
