import numpy as np
from umap import UMAP
from typing import List, Tuple
from app.core.config import settings


class UMAPService:
    @staticmethod
    def compute_2d_positions(embeddings: List[List[float]]) -> List[Tuple[float, float]]:
        """
        Reduce high-dimensional embeddings to 2D coordinates using UMAP.
        Returns list of (x, y) tuples.
        """
        if len(embeddings) < 2:
            # Not enough data for UMAP, return random position
            return [(0.0, 0.0)] if len(embeddings) == 1 else []

        if len(embeddings) == 2:
            # For exactly 2 items, just place them apart manually
            # UMAP with 2 points can be unstable
            return [(-500.0, 0.0), (500.0, 0.0)]

        # Convert to numpy array
        X = np.array(embeddings)

        # UMAP requires: 2 <= n_neighbors < n_samples
        # For small datasets, use n_samples - 1
        n_neighbors = min(max(2, len(embeddings) - 1), settings.UMAP_N_NEIGHBORS)

        try:
            # Configure UMAP
            reducer = UMAP(
                n_neighbors=n_neighbors,
                min_dist=settings.UMAP_MIN_DIST,
                n_components=2,
                metric=settings.UMAP_METRIC,
                random_state=42
            )

            # Fit and transform
            embedding_2d = reducer.fit_transform(X)

            # Scale to canvas coordinates (spread them out)
            # Handle edge cases where all points are at the same location
            std = embedding_2d.std(axis=0)

            # If std is very small, spread them out randomly
            if std.size > 0 and np.any(std < 1e-6):
                # Add small random jitter to spread them out
                embedding_2d = embedding_2d + np.random.randn(*embedding_2d.shape) * 200
            elif std.size > 0:
                # Normalize to [-1, 1] then scale by 1000 for good spacing
                mean = embedding_2d.mean(axis=0)
                embedding_2d = (embedding_2d - mean) / (std + 1e-8)
                embedding_2d = embedding_2d * 1000

            return [(float(x), float(y)) for x, y in embedding_2d]

        except Exception as e:
            print(f"UMAP error: {e}, using random positions")
            # Fallback: spread items randomly in a circle
            angles = np.linspace(0, 2 * np.pi, len(embeddings), endpoint=False)
            radius = 600
            return [(float(radius * np.cos(a)), float(radius * np.sin(a))) for a in angles]
