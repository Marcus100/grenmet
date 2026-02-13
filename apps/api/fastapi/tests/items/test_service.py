"""Tests for items service layer."""

import uuid
from sqlmodel import Session

from src.items import service
from src.items.schemas import ItemCreate, ItemImageCreate
from tests.utils.user import create_random_user


def test_create_item(db: Session) -> None:
    """Test creating an item."""
    user = create_random_user(db)
    item_in = ItemCreate(
        title="Test Item",
        description="Test description",
        content="Test content"
    )
    
    item = service.create_item(session=db, item_in=item_in, owner_id=user.id)
    
    assert item.title == "Test Item"
    assert item.description == "Test description"
    assert item.content == "Test content"
    assert item.owner_id == user.id


def test_get_item(db: Session) -> None:
    """Test getting an item by ID."""
    user = create_random_user(db)
    item_in = ItemCreate(
        title="Test Item",
        description="Test description",
        content="Test content"
    )
    
    created_item = service.create_item(session=db, item_in=item_in, owner_id=user.id)
    retrieved_item = service.get_item(session=db, item_id=created_item.id)
    
    assert retrieved_item is not None
    assert retrieved_item.id == created_item.id
    assert retrieved_item.title == "Test Item"


def test_get_item_not_found(db: Session) -> None:
    """Test getting a non-existent item."""
    non_existent_id = uuid.uuid4()
    item = service.get_item(session=db, item_id=non_existent_id)
    
    assert item is None


def test_get_items(db: Session) -> None:
    """Test getting multiple items."""
    user = create_random_user(db)
    
    # Create multiple items
    for i in range(3):
        item_in = ItemCreate(
            title=f"Test Item {i}",
            description=f"Test description {i}",
            content=f"Test content {i}"
        )
        service.create_item(session=db, item_in=item_in, owner_id=user.id)
    
    items = service.get_items(session=db, skip=0, limit=10)
    
    assert len(items) >= 3


def test_update_item(db: Session) -> None:
    """Test updating an item."""
    user = create_random_user(db)
    item_in = ItemCreate(
        title="Original Title",
        description="Original description",
        content="Original content"
    )
    
    created_item = service.create_item(session=db, item_in=item_in, owner_id=user.id)
    
    # Update the item
    from src.items.schemas import ItemUpdate
    updated_data = ItemUpdate(
        title="Updated Title",
        description="Updated description"
    )
    
    updated_item = service.update_item(
        session=db, 
        db_item=created_item, 
        item_in=updated_data
    )
    
    assert updated_item.title == "Updated Title"
    assert updated_item.description == "Updated description"
    assert updated_item.content == "Original content"  # Should remain unchanged


def test_delete_item(db: Session) -> None:
    """Test deleting an item."""
    user = create_random_user(db)
    item_in = ItemCreate(
        title="Test Item",
        description="Test description",
        content="Test content"
    )
    
    created_item = service.create_item(session=db, item_in=item_in, owner_id=user.id)
    
    # Delete the item
    deleted_item = service.delete_item(session=db, item_id=created_item.id)
    
    assert deleted_item is not None
    assert deleted_item.id == created_item.id
    
    # Verify item is deleted
    retrieved_item = service.get_item(session=db, item_id=created_item.id)
    assert retrieved_item is None
