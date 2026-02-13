import uuid
from datetime import datetime

from src.models import BaseModel


# Shared properties
class ItemBase(BaseModel):
    title: str | None = None
    content: str | None = None
    description: str | None = None  # Keep for backward compatibility


# Properties to receive on item creation
class ItemCreate(ItemBase):
    title: str
    content: str = ""


# Properties to receive on item update
class ItemUpdate(ItemBase):
    pass


# Properties shared by models stored in DB
class ItemInDBBase(ItemBase):
    id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    updated_at: datetime
    owner_id: uuid.UUID


# Properties to return to client
class Item(ItemInDBBase):
    pass


# Alias for consistency with naming convention
ItemPublic = Item


# Properties properties stored in DB
class ItemInDB(ItemInDBBase):
    pass


class ItemsPublic(BaseModel):
    data: list[Item]
    count: int


# Item Image schemas
class ItemImageBase(BaseModel):
    alt_text: str | None = None
    object_key: str


class ItemImageCreate(ItemImageBase):
    pass


class ItemImageUpdate(BaseModel):
    alt_text: str | None = None
    object_key: str | None = None


class ItemImagePublic(ItemImageBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    item_id: uuid.UUID


class ItemImagesPublic(BaseModel):
    data: list[ItemImagePublic]
    count: int
