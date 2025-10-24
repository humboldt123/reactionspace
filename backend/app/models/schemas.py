from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class MediaItemBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    file_type: str
    file_size: Optional[int] = None  # Size in bytes


class MediaItemCreate(MediaItemBase):
    file_path: str
    thumbnail_path: str
    preview_video_path: Optional[str] = None
    x: float
    y: float
    width: int = 200
    height: int = 150
    user_id: Optional[str] = None
    file_size: int  # Size in bytes


class MediaItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    manual_cluster_id: Optional[str] = None


class MediaItem(MediaItemBase):
    id: str
    user_id: Optional[str] = None
    file_path: str
    thumbnail_path: str
    preview_video_path: Optional[str] = None
    file_size: Optional[int] = None  # Size in bytes (optional for existing items)
    x: float
    y: float
    width: int = 200
    height: int = 150
    position_locked: bool = False
    manual_cluster_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    item: MediaItem
    message: str


class SearchResult(BaseModel):
    items: List[MediaItem]
    total: int


class PositionUpdate(BaseModel):
    x: float
    y: float


class AICaption(BaseModel):
    name: str
    description: str
    keywords: str
