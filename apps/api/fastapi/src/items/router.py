import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlmodel import func, select

from src.dependencies import CurrentUser, SessionDep
from src.models import Message

from . import service
from .constants import (
    ERROR_INSUFFICIENT_PERMISSIONS,
    ERROR_ITEM_NOT_FOUND,
    SUCCESS_ITEM_DELETED,
)
from .models import Item
from .schemas import (
    ItemCreate,
    ItemImageCreate,
    ItemImagePublic,
    ItemImagesPublic,
    ItemPublic,
    ItemsPublic,
    ItemUpdate,
)

router = APIRouter(prefix="/items", tags=["items"])


@router.get(
    "/",
    response_model=ItemsPublic,
    status_code=status.HTTP_200_OK,
    summary="Retrieve items",
    description="Retrieve a list of items. Regular users see only their own items. Superusers see all items.",
    responses={
        status.HTTP_200_OK: {
            "description": "List of items retrieved successfully",
            "model": ItemsPublic,
        },
        status.HTTP_401_UNAUTHORIZED: {
            "description": "Not authenticated",
        },
    },
)
def read_items(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve items.
    """

    if current_user.is_superuser:
        count_statement = select(func.count()).select_from(Item)
        count = session.exec(count_statement).one()
        statement = select(Item).offset(skip).limit(limit)
        items = session.exec(statement).all()
    else:
        count_statement = (
            select(func.count())
            .select_from(Item)
            .where(Item.owner_id == current_user.id)
        )
        count = session.exec(count_statement).one()
        statement = (
            select(Item)
            .where(Item.owner_id == current_user.id)
            .offset(skip)
            .limit(limit)
        )
        items = session.exec(statement).all()

    return ItemsPublic(
        data=[ItemPublic.model_validate(item, from_attributes=True) for item in items],
        count=count,
    )


@router.get("/{id}", response_model=ItemPublic)
def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get item by ID.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail=ERROR_INSUFFICIENT_PERMISSIONS)
    return item


@router.post(
    "/",
    response_model=ItemPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new item",
    description="Create a new item owned by the current user. Requires authentication.",
    responses={
        status.HTTP_201_CREATED: {
            "description": "Item created successfully",
            "model": ItemPublic,
        },
        status.HTTP_401_UNAUTHORIZED: {
            "description": "Not authenticated",
        },
    },
)
def create_item(
    *, session: SessionDep, current_user: CurrentUser, item_in: ItemCreate
) -> Any:
    """
    Create new item.
    """
    item = service.create_item(
        session=session, item_in=item_in, owner_id=current_user.id
    )
    return item


@router.put("/{id}", response_model=ItemPublic)
def update_item(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    item_in: ItemUpdate,
) -> Any:
    """
    Update an item.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail=ERROR_INSUFFICIENT_PERMISSIONS)
    update_dict = item_in.model_dump(exclude_unset=True)
    item.sqlmodel_update(update_dict)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete(
    "/{id}",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Delete an item",
    description="Delete an item by ID. Users can only delete their own items unless they are superusers.",
    responses={
        status.HTTP_200_OK: {
            "description": "Item deleted successfully",
            "model": Message,
        },
        status.HTTP_400_BAD_REQUEST: {
            "description": "Not enough permissions to delete this item",
        },
        status.HTTP_401_UNAUTHORIZED: {
            "description": "Not authenticated",
        },
        status.HTTP_404_NOT_FOUND: {
            "description": "Item not found",
        },
    },
)
def delete_item(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete an item.
    """
    item = session.get(Item, id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail=ERROR_INSUFFICIENT_PERMISSIONS)
    session.delete(item)
    session.commit()
    return Message(message=SUCCESS_ITEM_DELETED)


# Item Images endpoints
@router.get("/{item_id}/images", response_model=ItemImagesPublic)
def get_item_images(
    session: SessionDep, current_user: CurrentUser, item_id: uuid.UUID
) -> Any:
    """
    Get all images for an item.
    """
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail=ERROR_INSUFFICIENT_PERMISSIONS)

    images = service.get_item_images(session=session, item_id=item_id)
    return ItemImagesPublic(
        data=[ItemImagePublic.model_validate(img) for img in images], count=len(images)
    )


@router.post("/{item_id}/images", response_model=ItemImagePublic)
def create_item_image(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    item_id: uuid.UUID,
    image_in: ItemImageCreate,
) -> Any:
    """
    Upload an image for an item.
    """
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=ERROR_ITEM_NOT_FOUND)
    if not current_user.is_superuser and (item.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail=ERROR_INSUFFICIENT_PERMISSIONS)

    image = service.create_item_image(
        session=session, item_id=item_id, image_in=image_in
    )
    return image
