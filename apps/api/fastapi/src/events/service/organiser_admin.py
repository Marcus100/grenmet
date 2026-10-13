"""Organiser-side listing management."""

import re
import secrets
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import schemas
from ..exceptions import EventsConflict, EventsForbidden, EventsNotFound
from ..models import (
    Group,
    Listing,
    Organiser,
    OrganiserMember,
    TicketTier,
)
from .common import _naive_utc
from .discover import _cards, _group, _group_summaries, _organiser_public, _tiers

# --- Organiser management -------------------------------------------------------------------


async def _my_organiser(db: AsyncSession, user: User) -> Organiser:
    organiser = await db.scalar(
        select(Organiser)
        .join(OrganiserMember, OrganiserMember.organiser_id == Organiser.id)
        .where(OrganiserMember.user_id == user.id)
        .order_by(Organiser.name)
        .limit(1)
    )
    if organiser is None:
        raise EventsForbidden("You're not a member of an organiser yet")
    return organiser


async def _managed(
    db: AsyncSession, listing: Listing, user: User
) -> schemas.ManagedListing:
    organiser = await db.get(Organiser, listing.organiser_id)
    assert organiser is not None
    card = (await _cards(db, [(listing, organiser.slug)], user.id))[0]
    group = await db.get(Group, listing.group_id) if listing.group_id else None
    return schemas.ManagedListing(
        **card.model_dump(),
        description=listing.description,
        capacity=listing.capacity,
        organiser=await _organiser_public(db, organiser, user.id),
        group=(await _group_summaries(db, [group], user.id))[0] if group else None,
        tiers=await _tiers(db, listing.id),
        status=listing.status,  # type: ignore[arg-type]
        visibility=listing.visibility,  # type: ignore[arg-type]
    )


async def managed_organiser(db: AsyncSession, user: User) -> schemas.ManagedOrganiser:
    organiser = await _my_organiser(db, user)
    listings = (
        await db.scalars(
            select(Listing)
            .where(Listing.organiser_id == organiser.id)
            .order_by(Listing.starts_at)
        )
    ).all()
    public = await _organiser_public(db, organiser, user.id)
    return schemas.ManagedOrganiser(
        **public.model_dump(),
        listings=[await _managed(db, row, user) for row in listings],
    )


_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


async def _unique_slug(db: AsyncSession, title: str) -> str:
    base = _SLUG_STRIP.sub("-", title.lower()).strip("-")[:60] or "event"
    candidate = base
    while (
        await db.scalar(select(Listing.id).where(Listing.slug == candidate)) is not None
    ):
        candidate = f"{base}-{secrets.token_hex(2)}"
    return candidate


def _validate_listing(body: schemas.ListingUpsert) -> None:
    if body.ends_at <= body.starts_at:
        raise EventsConflict("End time must be after the start time")
    if body.admission == "ticketed":
        if not body.tiers or any(tier.price_minor <= 0 for tier in body.tiers):
            raise EventsConflict("Ticketed events need at least one priced tier")
        if sum(tier.allocation for tier in body.tiers) > body.capacity:
            raise EventsConflict("Tier allocations exceed capacity")


async def _apply_listing(
    db: AsyncSession,
    listing: Listing,
    body: schemas.ListingUpsert,
    organiser: Organiser,
) -> None:
    _validate_listing(body)
    group_id = None
    if body.group_slug:
        group = await _group(db, body.group_slug)
        group_id = group.id
    for key in (
        "title",
        "summary",
        "description",
        "category",
        "parish",
        "venue",
        "admission",
        "capacity",
        "recurrence",
        "visibility",
        "status",
    ):
        setattr(listing, key, getattr(body, key))
    listing.starts_at = _naive_utc(body.starts_at)
    listing.ends_at = _naive_utc(body.ends_at)
    listing.tags = [tag.strip().lower()[:30] for tag in body.tags if tag.strip()]
    listing.group_id = group_id
    listing.organiser_id = organiser.id
    listing.updated_at = utc_now()
    db.add(listing)
    await db.flush()
    await db.execute(delete(TicketTier).where(TicketTier.listing_id == listing.id))
    db.add_all(
        [
            TicketTier(listing_id=listing.id, sort_order=index, **tier.model_dump())
            for index, tier in enumerate(
                body.tiers if body.admission == "ticketed" else []
            )
        ]
    )


async def create_listing(
    db: AsyncSession, user: User, body: schemas.ListingUpsert
) -> schemas.ManagedListing:
    organiser = await _my_organiser(db, user)
    listing = Listing(slug=await _unique_slug(db, body.title))
    await _apply_listing(db, listing, body, organiser)
    await db.commit()
    return await _managed(db, listing, user)


async def update_listing(
    db: AsyncSession, user: User, listing_id: uuid.UUID, body: schemas.ListingUpsert
) -> schemas.ManagedListing:
    organiser = await _my_organiser(db, user)
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.organiser_id != organiser.id:
        raise EventsNotFound("Event not found")
    await _apply_listing(db, listing, body, organiser)
    await db.commit()
    return await _managed(db, listing, user)
