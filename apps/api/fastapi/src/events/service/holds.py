"""Stock held by unpaid online orders (N4b).

A ``pending_payment`` order has no tickets yet, but its items still count against
the tier's allocation until it is paid (tickets issued), expires or is cancelled.
Callers hold the tier row locks (``FOR UPDATE``) so the count cannot move between
the check and the insert.
"""

import uuid
from collections.abc import Collection

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Order, OrderItem

PENDING = "pending_payment"


async def held_by_tier(
    db: AsyncSession,
    tier_ids: Collection[uuid.UUID],
    *,
    user_id: uuid.UUID | None = None,
) -> dict[uuid.UUID, int]:
    """Tickets held by unpaid orders per tier (one account's when ``user_id``)."""
    stmt = (
        select(OrderItem.tier_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.tier_id.in_(tier_ids), Order.status == PENDING)
        .group_by(OrderItem.tier_id)
    )
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    return {row[0]: int(row[1]) for row in await db.execute(stmt)}
