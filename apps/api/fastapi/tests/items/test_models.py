"""Tests for items models."""

import uuid

from src.items.models import Item, ItemImage
from src.items.schemas import ItemCreate, ItemImageCreate


def test_item_model_creation() -> None:
    """Test Item model creation."""
    item_in = ItemCreate(
        title="Test Item",
        description="Test description",
        content="Test content"
    )

    item = Item.model_validate(item_in, update={"owner_id": "123e4567-e89b-12d3-a456-426614174000"})

    assert item.title == "Test Item"
    assert item.description == "Test description"
    assert item.content == "Test content"
    assert item.owner_id == uuid.UUID("123e4567-e89b-12d3-a456-426614174000")


def test_item_image_model_creation() -> None:
    """Test ItemImage model creation."""
    image_in = ItemImageCreate(
        object_key="test-image.jpg",
        alt_text="Test image"
    )

    image = ItemImage.model_validate(
        image_in,
        update={"item_id": "123e4567-e89b-12d3-a456-426614174000"}
    )

    assert image.object_key == "test-image.jpg"
    assert image.alt_text == "Test image"
    assert image.item_id == uuid.UUID("123e4567-e89b-12d3-a456-426614174000")
