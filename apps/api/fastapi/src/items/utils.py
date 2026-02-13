from collections.abc import Sequence

from sqlmodel import Session, func, select

from src.auth.models import User

from .models import Item


def get_items_count_for_user(session: Session, user: User) -> int:
    """Get total count of items for a specific user."""
    if user.is_superuser:
        count_statement = select(func.count()).select_from(Item)
    else:
        count_statement = (
            select(func.count()).select_from(Item).where(Item.owner_id == user.id)
        )
    return session.exec(count_statement).one()


def get_items_for_user(
    session: Session, user: User, skip: int = 0, limit: int = 100
) -> Sequence[Item]:
    """Get items for a specific user with pagination."""
    if user.is_superuser:
        statement = select(Item).offset(skip).limit(limit)
    else:
        statement = (
            select(Item).where(Item.owner_id == user.id).offset(skip).limit(limit)
        )
    return session.exec(statement).all()


def check_item_ownership(item: Item, user: User) -> bool:
    """Check if user owns the item or is superuser."""
    return user.is_superuser or item.owner_id == user.id
