from typing import Annotated

from fastapi import Depends, HTTPException

from src.dependencies import CurrentUser

from .models import Item


def get_item_owner_or_superuser(current_user: CurrentUser, item: Item) -> Item:
    """Ensure user owns the item or is superuser."""
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return item


ItemOwnerDep = Annotated[Item, Depends(get_item_owner_or_superuser)]
