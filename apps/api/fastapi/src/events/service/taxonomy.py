"""Catalogue taxonomy (ADR-0046): the category tree and listing classification rules.

Imports only models, schemas and exceptions, so ``discover`` and
``organiser_admin`` can both use it without a cycle.
"""

import uuid
from datetime import datetime
from typing import Any, cast

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.datetime import utc_now

from .. import schemas
from ..exceptions import EventsConflict
from ..models import Category, Listing

# Booking modes each legacy ``admission`` value allows. ``slots`` is refused
# (the schema rejects it with 422: reserved for the Bookings bridge).
_MODES_BY_ADMISSION = {
    "free": {"none", "external", "enquiry"},
    "rsvp": {"rsvp"},
    "ticketed": {"tickets"},
}
#: Legacy ``listings.category`` -> (category slug, subcategory slug). Mirrors the
#: migration backfill (``culture`` -> arts-culture; ``faith`` has a subcategory).
LEGACY_TO_CATEGORY: dict[str, tuple[str, str | None]] = {
    "fete": ("parties-fetes", None),
    "music": ("music-live-shows", None),
    "food": ("food-drink", None),
    "sport": ("sports-fitness", None),
    "business": ("business-learning", None),
    "tech": ("business-learning", None),
    "culture": ("arts-culture", None),
    "faith": ("community-causes", "church-faith"),
    "family": ("community-causes", None),
    "wellness": ("sports-fitness", None),
}
_DEFAULT_MODE = {"free": "none", "rsvp": "rsvp", "ticketed": "tickets"}


def public_discoverable() -> list[Any]:
    """Conditions for a listing that discovery may show (besides the date)."""
    return [
        Listing.status == "published",
        Listing.visibility == "public",
        Listing.access_type == "public",
    ]


async def category_tree(
    db: AsyncSession, now: datetime | None = None
) -> list[schemas.EventCategoryNode]:
    """Active categories with children and counts of upcoming discoverable listings."""
    current = now or utc_now()
    counted = (
        select(
            Listing.category_id.label("top"),
            Listing.subcategory_id.label("sub"),
        )
        .where(*public_discoverable(), Listing.ends_at > current)
        .subquery()
    )
    top_counts = dict(
        (
            await db.execute(
                select(counted.c.top, func.count())
                .where(counted.c.top.is_not(None))
                .group_by(counted.c.top)
            )
        )
        .tuples()
        .all()
    )
    sub_counts = dict(
        (
            await db.execute(
                select(counted.c.sub, func.count())
                .where(counted.c.sub.is_not(None))
                .group_by(counted.c.sub)
            )
        )
        .tuples()
        .all()
    )
    rows = (
        await db.scalars(
            select(Category)
            .where(Category.active.is_(True))
            .order_by(
                case((Category.parent_id.is_(None), 0), else_=1),
                Category.sort_order,
                Category.name,
            )
        )
    ).all()
    children: dict[uuid.UUID, list[schemas.EventCategorySub]] = {}
    for row in rows:
        if row.parent_id is not None:
            children.setdefault(row.parent_id, []).append(
                schemas.EventCategorySub(
                    slug=row.slug,
                    name=row.name,
                    applies_to=cast("list[schemas.ListingType]", list(row.applies_to)),
                    sort_order=row.sort_order,
                    listing_count=int(sub_counts.get(row.id, 0)),
                )
            )
    return [
        schemas.EventCategoryNode(
            slug=row.slug,
            name=row.name,
            applies_to=cast("list[schemas.ListingType]", list(row.applies_to)),
            sort_order=row.sort_order,
            listing_count=int(top_counts.get(row.id, 0)),
            children=children.get(row.id, []),
        )
        for row in rows
        if row.parent_id is None
    ]


async def slugs_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    return dict(
        (
            await db.execute(
                select(Category.id, Category.slug).where(Category.id.in_(ids))
            )
        )
        .tuples()
        .all()
    )


async def _category(db: AsyncSession, slug: str) -> Category:
    row = await db.scalar(select(Category).where(Category.slug == slug))
    if row is None:
        raise EventsConflict(f"Unknown category '{slug}'")
    return row


