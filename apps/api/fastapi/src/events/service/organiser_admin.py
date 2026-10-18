"""Organiser-side listing management."""

import re
import secrets
import uuid
from datetime import datetime
from typing import Literal

from pydantic import TypeAdapter
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import service as organisations
from src.organisations.models import MembershipRole, OrganisationKind
from src.utils.datetime import utc_now

from .. import outbox, schemas
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

_STATUS = TypeAdapter(Literal["draft", "published", "cancelled"])
_VISIBILITY = TypeAdapter(Literal["public", "unlisted"])

# --- Organiser management -------------------------------------------------------------------


async def my_organisers(
    db: AsyncSession, user: User, org_ids: list[str]
) -> list[Organiser]:
    """Organisers the user can manage: a platform admin/owner membership, or (for
    organisers not yet linked to an organisation) a legacy ``organiser_members`` row.
    Once linked, the platform membership is authoritative."""
    return list(
        (
            await db.scalars(
                select(Organiser)
                .outerjoin(
                    OrganiserMember,
                    and_(
                        OrganiserMember.organiser_id == Organiser.id,
                        OrganiserMember.user_id == user.id,
                    ),
                )
                .where(
                    or_(
                        and_(
                            Organiser.organisation_id.is_(None),
                            OrganiserMember.user_id.is_not(None),
                        ),
                        Organiser.organisation_id.in_(org_ids),
                    )
                )
                .order_by(Organiser.name, Organiser.id)
            )
        ).all()
    )


async def _my_organiser(
    db: AsyncSession, user: User, org_ids: list[str], slug: str | None = None
) -> Organiser:
    candidates = await my_organisers(db, user, org_ids)
    organiser = next(
        (row for row in candidates if slug is None or row.slug == slug), None
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
        status=_STATUS.validate_python(listing.status),
        visibility=_VISIBILITY.validate_python(listing.visibility),
    )


async def managed_organiser(
    db: AsyncSession, user: User, org_ids: list[str], slug: str | None = None
) -> schemas.ManagedOrganiser:
    organiser = await _my_organiser(db, user, org_ids, slug)
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
        organisers=[
            schemas.OrganiserOption(
                id=row.id,
                slug=row.slug,
                name=row.name,
                organisation_id=row.organisation_id,
                verified=row.verified,
            )
            for row in await my_organisers(db, user, org_ids)
        ],
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


async def _queue_listing_effects(
    db: AsyncSession,
    listing: Listing,
    actor: User,
    *,
    before_status: str | None,
    before_starts: datetime | None,
) -> None:
    """Outbox rows for what the change means to other people (same transaction)."""
    payload = {"actor_id": str(actor.id), "starts_at": listing.starts_at.isoformat()}
    key = str(listing.id)
    if listing.status == "published" and before_status != "published":
        await outbox.enqueue(
            db,
            kind=outbox.PUBLISHED,
            entity_type="listing",
            entity_id=key,
            dedupe_key=f"listing.published:{key}",
            payload=payload,
        )
    elif listing.status == "cancelled" and before_status != "cancelled":
        await outbox.enqueue(
            db,
            kind=outbox.CANCELLED,
            entity_type="listing",
            entity_id=key,
            dedupe_key=f"listing.cancelled:{key}",
            payload=payload,
        )
    elif (
        listing.status == "published"
        and before_status == "published"
        and before_starts is not None
        and before_starts != listing.starts_at
    ):
        await outbox.enqueue(
            db,
            kind=outbox.POSTPONED,
            entity_type="listing",
            entity_id=key,
            dedupe_key=f"listing.postponed:{key}:{listing.starts_at.isoformat()}",
            payload=payload,
        )


