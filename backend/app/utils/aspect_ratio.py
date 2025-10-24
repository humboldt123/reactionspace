from typing import Tuple
import math

# Common aspect ratios (width:height)
ASPECT_RATIOS = {
    'square': (1, 1),      # 1:1
    'wide': (16, 9),       # 16:9
    'tall': (9, 16),       # 9:16
    'classic': (4, 3),     # 4:3
    'portrait': (3, 4),    # 3:4
    'ultrawide': (21, 9),  # 21:9
    'ultratall': (9, 21),  # 9:21
}

# Maximum dimension for items (prevents absurd sizes)
# Capped at 200 to match the default item size
MAX_DIMENSION = 200


def calculate_aspect_ratio(width: int, height: int) -> Tuple[int, int]:
    """
    Calculate display dimensions for an item based on its aspect ratio.

    Snaps to common aspect ratios and limits to MAX_DIMENSION.
    Returns (display_width, display_height).
    """
    if width == 0 or height == 0:
        return (200, 200)  # Default square

    # Calculate actual aspect ratio
    actual_ratio = width / height

    # Handle extreme aspect ratios (prevent 1x9999 images)
    if actual_ratio > 4:  # Too wide
        actual_ratio = min(actual_ratio, 21/9)  # Cap at ultrawide
    elif actual_ratio < 0.25:  # Too tall
        actual_ratio = max(actual_ratio, 9/21)  # Cap at ultratall

    # Find closest common aspect ratio
    closest_name = 'square'
    closest_diff = float('inf')

    for name, (ratio_w, ratio_h) in ASPECT_RATIOS.items():
        ratio = ratio_w / ratio_h
        diff = abs(actual_ratio - ratio)
        if diff < closest_diff:
            closest_diff = diff
            closest_name = name

    # Get the selected ratio
    ratio_w, ratio_h = ASPECT_RATIOS[closest_name]

    # Calculate display dimensions maintaining the selected ratio
    # Fit within MAX_DIMENSION
    if ratio_w > ratio_h:
        # Landscape
        display_width = MAX_DIMENSION
        display_height = int(MAX_DIMENSION * ratio_h / ratio_w)
    elif ratio_h > ratio_w:
        # Portrait
        display_height = MAX_DIMENSION
        display_width = int(MAX_DIMENSION * ratio_w / ratio_h)
    else:
        # Square
        display_width = display_height = MAX_DIMENSION

    return (display_width, display_height)
