"""
Script to clean up corrupted embeddings in the database.
Finds and deletes embeddings with incorrect dimensions.
"""
import asyncio
from app.services.supabase_service import supabase_service
from app.core.config import settings

async def cleanup_embeddings():
    """Find and delete corrupted embeddings."""

    print("Fetching all embeddings from database...")
    all_embeddings_data = await supabase_service.get_all_embeddings(user_id=None)

    print(f"Found {len(all_embeddings_data)} total embeddings")

    # Expected dimension for text-embedding-3-small
    EXPECTED_DIM = 1536

    corrupted_items = []
    valid_count = 0

    for emb_data in all_embeddings_data:
        item_id = emb_data.get("item_id")
        vector = emb_data.get("vector")

        if not isinstance(vector, list):
            print(f"  - Item {item_id}: vector is not a list (type: {type(vector)})")
            corrupted_items.append(item_id)
        elif len(vector) != EXPECTED_DIM:
            print(f"  - Item {item_id}: incorrect dimension {len(vector)} (expected {EXPECTED_DIM})")
            corrupted_items.append(item_id)
        else:
            valid_count += 1

    print(f"\nSummary:")
    print(f"  Valid embeddings: {valid_count}")
    print(f"  Corrupted embeddings: {len(corrupted_items)}")

    if not corrupted_items:
        print("\n✓ No corrupted embeddings found! Database is clean.")
        return

    print(f"\nFound {len(corrupted_items)} corrupted embeddings.")
    print("\nDeleting corrupted items...")
    for item_id in corrupted_items:
        try:
            # Delete the embedding
            supabase_service.client.table("embeddings").delete().eq("item_id", item_id).execute()

            # Delete the item
            supabase_service.client.table("items").delete().eq("id", item_id).execute()

            print(f"  ✓ Deleted item {item_id}")
        except Exception as e:
            print(f"  ✗ Failed to delete item {item_id}: {e}")

    print(f"\n✓ Cleanup complete! Deleted {len(corrupted_items)} corrupted items.")

if __name__ == "__main__":
    asyncio.run(cleanup_embeddings())
