"""Tests for items utilities."""

from sqlmodel import Session

from src.auth.models import User
from src.items.utils import (
    get_items_count_for_user,
    get_items_for_user
)
from tests.utils.user import create_random_user


def test_get_items_count_for_user(db: Session) -> None:
    """Test getting items count for a user."""
    user = create_random_user(db)
    count = get_items_count_for_user(db, user)
    
    assert isinstance(count, int)
    assert count >= 0


def test_get_items_for_user(db: Session) -> None:
    """Test getting items for a user."""
    user = create_random_user(db)
    items = get_items_for_user(db, user, skip=0, limit=10)
    
    assert isinstance(items, list)
    assert len(items) <= 10
