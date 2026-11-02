"""The ticket and money side of an event being cancelled (shared by the organiser
cancel actions and the legacy "save as cancelled" path).

The caller holds the exclusive lock on the listing row. Every Events money path
takes the listing lock first, then the order locks (by id), and only then touches
that order's tickets or payments intent. The tickets and the intent are not always
reached in the same order (this module cancels tickets before settling each
order's intent; a manual payment locks the intent before issuing tickets), but
both are only touched while holding the order's lock, or the exclusive listing
lock that waits for all of them, so no two paths can hold them crosswise.
The one lock taken across that order is a queued refund's outbox row, taken NOWAIT
(see ``order_refunds``), so it never waits for the order lock.

Money: the manual rail settles inline; a provider rail is queued on the outbox
(``order_refunds.request_refund``) and never called under these locks. Outlet cash
is handed back by hand, ticket by ticket.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException

from .. import order_fulfilment, order_payments, order_refunds
from ..models import Listing, Order, Organiser
from .ticketing import cancel_valid_tickets

logger = logging.getLogger(__name__)


@dataclass
class Settled:
    tickets_cancelled: int = 0
    refunded: int = 0
    queued: int = 0
    kept: int = 0
    failed: int = 0
    released: int = 0
    #: An order whose organiser refund is still waiting for the provider. Not failed.
    pending: int = 0


async def cancel_event_orders(
    db: AsyncSession, user: User, listing: Listing, refund: str, now: datetime
) -> Settled:
    organisation_id = await db.scalar(
        select(Organiser.organisation_id).where(Organiser.id == listing.organiser_id)
    )
    orders: list[Order] = []
    if organisation_id is not None:
        orders = list(
            await db.scalars(
                select(Order)
                .where(
                    Order.listing_id == listing.id,
                    Order.channel == "online",
                    Order.payment_method == "online",
                    Order.status.in_(("confirmed", order_fulfilment.PENDING)),
                )
                .order_by(Order.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
    result = Settled(tickets_cancelled=await cancel_valid_tickets(db, listing.id))
    if organisation_id is None:
        return result
    for order in orders:
        try:
            async with db.begin_nested():
                await _settle_order(
                    db, user, listing, organisation_id, order, refund, now, result
                )
        except order_refunds.RefundAlreadyPending:
            logger.info(
                "event order refund already pending on cancel",
                extra={"order_id": str(order.id)},
            )
            result.pending += 1
        except AppException as error:
            logger.warning(
                "event order refund failed on cancel",
                extra={"order_id": str(order.id), "reason": error.message},
            )
            result.failed += 1
    return result


async def _settle_order(
    db: AsyncSession,
    user: User,
    listing: Listing,
    organisation_id: str,
    order: Order,
    refund: str,
    now: datetime,
    result: Settled,
) -> None:
    if order.status == order_fulfilment.PENDING:
        unpaid = await order_payments.stop_collecting(
            db, organisation_id=organisation_id, order_id=order.id
        )
        if unpaid:
            order.status = "expired"
            result.released += 1
        # else: the payment just landed; the paid reaction refunds it.
        return
    if order.collected_minor - order.refunded_minor <= 0:
        return
    if not order_refunds.should_refund(
        refund, event_cancelled=True, starts_at=listing.starts_at, now=now
    ):
        result.kept += 1
        return
    outcome, _ = await order_refunds.request_refund(
        db,
        organisation_id=organisation_id,
        order=order,
        actor=user,
        reason="Event cancelled by the organiser",
        reason_code="event_cancelled",
        key=order_refunds.CANCEL_KEY,
    )
    if outcome == "refunded":
        result.refunded += 1
    elif outcome == "queued":
        result.queued += 1
