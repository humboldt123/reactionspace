from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.auth import get_current_user_id_optional
from app.api import upload, items
import os

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

# Serve uploaded files
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(items.router, prefix="/api", tags=["items"])


@app.get("/")
async def root():
    return {
        "message": "ReactionSpace API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/config")
async def get_config():
    """Get public configuration settings"""
    return {
        "demo_mode": settings.DEMO_MODE,
        "supabase_configured": bool(settings.SUPABASE_URL and settings.SUPABASE_URL != "https://my-project.supabase.co")
    }


@app.get("/auth-test")
async def auth_test(user_id: str | None = Depends(get_current_user_id_optional)):
    """Debug endpoint to test auth"""
    return {
        "user_id": user_id,
        "authenticated": user_id is not None
    }