async def _from_legacy(
    db: AsyncSession, legacy: str | None, listing_type: str
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Classification derived from the legacy category, as the migration did."""
    slugs = LEGACY_TO_CATEGORY.get(legacy or "")
    if slugs is None:
        return None, None
    wanted = [slug for slug in slugs if slug]
    rows = {
        row.slug: row
        for row in (
            await db.scalars(select(Category).where(Category.slug.in_(wanted)))
        ).all()
    }
    category = rows.get(slugs[0])
    if category is None or listing_type not in category.applies_to:
        return None, None
    sub = rows.get(slugs[1]) if slugs[1] else None
    return category.id, sub.id if sub else None


async def _resolve_categories(
    db: AsyncSession, listing: Listing, body: schemas.ListingUpsert, listing_type: str
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """The (category_id, subcategory_id) to store, validated against the type."""
    if body.category_slug is None and body.subcategory_slug is None:
        category_id, sub_id = listing.category_id, listing.subcategory_id
        if category_id is None:
            return await _from_legacy(db, listing.category, listing_type)
        if listing_type == listing.listing_type or category_id is None:
            return category_id, sub_id
        category = await db.get(Category, category_id)
        if category is not None and listing_type not in category.applies_to:
            raise EventsConflict(
                f"The category '{category.name}' doesn't apply to {listing_type} "
                "listings; choose another"
            )
        return category_id, sub_id

    sub: Category | None = None
    if body.subcategory_slug:
        sub = await _category(db, body.subcategory_slug)
        if sub.parent_id is None:
            raise EventsConflict(f"'{sub.slug}' is a category, not a subcategory")
    if body.category_slug:
        category = await _category(db, body.category_slug)
        if category.parent_id is not None:
            raise EventsConflict(f"'{category.slug}' is a subcategory, not a category")
    elif sub is not None:
        category = await db.get(Category, sub.parent_id)  # parent of the subcategory
        if category is None:
            raise EventsConflict(f"Subcategory '{sub.slug}' has no parent category")
    else:
        return None, None
    if sub is not None and sub.parent_id != category.id:
        raise EventsConflict(
            f"Subcategory '{sub.slug}' doesn't belong to category '{category.slug}'"
        )
    for chosen, current in (
        (category, listing.category_id),
        (sub, listing.subcategory_id),
    ):
        if chosen is None:
            continue
        if not chosen.active and chosen.id != current:
            raise EventsConflict(f"The category '{chosen.name}' isn't available")
        if listing_type not in chosen.applies_to:
            raise EventsConflict(
                f"The category '{chosen.name}' doesn't apply to {listing_type} listings"
            )
    return category.id, sub.id if sub else None


def _mode_for(listing: Listing, body: schemas.ListingUpsert, admission: str) -> str:
    allowed = _MODES_BY_ADMISSION[admission]
    if body.booking_mode is not None:
        if body.booking_mode not in allowed:
            raise EventsConflict(
                f"Booking mode '{body.booking_mode}' doesn't fit admission "
                f"'{admission}' (allowed: {', '.join(sorted(allowed))})"
            )
        return body.booking_mode
    current = listing.booking_mode
    if current in allowed:
        return current
    return _DEFAULT_MODE[admission]


def _pricing_for(listing: Listing, body: schemas.ListingUpsert, mode: str) -> str:
    priced = body.admission == "ticketed" and any(t.price_minor > 0 for t in body.tiers)
    if body.pricing_type is None:
        if priced:
            return "paid"
        current = listing.pricing_type
        if current == "donation" or (
            current == "paid" and mode in {"external", "enquiry"}
        ):
            return current
        return "free"
    if priced and body.pricing_type != "paid":
        raise EventsConflict("A listing with priced tickets must have pricing 'paid'")
    if (
        body.pricing_type == "paid"
        and not priced
        and mode not in {"external", "enquiry"}
    ):
        raise EventsConflict(
            "Paid listings need a priced ticket tier, or an external ticket link"
        )
    return body.pricing_type


async def apply_classification(
    db: AsyncSession, listing: Listing, body: schemas.ListingUpsert
) -> None:
    """Validate and set the catalogue fields. Call after the legacy fields are set."""
    listing_type = body.listing_type or listing.listing_type or "event"
    if listing_type == "service":
        raise EventsConflict("Service listings aren't available yet")
    mode = _mode_for(listing, body, body.admission)

    url: str | None = None
    if mode == "external":
        previous = listing.external_ticket_url if body.booking_mode is None else None
        url = body.external_ticket_url or previous
        if not url:
            raise EventsConflict("External booking needs an https ticket link")
    elif body.external_ticket_url is not None:
        raise EventsConflict("A ticket link is only allowed with external booking")

    category_id, sub_id = await _resolve_categories(db, listing, body, listing_type)
    access = body.access_type or listing.access_type or "public"
    listing.pricing_type = _pricing_for(listing, body, mode)
    listing.listing_type = listing_type
    listing.access_type = access
    listing.booking_mode = mode
    listing.external_ticket_url = url
    listing.category_id = category_id
    listing.subcategory_id = sub_id
    if access == "private":
        # Private listings are never in discovery; they open by link only.
        listing.visibility = "unlisted"
