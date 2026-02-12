"""
One-time script to fix display dimensions for all items in the database.
Probes each video/image for actual pixel dimensions and recalculates
display width/height using calculate_aspect_ratio.
"""
import asyncio
import subprocess
import json
from app.services.supabase_service import supabase_service
from app.utils.aspect_ratio import calculate_aspect_ratio


def get_video_dimensions(url: str):
    """Use ffprobe to get video dimensions from a URL."""
    try:
        cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams', '-select_streams', 'v:0',
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return None, None
        data = json.loads(result.stdout)
        stream = data.get('streams', [{}])[0]
        return stream.get('width'), stream.get('height')
    except Exception as e:
        print(f"  ffprobe error: {e}")
        return None, None


def get_image_dimensions(url: str):
    """Use ffprobe to get image dimensions from a URL."""
    return get_video_dimensions(url)  # ffprobe works for images too


async def fix_dimensions():
    print("Fetching all items...")

    # Get all items (no user filter - fix everything)
    result = supabase_service.client.table("items").select("*").execute()
    items = result.data

    print(f"Found {len(items)} items")

    updated = 0
    skipped = 0
    failed = 0

    for item in items:
        item_id = item["id"]
        file_url = item["file_path"]
        file_type = item["file_type"]
        old_w = item.get("width", 200)
        old_h = item.get("height", 150)
        name = item.get("name", "unnamed")

        print(f"\n[{item_id[:8]}] {name} ({file_type})")

        width, height = get_video_dimensions(file_url)

        if width is None or height is None:
            print(f"  FAILED to probe dimensions, skipping")
            failed += 1
            continue

        display_w, display_h = calculate_aspect_ratio(width, height)

        if display_w == old_w and display_h == old_h:
            print(f"  OK ({old_w}x{old_h}) - no change needed")
            skipped += 1
            continue

        print(f"  Actual: {width}x{height} -> Display: {old_w}x{old_h} => {display_w}x{display_h}")

        supabase_service.client.table("items").update({
            "width": display_w,
            "height": display_h,
        }).eq("id", item_id).execute()

        updated += 1
        print(f"  UPDATED")

    print(f"\n--- Done ---")
    print(f"Updated: {updated}")
    print(f"Skipped (already correct): {skipped}")
    print(f"Failed to probe: {failed}")


if __name__ == "__main__":
    asyncio.run(fix_dimensions())
