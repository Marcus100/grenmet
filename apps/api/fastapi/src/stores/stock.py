"""Stock ledger: the only code that changes a stock level.

Every change locks the level row, refuses to go below zero and writes a
``StockMovement`` in the same transaction. Callers commit.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.datetime import utc_now

from .exceptions import InsufficientStockError
from .models import MovementKind, StockLevel, StockMovement, StoreItem


async def locked_level(
    session: AsyncSession, item_id: uuid.UUID, location_id: uuid.UUID
) -> StockLevel:
    await session.execute(
        pg_insert(StockLevel)
        .values(
            item_id=item_id, location_id=location_id, quantity=0, updated_at=utc_now()
        )
        .on_conflict_do_nothing()
    )
    return await session.scalar(
        select(StockLevel)
        .where(StockLevel.item_id == item_id, StockLevel.location_id == location_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )  # type: ignore[return-value]


async def apply_movement(
    session: AsyncSession,
    *,
    item: StoreItem,
    location_id: uuid.UUID,
    kind: MovementKind,
    delta: int,
    actor_id: uuid.UUID,
    reason: str | None = None,
    requisition_id: uuid.UUID | None = None,
) -> StockMovement | None:
    """Apply ``delta`` to the level; returns the ledger row (None when delta is 0)."""
    level = await locked_level(session, item.id, location_id)
    balance = level.quantity + delta
    if balance < 0:
        raise InsufficientStockError(item.name, level.quantity, -delta)
    if delta == 0:
        return None
    level.quantity = balance
    level.updated_at = utc_now()
    movement = StockMovement(
        organisation_id=item.organisation_id,
        item_id=item.id,
        location_id=location_id,
        kind=kind,
        quantity_delta=delta,
        balance_after=balance,
        reason=reason,
        requisition_id=requisition_id,
        created_by_user_id=actor_id,
    )
    session.add(movement)
    return movement
