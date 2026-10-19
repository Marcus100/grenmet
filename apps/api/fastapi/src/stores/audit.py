"""Stores change-history registrations: tracked models and who may read them."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.audit.registry import parse_uuid
from src.auth.models import User
from src.auth.policy import has_permission
from src.hr.models import EmploymentRecord
from src.hr.organisations import permitted_departments

from .models import (
    Requisition,
    RequisitionLine,
    StockLevel,
    StockMovement,
    StoreItem,
    StoreLocation,
)


async def _organisation_of(session: AsyncSession, actor: User) -> str | None:
    organisation_id: str | None = await session.scalar(
        select(EmploymentRecord.organisation_id).where(
            EmploymentRecord.user_id == actor.id
        )
    )
    return organisation_id


def _catalogue(model: type[StoreItem | StoreLocation]) -> registry.ReadCheck:
    """Items and locations: anyone with stores.view in the record's organisation."""

    async def check(session: AsyncSession, actor: User, entity_id: str) -> bool:
        record_id = parse_uuid(entity_id)
        if record_id is None or not has_permission(
            current_user=actor, permission_key="stores.view"
        ):
            return False
        record = await session.get(model, record_id)
        if record is None:
            return False
        organisation_id = getattr(record, "organisation_id", None)
        return actor.is_superuser or organisation_id == await _organisation_of(
            session, actor
        )

    return check


async def _requisition(session: AsyncSession, actor: User, entity_id: str) -> bool:
    record_id: uuid.UUID | None = parse_uuid(entity_id)
    record = await session.get(Requisition, record_id) if record_id else None
    if record is None:
        return False
    if record.requester_user_id == actor.id:
        return True
    for key in ("stores.approve", "stores.manage"):
        if has_permission(current_user=actor, permission_key=key) and (
            record.department_id
            in await permitted_departments(session, actor, record.organisation_id, key)
        ):
            return True
    return False


def register() -> None:
    registry.register_entity("stores_item", _catalogue(StoreItem))
    registry.track(StoreItem, record_type="stores_item", label="Stock item")
    registry.track(
        StockLevel,
        record_type="stock_level",
        entity_type="stores_item",
        entity_id_attr="item_id",
        label="Stock level",
    )
    registry.track(
        StockMovement,
        record_type="stock_movement",
        entity_type="stores_item",
        entity_id_attr="item_id",
        label="Stock movement",
    )
    registry.register_entity("store_location", _catalogue(StoreLocation))
    registry.track(StoreLocation, record_type="store_location", label="Store location")
    registry.register_entity("stores_requisition", _requisition)
    registry.track(
        Requisition, record_type="stores_requisition", label="Stores requisition"
    )
    registry.track(
        RequisitionLine,
        record_type="stores_requisition_line",
        entity_type="stores_requisition",
        entity_id_attr="requisition_id",
        label="Requisition line",
    )
