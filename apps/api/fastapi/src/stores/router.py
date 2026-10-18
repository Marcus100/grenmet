import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep

from . import service
from .dependencies import StoresContext
from .models import RequisitionStatus, StoreItem, StoreLocation
from .schemas import (
    ItemCreate,
    ItemListPublic,
    ItemPublic,
    ItemUpdate,
    LocationCreate,
    LocationListPublic,
    LocationPublic,
    LocationUpdate,
    RequisitionApprove,
    RequisitionCreate,
    RequisitionDeliver,
    RequisitionListPublic,
    RequisitionPublic,
    RequisitionReject,
    RequisitionUpdate,
    StockLevelListPublic,
    StockLevelPublic,
    StockMovementCreate,
    StockMovementListPublic,
    StockMovementPublic,
    StoresAccessPublic,
)

router = APIRouter(prefix="/stores", tags=["stores"])

ERRORS = {**AUTHENTICATED, **NOT_FOUND, **CONFLICT, **BAD_REQUEST}


async def _public(
    session: SessionDep, ctx: StoresContext, requisition: Any
) -> RequisitionPublic:
    return (await service.to_public(session, ctx, [requisition]))[0]


@router.get(
    "/access",
    operation_id="storesGetAccess",
    response_model=StoresAccessPublic,
    summary="Stores access for the caller",
    description="Organisation, department and which stores actions the caller may take. UI hint only; every endpoint still enforces its permission.",
    responses=AUTHENTICATED,
)
async def get_access(*, session: SessionDep, current_user: CurrentUser) -> Any:
    return await service.get_access(session, current_user)


# --- Catalogue -----------------------------------------------------------------


