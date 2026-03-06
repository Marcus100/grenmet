import uuid
from typing import Annotated

from fastapi import Depends, HTTPException

from src.dependencies import CurrentUser, SessionDep

from .constants import ERROR_ITEM_NOT_FOUND
from .models import Item


def get_item_by_id(session: SessionDep, id: uuid.UUID) -> Item:
    """Get item by id from path; raise 404 if not found."""
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    return item


def get_item_by_item_id(session: SessionDep, item_id: uuid.UUID) -> Item:
    """Get item by item_id from path (for /{item_id}/images routes); raise 404 if not found."""
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    return item


def get_item_owner_or_superuser(current_user: CurrentUser, item: Item) -> Item:
    """Ensure user owns the item or is superuser."""
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return item


def valid_item_for_user(
    current_user: CurrentUser,
    item: Item = Depends(get_item_by_id),
) -> Item:
    """Resolve item by path id and ensure current user can access it."""
    return get_item_owner_or_superuser(current_user, item)


def valid_item_for_user_by_item_id(
    current_user: CurrentUser,
    item: Item = Depends(get_item_by_item_id),
) -> Item:
    """Resolve item by path item_id and ensure current user can access it."""
    return get_item_owner_or_superuser(current_user, item)


ItemOwnerDep = Annotated[Item, Depends(get_item_owner_or_superuser)]
ValidItemDep = Annotated[Item, Depends(valid_item_for_user)]
ValidItemByItemIdDep = Annotated[Item, Depends(valid_item_for_user_by_item_id)]
