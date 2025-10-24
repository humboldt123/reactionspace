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
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB for free users
    MAX_FILE_SIZE_PRO: int = 200 * 1024 * 1024  # 200MB for pro users
    STORAGE_LIMIT: int = 500 * 1024 * 1024  # 500MB per free user
    STORAGE_LIMIT_PRO: int = 5 * 1024 * 1024 * 1024  # 5GB per pro user
    GLOBAL_STORAGE_WARNING: int = 1 * 1024 * 1024 * 1024  # Warn when approaching 1GB free tier limit

settings = Settings()
