import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # OpenAI
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # App settings
    APP_NAME: str = "ReactionSpace API"
    DEBUG: bool = True
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() == "true"

    # UMAP settings
    UMAP_N_NEIGHBORS: int = 15
    UMAP_MIN_DIST: float = 0.1
    UMAP_METRIC: str = "cosine"

    # Storage
    STORAGE_BUCKET: str = "reactions"
    MAX_FILE_SIZE: int = 25 * 1024 * 1024  # 25MB
    STORAGE_LIMIT: int = 500 * 1024 * 1024  # 500MB per user (Pro users will get more - TODO)

settings = Settings()