async def create_listing(
    db: AsyncSession,
    user: User,
    body: schemas.ListingUpsert,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.ManagedListing:
    organiser = await _my_organiser(db, user, org_ids, slug)
    listing = Listing(slug=await _unique_slug(db, body.title))
    await _apply_listing(db, listing, body, organiser)
    await _queue_listing_effects(
        db, listing, user, before_status=None, before_starts=None
    )
    await db.commit()
    return await _managed(db, listing, user)


async def update_listing(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.ListingUpsert,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.ManagedListing:
    organiser = await _my_organiser(db, user, org_ids, slug)
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.organiser_id != organiser.id:
        raise EventsNotFound("Event not found")
    before_status, before_starts = listing.status, listing.starts_at
    await _apply_listing(db, listing, body, organiser)
    await _queue_listing_effects(
        db, listing, user, before_status=before_status, before_starts=before_starts
    )
    await db.commit()
    return await _managed(db, listing, user)


async def create_organiser(
    events: AsyncSession,
    platform: AsyncSession,
    user: User,
    *,
    name: str,
    slug: str | None = None,
    bio: str = "",
) -> Organiser:
    """Create an organiser backed by a new platform organisation, with the creator
    as its owner. The platform side commits first; if the Events insert then fails
    the orphan organisation is harmless and can be removed from the platform."""
    clean = name.strip()
    wanted = _SLUG_STRIP.sub("-", (slug or clean).lower()).strip("-")[:60]
    if not clean or not wanted:
        raise EventsConflict("An organiser needs a name")
    if await events.scalar(select(Organiser.id).where(Organiser.slug == wanted)):
        raise EventsConflict("That organiser address is taken")
    organisation = await organisations.create_organisation(
        platform, name=clean, kind=OrganisationKind.BUSINESS, slug=wanted
    )
    await organisations.add_member(
        platform,
        organisation_id=organisation.id,
        user_id=user.id,
        role=MembershipRole.OWNER,
    )
    await platform.commit()
    organiser = Organiser(
        slug=wanted, name=clean, bio=bio, organisation_id=organisation.id
    )
    events.add(organiser)
    await events.commit()
    return organiser


async def request_organiser(
    events: AsyncSession,
    platform: AsyncSession,
    user: User,
    body: schemas.OrganiserCreate,
) -> schemas.OrganiserPublic:
    """Self-service organiser account: created unverified (pending) with the member
    as owner. One pending request per member; a moderator verifies it."""
    owned = await organisations.list_managed_organisation_ids(platform, user.id)
    if owned and await events.scalar(
        select(Organiser.id).where(
            Organiser.organisation_id.in_(owned), Organiser.verified.is_(False)
        )
    ):
        raise EventsConflict("Your organiser request is awaiting review")
    organiser = await create_organiser(
        events, platform, user, name=body.name, slug=body.slug, bio=body.bio
    )
    return await _organiser_public(events, organiser, user.id)


async def organiser_public(
    db: AsyncSession, organiser: Organiser, viewer_id: uuid.UUID
) -> schemas.OrganiserPublic:
    return await _organiser_public(db, organiser, viewer_id)


async def pending_organisers(db: AsyncSession) -> list[Organiser]:
    return list(
        (
            await db.scalars(
                select(Organiser)
                .where(Organiser.verified.is_(False))
                .where(Organiser.organisation_id.is_not(None))
                .order_by(Organiser.created_at, Organiser.id)
            )
        ).all()
    )


async def review_organiser(
    db: AsyncSession, organiser_id: uuid.UUID, verified: bool, actor: User
) -> Organiser:
    organiser = await db.get(Organiser, organiser_id)
    if organiser is None:
        raise EventsNotFound("Organiser not found")
    was_verified = organiser.verified
    organiser.verified = verified
    db.add(organiser)
    if verified and not was_verified:
        await outbox.enqueue(
            db,
            kind=outbox.ORGANISER_APPROVED,
            entity_type="organiser",
            entity_id=str(organiser.id),
            dedupe_key=f"organiser.approved:{organiser.id}",
            payload={"actor_id": str(actor.id)},
        )
    await db.commit()
    return organiser
