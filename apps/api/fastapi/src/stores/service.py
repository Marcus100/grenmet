"""Stores business logic: catalogue, locations, stock and requisitions."""

import logging
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import has_permission
from src.hr.models import Department
from src.utils.datetime import utc_now

from . import access, stock
from .access import Context
from .exceptions import (
    StoresNotFoundError,
    StoresPermissionError,
    StoresStateError,
    StoresValidationError,
)
from .models import (
    MovementKind,
    Requisition,
    RequisitionLine,
    RequisitionStatus,
    StockLevel,
    StockMovement,
    StoreItem,
    StoreLocation,
)
from .schemas import (
    ItemCreate,
    ItemUpdate,
    LocationCreate,
    LocationUpdate,
    RequisitionApprove,
    RequisitionCreate,
    RequisitionDeliver,
    RequisitionLineCreate,
    RequisitionLinePublic,
    RequisitionPublic,
    RequisitionReject,
    RequisitionUpdate,
    StockMovementCreate,
    StoresAccessPublic,
)

logger = logging.getLogger(__name__)

OPEN_FOR_DELIVERY = (
    RequisitionStatus.APPROVED,
    RequisitionStatus.PARTIALLY_DELIVERED,
)


def reference(number: int) -> str:
    return f"REQ-{number:05d}"


# --- Access --------------------------------------------------------------------


async def get_access(session: AsyncSession, user: User) -> StoresAccessPublic:
    ctx = await access.context_for(session, user)
    return StoresAccessPublic(
        organisation_id=ctx.organisation_id,
        department_id=ctx.department_id,
        can_view=has_permission(current_user=user, permission_key=access.VIEW),
        can_request=has_permission(current_user=user, permission_key=access.REQUEST),
        can_approve=bool(await access.scoped_departments(session, ctx, access.APPROVE)),
        can_manage=await access.has_organisation_wide_manage(session, ctx),
    )


# --- Catalogue -----------------------------------------------------------------


async def _item_in_org(
    session: AsyncSession, ctx: Context, item_id: uuid.UUID
) -> StoreItem:
    item = await session.get(StoreItem, item_id)
    if item is None or item.organisation_id != ctx.organisation_id:
        raise StoresNotFoundError("Item")
    return item


async def _location_in_org(
    session: AsyncSession, ctx: Context, location_id: uuid.UUID
) -> StoreLocation:
    location = await session.get(StoreLocation, location_id)
    if location is None or location.organisation_id != ctx.organisation_id:
        raise StoresNotFoundError("Store location")
    return location


async def list_items(
    session: AsyncSession,
    ctx: Context,
    *,
    q: str | None,
    category: str | None,
    active: bool | None,
    skip: int,
    limit: int,
) -> tuple[list[tuple[StoreItem, int]], int]:
    access.require(ctx, access.VIEW)
    on_hand = (
        select(StockLevel.item_id, func.sum(StockLevel.quantity).label("total"))
        .group_by(StockLevel.item_id)
        .subquery()
    )
    filters = [StoreItem.organisation_id == ctx.organisation_id]
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(or_(StoreItem.name.ilike(pattern), StoreItem.sku.ilike(pattern)))
    if category:
        filters.append(StoreItem.category == category)
    if active is not None:
        filters.append(StoreItem.is_active.is_(active))
    total = await session.scalar(
        select(func.count()).select_from(StoreItem).where(*filters)
    )
    rows = await session.execute(
        select(StoreItem, func.coalesce(on_hand.c.total, 0))
        .outerjoin(on_hand, on_hand.c.item_id == StoreItem.id)
        .where(*filters)
        .order_by(StoreItem.category, StoreItem.name)
        .offset(skip)
        .limit(limit)
    )
    return [(item, int(qty)) for item, qty in rows.all()], total or 0


async def on_hand_for(session: AsyncSession, item_id: uuid.UUID) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(StockLevel.quantity), 0)).where(
            StockLevel.item_id == item_id
        )
    )
    return int(total or 0)


