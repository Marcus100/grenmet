"""Cash walk-ins as organisation contacts (ADR-0028, #1986 slice 1).

A cash buyer has a name or phone and never an email, so each one is a new
contact (``email_hash`` NULL): never matched, never merged, and two of them with
the same name stay two people. Online buyers have an account and are not linked
here (a later slice). No marketing consent is recorded: buying a ticket is not
an opt-in. Bookings does not gate on the contacts product either, so this
creates the contact whatever the organisation holds: erasure must reach it.
"""

from typing import cast

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import service as contacts_service

from .models import Listing, Order, Organiser

WALK_IN_SOURCE = "events"


async def organisation_for_listing(db: AsyncSession, listing_id: object) -> str | None:
    """The platform organisation behind a listing's organiser; NULL for legacy ones."""
    return await db.scalar(
        select(Organiser.organisation_id)
        .join(Listing, Listing.organiser_id == Organiser.id)
        .where(Listing.id == listing_id)
    )


async def link_walk_in(
    db: AsyncSession, order: Order, organisation_id: str | None
) -> None:
    """Give a new cash order its walk-in contact. Flushes; the caller commits.

    Nothing happens when the organiser has no organisation or the sale recorded
    neither a name nor a phone.
    """
    if organisation_id is None:
        return
    if order.buyer_name is None and order.buyer_phone is None:
        return
    contact = await contacts_service.create_without_email(
        db,
        organisation_id,
        name=order.buyer_name,
        phone=order.buyer_phone,
        source=WALK_IN_SOURCE,
    )
    order.contact_id = contact.id


async def backfill_batch(db: AsyncSession, *, limit: int) -> int:
    """Link up to ``limit`` unlinked cash walk-ins; returns how many were linked.

    Idempotent: only orders with no ``contact_id`` are selected, and each order's
    contact and link are written together. The caller commits the batch, so a
    batch that dies before its commit leaves nothing behind and a rerun picks it up.
    """
    rows = (
        await db.execute(
            select(Order, Organiser.organisation_id)
            .join(Listing, Listing.id == Order.listing_id)
            .join(Organiser, Organiser.id == Listing.organiser_id)
            .where(
                Order.channel == "outlet",
                Order.contact_id.is_(None),
                Organiser.organisation_id.is_not(None),
                or_(Order.buyer_name.is_not(None), Order.buyer_phone.is_not(None)),
            )
            .order_by(Order.id)
            .limit(limit)
            .with_for_update(of=Order, skip_locked=True)
        )
    ).all()
    for order, organisation_id in rows:
        await link_walk_in(db, order, cast(str, organisation_id))
    return len(rows)