@router.get(
    "/items",
    operation_id="storesListItems",
    response_model=ItemListPublic,
    summary="List stock items",
    description="Catalogue of the caller's organisation with total on-hand. Requires stores.view.",
    responses=AUTHENTICATED,
)
async def list_items(
    *,
    session: SessionDep,
    ctx: StoresContext,
    pagination: PaginationDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Any:
    rows, total = await service.list_items(
        session,
        ctx,
        q=q,
        category=category,
        active=active,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return ItemListPublic(
        data=[
            ItemPublic(
                id=item.id,
                sku=item.sku,
                name=item.name,
                category=item.category,
                unit=item.unit,
                is_active=item.is_active,
                on_hand=on_hand,
            )
            for item, on_hand in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


def _item_public(item: Any, on_hand: int) -> ItemPublic:
    return ItemPublic(
        id=item.id,
        sku=item.sku,
        name=item.name,
        category=item.category,
        unit=item.unit,
        is_active=item.is_active,
        on_hand=on_hand,
    )


@router.post(
    "/items",
    operation_id="storesCreateItem",
    response_model=ItemPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a stock item",
    description="Requires an organisation-wide stores.manage grant.",
    responses=ERRORS,
)
async def create_item(
    *, session: SessionDep, ctx: StoresContext, payload: ItemCreate
) -> Any:
    item = await service.create_item(session, ctx, payload)
    return _item_public(item, 0)


@router.patch(
    "/items/{item_id}",
    operation_id="storesUpdateItem",
    response_model=ItemPublic,
    summary="Edit or retire a stock item",
    description="Requires an organisation-wide stores.manage grant. Items are deactivated, never deleted.",
    responses=ERRORS,
)
async def update_item(
    *,
    session: SessionDep,
    ctx: StoresContext,
    item_id: uuid.UUID,
    payload: ItemUpdate,
) -> Any:
    item = await service.update_item(session, ctx, item_id, payload)
    return _item_public(item, await service.on_hand_for(session, item.id))


# --- Locations -----------------------------------------------------------------


@router.get(
    "/locations",
    operation_id="storesListLocations",
    response_model=LocationListPublic,
    summary="List store locations",
    description="Requires stores.view.",
    responses=AUTHENTICATED,
)
async def list_locations(*, session: SessionDep, ctx: StoresContext) -> Any:
    rows = await service.list_locations(session, ctx)
    return LocationListPublic(
        data=[LocationPublic.model_validate(r, from_attributes=True) for r in rows],
        count=len(rows),
    )


@router.post(
    "/locations",
    operation_id="storesCreateLocation",
    response_model=LocationPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a store location",
    description="Requires an organisation-wide stores.manage grant.",
    responses=ERRORS,
)
async def create_location(
    *, session: SessionDep, ctx: StoresContext, payload: LocationCreate
) -> Any:
    return await service.create_location(session, ctx, payload)


@router.patch(
    "/locations/{location_id}",
    operation_id="storesUpdateLocation",
    response_model=LocationPublic,
    summary="Rename or retire a store location",
    description="Requires an organisation-wide stores.manage grant.",
    responses=ERRORS,
)
async def update_location(
    *,
    session: SessionDep,
    ctx: StoresContext,
    location_id: uuid.UUID,
    payload: LocationUpdate,
) -> Any:
    return await service.update_location(session, ctx, location_id, payload)


# --- Stock ---------------------------------------------------------------------


@router.get(
    "/stock",
    operation_id="storesListStock",
    response_model=StockLevelListPublic,
    summary="List stock levels",
    description="On-hand quantity per item and location. Requires stores.view.",
    responses=AUTHENTICATED,
)
async def list_stock(
    *,
    session: SessionDep,
    ctx: StoresContext,
    pagination: PaginationDep,
    location_id: uuid.UUID | None = None,
    item_id: uuid.UUID | None = None,
) -> Any:
    rows, total = await service.list_stock(
        session,
        ctx,
        location_id=location_id,
        item_id=item_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return StockLevelListPublic(
        data=[
            StockLevelPublic(
                item_id=item.id,
                sku=item.sku,
                item_name=item.name,
                category=item.category,
                unit=item.unit,
                location_id=location.id,
                location_name=location.name,
                quantity=level.quantity,
            )
            for level, item, location in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


def _movement_public(movement: Any, item: Any, location: Any) -> StockMovementPublic:
    return StockMovementPublic(
        id=movement.id,
        item_id=item.id,
        sku=item.sku,
        item_name=item.name,
        location_id=location.id,
        location_name=location.name,
        kind=movement.kind,
        quantity_delta=movement.quantity_delta,
        balance_after=movement.balance_after,
        reason=movement.reason,
        requisition_id=movement.requisition_id,
        created_by_user_id=movement.created_by_user_id,
        created_at=movement.created_at,
    )


@router.post(
    "/stock-movements",
    operation_id="storesCreateStockMovement",
    response_model=StockMovementPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a receipt, issue or stock-count adjustment",
    description="Stock never goes below zero. Issues and adjustments need a reason. Requires an organisation-wide stores.manage grant.",
    responses=ERRORS,
)
async def create_stock_movement(
    *, session: SessionDep, ctx: StoresContext, payload: StockMovementCreate
) -> Any:
    movement = await service.record_movement(session, ctx, payload)
    item = await session.get(StoreItem, movement.item_id)
    location = await session.get(StoreLocation, movement.location_id)
    return _movement_public(movement, item, location)


@router.get(
    "/stock-movements",
    operation_id="storesListStockMovements",
    response_model=StockMovementListPublic,
    summary="List stock movements",
    description="Newest first; includes deliveries against requisitions. Requires stores.view.",
    responses=AUTHENTICATED,
)
async def list_stock_movements(
    *,
    session: SessionDep,
    ctx: StoresContext,
    pagination: PaginationDep,
    item_id: uuid.UUID | None = None,
    location_id: uuid.UUID | None = None,
    requisition_id: uuid.UUID | None = None,
) -> Any:
    rows, total = await service.list_movements(
        session,
        ctx,
        item_id=item_id,
        location_id=location_id,
        requisition_id=requisition_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return StockMovementListPublic(
        data=[_movement_public(m, i, loc) for m, i, loc in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


# --- Requisitions --------------------------------------------------------------


@router.get(
    "/requisitions",
    operation_id="storesListRequisitions",
    response_model=RequisitionListPublic,
    summary="List requisitions",
    description="The caller's own requisitions plus those of departments where they hold stores.approve or stores.manage. Requires stores.view.",
    responses=AUTHENTICATED,
)
async def list_requisitions(
    *,
    session: SessionDep,
    ctx: StoresContext,
    pagination: PaginationDep,
    status_filter: Annotated[
        list[RequisitionStatus] | None, Query(alias="status")
    ] = None,
    department_id: Annotated[str | None, Query(max_length=100)] = None,
    mine: bool = False,
) -> Any:
    rows, total = await service.list_requisitions(
        session,
        ctx,
        statuses=status_filter,
        department_id=department_id,
        mine=mine,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return RequisitionListPublic(
        data=await service.to_public(session, ctx, rows),
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/requisitions",
    operation_id="storesCreateRequisition",
    response_model=RequisitionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a requisition",
    description="Saves a draft, or submits for approval when submit is true. Always filed under the caller's own department. Requires stores.request.",
    responses=ERRORS,
)
async def create_requisition(
    *, session: SessionDep, ctx: StoresContext, payload: RequisitionCreate
) -> Any:
    return await _public(
        session, ctx, await service.create_requisition(session, ctx, payload)
    )


@router.get(
    "/requisitions/{requisition_id}",
    operation_id="storesGetRequisition",
    response_model=RequisitionPublic,
    summary="Get a requisition",
    description="Visible to the requester and department approvers or managers; anyone else gets 404.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_requisition(
    *, session: SessionDep, ctx: StoresContext, requisition_id: uuid.UUID
) -> Any:
    return await _public(
        session, ctx, await service.get_requisition(session, ctx, requisition_id)
    )


@router.patch(
    "/requisitions/{requisition_id}",
    operation_id="storesUpdateRequisition",
    response_model=RequisitionPublic,
    summary="Edit a draft requisition",
    description="Requester only, while the requisition is a draft.",
    responses=ERRORS,
)
async def update_requisition(
    *,
    session: SessionDep,
    ctx: StoresContext,
    requisition_id: uuid.UUID,
    payload: RequisitionUpdate,
) -> Any:
    return await _public(
        session,
        ctx,
        await service.update_requisition(session, ctx, requisition_id, payload),
    )


@router.post(
    "/requisitions/{requisition_id}/submit",
    operation_id="storesSubmitRequisition",
    response_model=RequisitionPublic,
    summary="Submit a draft requisition",
    description="Requester only.",
    responses=ERRORS,
)
async def submit_requisition(
    *, session: SessionDep, ctx: StoresContext, requisition_id: uuid.UUID
) -> Any:
    return await _public(
        session, ctx, await service.submit_requisition(session, ctx, requisition_id)
    )


@router.post(
    "/requisitions/{requisition_id}/cancel",
    operation_id="storesCancelRequisition",
    response_model=RequisitionPublic,
    summary="Cancel a draft or submitted requisition",
    description="Requester only.",
    responses=ERRORS,
)
async def cancel_requisition(
    *, session: SessionDep, ctx: StoresContext, requisition_id: uuid.UUID
) -> Any:
    return await _public(
        session, ctx, await service.cancel_requisition(session, ctx, requisition_id)
    )


@router.post(
    "/requisitions/{requisition_id}/approve",
    operation_id="storesApproveRequisition",
    response_model=RequisitionPublic,
    summary="Approve a submitted requisition",
    description="Needs stores.approve for the requisition's department; the requester can never approve their own. Quantities may be reduced per line.",
    responses=ERRORS,
)
async def approve_requisition(
    *,
    session: SessionDep,
    ctx: StoresContext,
    requisition_id: uuid.UUID,
    payload: RequisitionApprove,
) -> Any:
    return await _public(
        session,
        ctx,
        await service.approve_requisition(session, ctx, requisition_id, payload),
    )


@router.post(
    "/requisitions/{requisition_id}/reject",
    operation_id="storesRejectRequisition",
    response_model=RequisitionPublic,
    summary="Reject a submitted requisition",
    description="Needs stores.approve for the requisition's department; a note is required.",
    responses=ERRORS,
)
async def reject_requisition(
    *,
    session: SessionDep,
    ctx: StoresContext,
    requisition_id: uuid.UUID,
    payload: RequisitionReject,
) -> Any:
    return await _public(
        session,
        ctx,
        await service.reject_requisition(session, ctx, requisition_id, payload),
    )


@router.post(
    "/requisitions/{requisition_id}/deliver",
    operation_id="storesDeliverRequisition",
    response_model=RequisitionPublic,
    summary="Deliver approved quantities from a store location",
    description="Needs stores.manage for the requisition's department. Partial delivery is allowed; stock is decremented in the same transaction and a shortfall rejects the whole delivery.",
    responses=ERRORS,
)
async def deliver_requisition(
    *,
    session: SessionDep,
    ctx: StoresContext,
    requisition_id: uuid.UUID,
    payload: RequisitionDeliver,
) -> Any:
    return await _public(
        session,
        ctx,
        await service.deliver_requisition(session, ctx, requisition_id, payload),
    )
