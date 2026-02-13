import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from src.auth.models import User


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(
        default="", max_length=10000
    )  # Changed from description to content
    # Keep description for backward compatibility
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    owner: Optional["User"] = Relationship(back_populates="items")
    images: list["ItemImage"] = Relationship(back_populates="item", cascade_delete=True)

    class Config:
        # Add indexes for better performance
        table_args = ({"sqlite_autoincrement": True},)


# Item Image model
class ItemImageBase(SQLModel):
    alt_text: str | None = Field(default=None, max_length=255)
    object_key: str = Field(max_length=500)


class ItemImage(ItemImageBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    item_id: uuid.UUID = Field(foreign_key="item.id", index=True)
    item: "Item" = Relationship(back_populates="images")
