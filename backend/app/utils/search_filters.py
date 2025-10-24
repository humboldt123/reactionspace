import re
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class SearchFilters(BaseModel):
    """Parsed search filters from query string."""
    query: str  # The remaining text query after extracting filters
    before_date: Optional[datetime] = None
    after_date: Optional[datetime] = None
    mime_types: list[str] = []  # e.g., ["image/gif", "video/mp4"]


def parse_search_query(raw_query: str) -> SearchFilters:
    """
    Parse search query and extract filters.

    Supported filters:
    - before:YYYY-MM-DD - Show results before this date
    - after:YYYY-MM-DD - Show results after this date
    - is:image - Filter by type (image/video)
    - is:video - Filter by type
    - is:image/gif - Filter by specific MIME type
    - is:image/png - Filter by specific MIME type

    Examples:
    - "mario before:2024-12-01" -> query="mario", before_date=2024-12-01
    - "is:image/gif animated" -> query="animated", mime_types=["image/gif"]
    - "meme after:2024-01-01 before:2024-12-31" -> query="meme", date range
    """
    filters = SearchFilters(query="")
    remaining_query_parts = []

    # Split query into words
    words = raw_query.split()

    for word in words:
        # Check for before: filter
        before_match = re.match(r'^before:(\d{4}-\d{2}-\d{2})$', word, re.IGNORECASE)
        if before_match:
            try:
                filters.before_date = datetime.strptime(before_match.group(1), '%Y-%m-%d')
                continue
            except ValueError:
                pass  # Invalid date format, treat as regular word

        # Check for after: filter
        after_match = re.match(r'^after:(\d{4}-\d{2}-\d{2})$', word, re.IGNORECASE)
        if after_match:
            try:
                filters.after_date = datetime.strptime(after_match.group(1), '%Y-%m-%d')
                continue
            except ValueError:
                pass  # Invalid date format, treat as regular word

        # Check for is: filter
        is_match = re.match(r'^is:(.+)$', word, re.IGNORECASE)
        if is_match:
            filter_value = is_match.group(1).lower()

            # Handle shorthand types
            if filter_value == 'image':
                # Match any image/* MIME type
                filters.mime_types.append('image')
            elif filter_value == 'video':
                # Match any video/* MIME type
                filters.mime_types.append('video')
            elif filter_value == 'gif':
                # Shorthand for image/gif
                filters.mime_types.append('image/gif')
            elif '/' in filter_value:
                # Specific MIME type like image/png, video/mp4
                filters.mime_types.append(filter_value)
            else:
                # Assume it's a shorthand for image/<type>
                filters.mime_types.append(f'image/{filter_value}')
            continue

        # Not a filter, add to remaining query
        remaining_query_parts.append(word)

    # Reconstruct the text query without filters
    filters.query = ' '.join(remaining_query_parts)

    return filters