async def create_item(
    session: AsyncSession, ctx: Context, payload: ItemCreate
) -> StoreItem:
    await access.require_organisation_wide_manage(session, ctx)
    if await session.scalar(
        select(StoreItem.id).where(
            StoreItem.organisation_id == ctx.organisation_id,
            func.lower(StoreItem.sku) == payload.sku.lower(),
        )
    ):
        raise StoresStateError("An item with this SKU already exists")
    audit_service.set_actor(session, ctx.user.id)
    item = StoreItem(organisation_id=ctx.organisation_id, **payload.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def update_item(
    session: AsyncSession, ctx: Context, item_id: uuid.UUID, payload: ItemUpdate
) -> StoreItem:
    await access.require_organisation_wide_manage(session, ctx)
    item = await _item_in_org(session, ctx, item_id)
    audit_service.set_actor(session, ctx.user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    await session.commit()
    await session.refresh(item)
    return item


# --- Locations -----------------------------------------------------------------


async def list_locations(session: AsyncSession, ctx: Context) -> list[StoreLocation]:
    access.require(ctx, access.VIEW)
    rows = await session.scalars(
        select(StoreLocation)
        .where(StoreLocation.organisation_id == ctx.organisation_id)
        .order_by(StoreLocation.name)
    )
    return list(rows.all())


async def create_location(
    session: AsyncSession, ctx: Context, payload: LocationCreate
) -> StoreLocation:
    await access.require_organisation_wide_manage(session, ctx)
    if await session.scalar(
        select(StoreLocation.id).where(
            StoreLocation.organisation_id == ctx.organisation_id,
            func.lower(StoreLocation.code) == payload.code.lower(),
        )
    ):
        raise StoresStateError("A store location with this code already exists")
    audit_service.set_actor(session, ctx.user.id)
    location = StoreLocation(
        organisation_id=ctx.organisation_id, **payload.model_dump()
    )
    session.add(location)
    await session.commit()
    await session.refresh(location)
    return location


async def update_location(
    session: AsyncSession,
    ctx: Context,
    location_id: uuid.UUID,
    payload: LocationUpdate,
) -> StoreLocation:
    await access.require_organisation_wide_manage(session, ctx)
    location = await _location_in_org(session, ctx, location_id)
    audit_service.set_actor(session, ctx.user.id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(location, key, value)
    await session.commit()
    await session.refresh(location)
    return location


# --- Stock ---------------------------------------------------------------------


async def list_stock(
    session: AsyncSession,
    ctx: Context,
    *,
    location_id: uuid.UUID | None,
    item_id: uuid.UUID | None,
    skip: int,
    limit: int,
) -> tuple[list[tuple[StockLevel, StoreItem, StoreLocation]], int]:
    access.require(ctx, access.VIEW)
    filters = [StoreItem.organisation_id == ctx.organisation_id]
    if location_id:
        filters.append(StockLevel.location_id == location_id)
    if item_id:
        filters.append(StockLevel.item_id == item_id)
    base = (
        select(StockLevel, StoreItem, StoreLocation)
        .join(StoreItem, StoreItem.id == StockLevel.item_id)
        .join(StoreLocation, StoreLocation.id == StockLevel.location_id)
        .where(*filters)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.execute(
        base.order_by(StoreItem.category, StoreItem.name, StoreLocation.name)
        .offset(skip)
        .limit(limit)
    )
    return [(a, b, c) for a, b, c in rows.all()], total or 0


async def record_movement(
    session: AsyncSession, ctx: Context, payload: StockMovementCreate
) -> StockMovement:
    await access.require_organisation_wide_manage(session, ctx)
    item = await _item_in_org(session, ctx, payload.item_id)
    location = await _location_in_org(session, ctx, payload.location_id)
    if not item.is_active or not location.is_active:
        raise StoresStateError("Item and store location must be active")
    reason = payload.reason.strip() if payload.reason else None
    audit_service.set_actor(session, ctx.user.id)
    if payload.kind == MovementKind.ADJUSTMENT:
        if not reason:
            raise StoresValidationError("A reason is required for an adjustment")
        level = await stock.locked_level(session, item.id, location.id)
        delta = payload.quantity - level.quantity
        if delta == 0:
            raise StoresValidationError("Counted quantity matches the current level")
    else:
        if payload.quantity == 0:
            raise StoresValidationError("Quantity must be greater than zero")
        if payload.kind == MovementKind.ISSUE and not reason:
            raise StoresValidationError("A reason is required for a manual issue")
        delta = (
            payload.quantity
            if payload.kind == MovementKind.RECEIPT
            else -payload.quantity
        )
    movement = await stock.apply_movement(
        session,
        item=item,
        location_id=location.id,
        kind=payload.kind,
        delta=delta,
        actor_id=ctx.user.id,
        reason=reason,
    )
    assert movement is not None
    await session.commit()
    await session.refresh(movement)
    logger.info(
        "Stock movement recorded",
        extra={"item_id": str(item.id), "kind": payload.kind.value, "delta": delta},
    )
    return movement


async def list_movements(
    session: AsyncSession,
    ctx: Context,
    *,
    item_id: uuid.UUID | None,
    location_id: uuid.UUID | None,
    requisition_id: uuid.UUID | None,
    skip: int,
    limit: int,
) -> tuple[list[tuple[StockMovement, StoreItem, StoreLocation]], int]:
    access.require(ctx, access.VIEW)
    filters = [StockMovement.organisation_id == ctx.organisation_id]
    if item_id:
        filters.append(StockMovement.item_id == item_id)
    if location_id:
        filters.append(StockMovement.location_id == location_id)
    if requisition_id:
        filters.append(StockMovement.requisition_id == requisition_id)
    base = (
        select(StockMovement, StoreItem, StoreLocation)
        .join(StoreItem, StoreItem.id == StockMovement.item_id)
        .join(StoreLocation, StoreLocation.id == StockMovement.location_id)
        .where(*filters)
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.execute(
        base.order_by(StockMovement.created_at.desc(), StockMovement.id)
        .offset(skip)
        .limit(limit)
    )
    return [(a, b, c) for a, b, c in rows.all()], total or 0


# --- Requisitions --------------------------------------------------------------


async def _authority(session: AsyncSession, ctx: Context) -> tuple[set[str], set[str]]:
    return (
        await access.scoped_departments(session, ctx, access.APPROVE),
        await access.scoped_departments(session, ctx, access.MANAGE),
    )


def _readable(
    ctx: Context, req: Requisition, approve: set[str], manage: set[str]
) -> bool:
    if req.organisation_id != ctx.organisation_id:
        return False
    if req.requester_user_id == ctx.user.id:
        return True
    # Drafts are private to the requester until submitted.
    return req.status != RequisitionStatus.DRAFT and (
        req.department_id in approve or req.department_id in manage
    )


async def _load(
    session: AsyncSession,
    ctx: Context,
    requisition_id: uuid.UUID,
    *,
    lock: bool = False,
) -> tuple[Requisition, set[str], set[str]]:
    access.require(ctx, access.VIEW)
    statement = select(Requisition).where(Requisition.id == requisition_id)
    if lock:
        statement = statement.with_for_update(of=Requisition).execution_options(
            populate_existing=True
        )
    req = await session.scalar(statement)
    approve, manage = await _authority(session, ctx)
    if req is None or not _readable(ctx, req, approve, manage):
        raise StoresNotFoundError("Requisition")
    return req, approve, manage


async def _validated_lines(
    session: AsyncSession, ctx: Context, lines: list[RequisitionLineCreate]
) -> list[RequisitionLine]:
    ids = [line.item_id for line in lines]
    if len(set(ids)) != len(ids):
        raise StoresValidationError("Each item may appear on a requisition only once")
    items = {
        item.id: item
        for item in (
            await session.scalars(
                select(StoreItem).where(
                    StoreItem.id.in_(ids),
                    StoreItem.organisation_id == ctx.organisation_id,
                )
            )
        ).all()
    }
    result: list[RequisitionLine] = []
    for position, line in enumerate(lines):
        item = items.get(line.item_id)
        if item is None:
            raise StoresValidationError("Unknown item on requisition")
        if not item.is_active:
            raise StoresValidationError(f"{item.name} is no longer available")
        result.append(
            RequisitionLine(
                item_id=item.id, position=position, requested_quantity=line.quantity
            )
        )
    return result


async def create_requisition(
    session: AsyncSession, ctx: Context, payload: RequisitionCreate
) -> Requisition:
    access.require(ctx, access.REQUEST)
    lines = await _validated_lines(session, ctx, payload.lines)
    audit_service.set_actor(session, ctx.user.id)
    req = Requisition(
        organisation_id=ctx.organisation_id,
        department_id=ctx.department_id,
        requester_user_id=ctx.user.id,
        purpose=payload.purpose.strip() if payload.purpose else None,
        needed_by=payload.needed_by,
        status=RequisitionStatus.SUBMITTED
        if payload.submit
        else RequisitionStatus.DRAFT,
        submitted_at=utc_now() if payload.submit else None,
        lines=lines,
    )
    session.add(req)
    await session.commit()
    await session.refresh(req)
    logger.info("Requisition created", extra={"requisition_id": str(req.id)})
    return req


def _require_owner(ctx: Context, req: Requisition) -> None:
    if req.requester_user_id != ctx.user.id:
        raise StoresPermissionError("Only the requester can do this")


async def update_requisition(
    session: AsyncSession,
    ctx: Context,
    requisition_id: uuid.UUID,
    payload: RequisitionUpdate,
) -> Requisition:
    access.require(ctx, access.REQUEST)
    req, _, _ = await _load(session, ctx, requisition_id, lock=True)
    _require_owner(ctx, req)
    if req.status != RequisitionStatus.DRAFT:
        raise StoresStateError("Only a draft requisition can be edited")
    lines = await _validated_lines(session, ctx, payload.lines)
    audit_service.set_actor(session, ctx.user.id)
    req.purpose = payload.purpose.strip() if payload.purpose else None
    req.needed_by = payload.needed_by
    req.lines.clear()
    await session.flush()
    req.lines.extend(lines)
    req.updated_at = utc_now()
    await session.commit()
    await session.refresh(req)
    return req


async def submit_requisition(
    session: AsyncSession, ctx: Context, requisition_id: uuid.UUID
) -> Requisition:
    access.require(ctx, access.REQUEST)
    req, _, _ = await _load(session, ctx, requisition_id, lock=True)
    _require_owner(ctx, req)
    if req.status != RequisitionStatus.DRAFT:
        raise StoresStateError("Only a draft requisition can be submitted")
    audit_service.set_actor(session, ctx.user.id)
    req.status = RequisitionStatus.SUBMITTED
    req.submitted_at = utc_now()
    await session.commit()
    await session.refresh(req)
    return req


async def cancel_requisition(
    session: AsyncSession, ctx: Context, requisition_id: uuid.UUID
) -> Requisition:
    req, _, _ = await _load(session, ctx, requisition_id, lock=True)
    _require_owner(ctx, req)
    if req.status not in (RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED):
        raise StoresStateError("Only a draft or submitted requisition can be cancelled")
    audit_service.set_actor(session, ctx.user.id)
    req.status = RequisitionStatus.CANCELLED
    await session.commit()
    await session.refresh(req)
    return req


def _require_decider(ctx: Context, req: Requisition, approve: set[str]) -> None:
    if req.requester_user_id == ctx.user.id:
        raise StoresPermissionError("A requester cannot decide their own requisition")
    if req.department_id not in approve:
        raise StoresPermissionError("No approval authority for this department")
    if req.status != RequisitionStatus.SUBMITTED:
        raise StoresStateError("Only a submitted requisition can be decided")


async def approve_requisition(
    session: AsyncSession,
    ctx: Context,
    requisition_id: uuid.UUID,
    payload: RequisitionApprove,
) -> Requisition:
    req, approve, _ = await _load(session, ctx, requisition_id, lock=True)
    _require_decider(ctx, req, approve)
    by_id = {line.id: line for line in req.lines}
    overrides = {
        entry.line_id: entry.approved_quantity for entry in payload.lines or []
    }
    if len(overrides) != len(payload.lines or []):
        raise StoresValidationError("A line appears more than once")
    if not set(overrides) <= set(by_id):
        raise StoresValidationError("Unknown line on requisition")
    for line in req.lines:
        quantity = overrides.get(line.id, line.requested_quantity)
        if quantity > line.requested_quantity:
            raise StoresValidationError("Cannot approve more than was requested")
        line.approved_quantity = quantity
    if not any(line.approved_quantity for line in req.lines):
        raise StoresValidationError(
            "Approve at least one line or reject the requisition"
        )
    audit_service.set_actor(session, ctx.user.id)
    req.status = RequisitionStatus.APPROVED
    req.decided_at = utc_now()
    req.decided_by_user_id = ctx.user.id
    req.decision_note = payload.note.strip() if payload.note else None
    await session.commit()
    await session.refresh(req)
    logger.info("Requisition approved", extra={"requisition_id": str(req.id)})
    return req


async def reject_requisition(
    session: AsyncSession,
    ctx: Context,
    requisition_id: uuid.UUID,
    payload: RequisitionReject,
) -> Requisition:
    req, approve, _ = await _load(session, ctx, requisition_id, lock=True)
    _require_decider(ctx, req, approve)
    audit_service.set_actor(session, ctx.user.id)
    req.status = RequisitionStatus.REJECTED
    req.decided_at = utc_now()
    req.decided_by_user_id = ctx.user.id
    req.decision_note = payload.note
    await session.commit()
    await session.refresh(req)
    logger.info("Requisition rejected", extra={"requisition_id": str(req.id)})
    return req


async def deliver_requisition(
    session: AsyncSession,
    ctx: Context,
    requisition_id: uuid.UUID,
    payload: RequisitionDeliver,
) -> Requisition:
    req, _, manage = await _load(session, ctx, requisition_id, lock=True)
    if req.department_id not in manage:
        raise StoresPermissionError("No stores authority for this department")
    if req.status not in OPEN_FOR_DELIVERY:
        raise StoresStateError("Only an approved requisition can be delivered")
    location = await _location_in_org(session, ctx, payload.location_id)
    if not location.is_active:
        raise StoresStateError("Store location is not active")
    by_id = {line.id: line for line in req.lines}
    quantities: dict[uuid.UUID, int] = {}
    for entry in payload.lines:
        line = by_id.get(entry.line_id)
        if line is None:
            raise StoresValidationError("Unknown line on requisition")
        if entry.line_id in quantities:
            raise StoresValidationError("A line appears more than once")
        outstanding = (line.approved_quantity or 0) - line.delivered_quantity
        if entry.quantity > outstanding:
            raise StoresValidationError(
                f"{line.item.name}: only {outstanding} still to deliver"
            )
        quantities[entry.line_id] = entry.quantity
    audit_service.set_actor(session, ctx.user.id)
    note = payload.note.strip() if payload.note else None
    label = reference(req.number) + (f": {note}" if note else "")
    # Lock stock rows in a stable order so concurrent deliveries cannot deadlock.
    for line in sorted(
        (by_id[line_id] for line_id in quantities), key=lambda x: str(x.item_id)
    ):
        quantity = quantities[line.id]
        await stock.apply_movement(
            session,
            item=line.item,
            location_id=location.id,
            kind=MovementKind.ISSUE,
            delta=-quantity,
            actor_id=ctx.user.id,
            reason=label,
            requisition_id=req.id,
        )
        line.delivered_quantity += quantity
    complete = all(
        line.delivered_quantity >= (line.approved_quantity or 0) for line in req.lines
    )
    req.status = (
        RequisitionStatus.DELIVERED
        if complete
        else RequisitionStatus.PARTIALLY_DELIVERED
    )
    req.delivered_at = utc_now()
    await session.commit()
    await session.refresh(req)
    logger.info(
        "Requisition delivered",
        extra={"requisition_id": str(req.id), "status": req.status.value},
    )
    return req


async def get_requisition(
    session: AsyncSession, ctx: Context, requisition_id: uuid.UUID
) -> Requisition:
    req, _, _ = await _load(session, ctx, requisition_id)
    return req


async def list_requisitions(
    session: AsyncSession,
    ctx: Context,
    *,
    statuses: list[RequisitionStatus] | None,
    department_id: str | None,
    mine: bool,
    skip: int,
    limit: int,
) -> tuple[list[Requisition], int]:
    access.require(ctx, access.VIEW)
    approve, manage = await _authority(session, ctx)
    readable = approve | manage
    visible = Requisition.requester_user_id == ctx.user.id
    if readable and not mine:
        visible = or_(
            visible,
            (Requisition.department_id.in_(readable))
            & (Requisition.status != RequisitionStatus.DRAFT),
        )
    filters = [Requisition.organisation_id == ctx.organisation_id, visible]
    if statuses:
        filters.append(Requisition.status.in_(statuses))
    if department_id:
        filters.append(Requisition.department_id == department_id)
    total = await session.scalar(
        select(func.count()).select_from(Requisition).where(*filters)
    )
    rows = await session.scalars(
        select(Requisition)
        .where(*filters)
        .order_by(Requisition.created_at.desc(), Requisition.number.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(rows.all()), total or 0


async def to_public(
    session: AsyncSession, ctx: Context, requisitions: list[Requisition]
) -> list[RequisitionPublic]:
    approve, manage = await _authority(session, ctx)
    department_ids = {req.department_id for req in requisitions}
    user_ids = {req.requester_user_id for req in requisitions}
    departments = {
        row.id: row.name
        for row in (
            await session.execute(
                select(Department.id, Department.name).where(
                    Department.id.in_(department_ids)
                )
            )
        ).all()
    }
    users = {
        user.id: user.full_name
        for user in (
            await session.scalars(select(User).where(User.id.in_(user_ids)))
        ).all()
    }
    public: list[RequisitionPublic] = []
    for req in requisitions:
        own = req.requester_user_id == ctx.user.id
        public.append(
            RequisitionPublic(
                id=req.id,
                number=req.number,
                reference=reference(req.number),
                status=req.status,
                organisation_id=req.organisation_id,
                department_id=req.department_id,
                department_name=departments.get(req.department_id, req.department_id),
                requester_user_id=req.requester_user_id,
                requester_name=users.get(req.requester_user_id, ""),
                purpose=req.purpose,
                needed_by=req.needed_by,
                lines=[
                    RequisitionLinePublic(
                        id=line.id,
                        item_id=line.item_id,
                        sku=line.item.sku,
                        item_name=line.item.name,
                        category=line.item.category,
                        unit=line.item.unit,
                        requested_quantity=line.requested_quantity,
                        approved_quantity=line.approved_quantity,
                        delivered_quantity=line.delivered_quantity,
                    )
                    for line in req.lines
                ],
                submitted_at=req.submitted_at,
                decided_at=req.decided_at,
                decided_by_user_id=req.decided_by_user_id,
                decision_note=req.decision_note,
                delivered_at=req.delivered_at,
                created_at=req.created_at,
                updated_at=req.updated_at,
                can_edit=own and req.status == RequisitionStatus.DRAFT,
                can_cancel=own
                and req.status
                in (RequisitionStatus.DRAFT, RequisitionStatus.SUBMITTED),
                can_approve=(
                    not own
                    and req.status == RequisitionStatus.SUBMITTED
                    and req.department_id in approve
                ),
                can_deliver=(
                    req.status in OPEN_FOR_DELIVERY and req.department_id in manage
                ),
            )
        )
    return public
