"""Listings, organisers and groups: what members can browse."""

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import schemas
from ..exceptions import EventsNotFound
from ..models import (
    Announcement,
    Follow,
    Group,
    GroupMember,
    Listing,
    MemberProfile,
    Organiser,
    Rsvp,
    SavedListing,
    Thread,
    ThreadParticipant,
    TicketTier,
)
from .common import GOING_PREVIEW, _pairs, when_window
from .people import _chips, blocked_ids, get_or_create_profile

# --- Listings -----------------------------------------------------------------------


def _public_listings() -> Select[tuple[Listing, str]]:
    return (
        select(Listing, Organiser.slug)
        .join(Organiser, Organiser.id == Listing.organiser_id)
        .where(Listing.status == "published")
    )


async def _cards(
    db: AsyncSession,
    rows: Sequence[tuple[Listing, str]],
    viewer_id: uuid.UUID | None,
) -> list[schemas.ListingCard]:
    """Decorate listings with prices, going counts/previews and viewer flags."""
    if not rows:
        return []
    ids = [listing.id for listing, _ in rows]
    hidden = await blocked_ids(db, viewer_id)

    prices: dict[uuid.UUID, Any] = _pairs(
        (
            await db.execute(
                select(TicketTier.listing_id, func.min(TicketTier.price_minor))
                .where(TicketTier.listing_id.in_(ids), TicketTier.price_minor > 0)
                .group_by(TicketTier.listing_id)
            )
        ).all()
    )
    counts: dict[uuid.UUID, Any] = _pairs(
        (
            await db.execute(
                select(Rsvp.listing_id, func.count())
                .where(Rsvp.listing_id.in_(ids))
                .group_by(Rsvp.listing_id)
            )
        ).all()
    )
    preview_rows = (
        await db.execute(
            select(
                Rsvp.listing_id,
                Rsvp.user_id,
                MemberProfile.handle,
                MemberProfile.display_name,
            )
            .join(MemberProfile, MemberProfile.user_id == Rsvp.user_id)
            .where(Rsvp.listing_id.in_(ids))
            .order_by(Rsvp.created_at)
        )
    ).all()
    previews: dict[uuid.UUID, list[schemas.PersonChip]] = defaultdict(list)
    for listing_id, user_id, handle, name in preview_rows:
        if user_id in hidden or len(previews[listing_id]) >= GOING_PREVIEW:
            continue
        previews[listing_id].append(
            schemas.PersonChip(handle=handle, display_name=name)
        )

    going: set[uuid.UUID] = set()
    saved: set[uuid.UUID] = set()
    if viewer_id is not None:
        going = set(
            (
                await db.scalars(
                    select(Rsvp.listing_id).where(
                        Rsvp.user_id == viewer_id, Rsvp.listing_id.in_(ids)
                    )
                )
            ).all()
        )
        saved = set(
            (
                await db.scalars(
                    select(SavedListing.listing_id).where(
                        SavedListing.user_id == viewer_id,
                        SavedListing.listing_id.in_(ids),
                    )
                )
            ).all()
        )

    cards = []
    for listing, organiser_slug in rows:
        price = prices.get(listing.id) if listing.admission == "ticketed" else None
        currency: Literal["XCD", "USD"] = "XCD"
        cards.append(
            schemas.ListingCard(
                id=listing.id,
                slug=listing.slug,
                title=listing.title,
                summary=listing.summary,
                category=listing.category,  # type: ignore[arg-type]
                parish=listing.parish,  # type: ignore[arg-type]
                venue=listing.venue,
                starts_at=listing.starts_at,
                ends_at=listing.ends_at,
                admission=listing.admission,  # type: ignore[arg-type]
                price_from_minor=price,
                currency=currency,
                recurrence=listing.recurrence,
                tags=list(listing.tags or []),
                featured=listing.featured,
                organiser_slug=organiser_slug,
                going_count=int(counts.get(listing.id, 0)),
                going_preview=previews.get(listing.id, []),
                viewer_going=(listing.id in going) if viewer_id else None,
                viewer_saved=(listing.id in saved) if viewer_id else None,
            )
        )
    return cards


async def list_listings(
    db: AsyncSession,
    *,
    viewer_id: uuid.UUID | None,
    when: schemas.When | None = None,
    category: schemas.Category | None = None,
    parish: schemas.Parish | None = None,
    price: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    organiser_slug: str | None = None,
    group_id: uuid.UUID | None = None,
    include_past: bool = False,
    limit: int = 100,
    offset: int = 0,
    now: datetime | None = None,
) -> tuple[list[schemas.ListingCard], int]:
    current = now or utc_now()
    stmt = _public_listings().where(Listing.visibility == "public")
    if not include_past:
        stmt = stmt.where(Listing.ends_at > current)
    if when is not None:
        start, end = when_window(when, current)
        stmt = stmt.where(Listing.starts_at >= start, Listing.starts_at < end)
    if category:
        stmt = stmt.where(Listing.category == category)
    if parish:
        stmt = stmt.where(Listing.parish == parish)
    if price == "free":
        stmt = stmt.where(Listing.admission != "ticketed")
    elif price == "paid":
        stmt = stmt.where(Listing.admission == "ticketed")
    if tag:
        stmt = stmt.where(Listing.tags.contains([tag]))
    if query:
        like = f"%{query.strip()[:100]}%"
        stmt = stmt.where(
            or_(
                Listing.title.ilike(like),
                Listing.summary.ilike(like),
                Listing.venue.ilike(like),
            )
        )
    if organiser_slug:
        stmt = stmt.where(Organiser.slug == organiser_slug)
    if group_id:
        stmt = stmt.where(Listing.group_id == group_id)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await db.execute(stmt.order_by(Listing.starts_at).limit(limit).offset(offset))
    ).all()
    return await _cards(db, [(row[0], row[1]) for row in rows], viewer_id), int(total)


async def _organiser_public(
    db: AsyncSession, organiser: Organiser, viewer_id: uuid.UUID | None
) -> schemas.OrganiserPublic:
    followers = await db.scalar(
        select(func.count())
        .select_from(Follow)
        .where(Follow.organiser_id == organiser.id)
    )
    following = None
    if viewer_id is not None:
        following = (await db.get(Follow, (organiser.id, viewer_id))) is not None
    return schemas.OrganiserPublic(
        id=organiser.id,
        slug=organiser.slug,
        name=organiser.name,
        bio=organiser.bio,
        verified=organiser.verified,
        follower_count=int(followers or 0),
        viewer_following=following,
    )


async def _tiers(db: AsyncSession, listing_id: uuid.UUID) -> list[schemas.TierPublic]:
    rows = await db.scalars(
        select(TicketTier)
        .where(TicketTier.listing_id == listing_id)
        .order_by(TicketTier.sort_order)
    )
    return [
        schemas.TierPublic.model_validate(row, from_attributes=True) for row in rows
    ]


async def get_listing(
    db: AsyncSession, slug: str, viewer_id: uuid.UUID | None
) -> schemas.ListingDetail:
    row = (await db.execute(_public_listings().where(Listing.slug == slug))).first()
    if row is None:
        raise EventsNotFound("Event not found")
    listing, organiser_slug = row[0], row[1]
    card = (await _cards(db, [(listing, organiser_slug)], viewer_id))[0]
    organiser = await db.get(Organiser, listing.organiser_id)
    assert organiser is not None
    group = await db.get(Group, listing.group_id) if listing.group_id else None
    return schemas.ListingDetail(
        **card.model_dump(),
        description=listing.description,
        capacity=listing.capacity,
        organiser=await _organiser_public(db, organiser, viewer_id),
        group=(await _group_summaries(db, [group], viewer_id))[0] if group else None,
        tiers=await _tiers(db, listing.id),
    )


async def _listing_id(db: AsyncSession, slug: str) -> uuid.UUID:
    listing_id = await db.scalar(
        select(Listing.id).where(Listing.slug == slug, Listing.status == "published")
    )
    if listing_id is None:
        raise EventsNotFound("Event not found")
    return listing_id


async def set_rsvp(db: AsyncSession, user: User, slug: str, going: bool) -> None:
    listing_id = await _listing_id(db, slug)
    await get_or_create_profile(db, user)
    existing = await db.get(Rsvp, (listing_id, user.id))
    if going and existing is None:
        db.add(Rsvp(listing_id=listing_id, user_id=user.id))
    elif not going and existing is not None:
        await db.delete(existing)
    await db.commit()


async def set_saved(db: AsyncSession, user: User, slug: str, saved: bool) -> None:
    listing_id = await _listing_id(db, slug)
    existing = await db.get(SavedListing, (listing_id, user.id))
    if saved and existing is None:
        db.add(SavedListing(listing_id=listing_id, user_id=user.id))
    elif not saved and existing is not None:
        await db.delete(existing)
    await db.commit()


# --- Organisers -----------------------------------------------------------------------


async def get_organiser(
    db: AsyncSession, slug: str, viewer_id: uuid.UUID | None
) -> schemas.OrganiserPublic:
    organiser = await db.scalar(select(Organiser).where(Organiser.slug == slug))
    if organiser is None:
        raise EventsNotFound("Organiser not found")
    return await _organiser_public(db, organiser, viewer_id)


async def set_follow(db: AsyncSession, user: User, slug: str, following: bool) -> None:
    organiser_id = await db.scalar(select(Organiser.id).where(Organiser.slug == slug))
    if organiser_id is None:
        raise EventsNotFound("Organiser not found")
    existing = await db.get(Follow, (organiser_id, user.id))
    if following and existing is None:
        db.add(Follow(organiser_id=organiser_id, user_id=user.id))
    elif not following and existing is not None:
        await db.delete(existing)
    await db.commit()


# --- Groups ------------------------------------------------------------------------------


async def _group_summaries(
    db: AsyncSession, groups: Sequence[Group], viewer_id: uuid.UUID | None
) -> list[schemas.GroupSummary]:
    if not groups:
        return []
    ids = [group.id for group in groups]
    counts: dict[uuid.UUID, Any] = _pairs(
        (
            await db.execute(
                select(GroupMember.group_id, func.count())
                .where(GroupMember.group_id.in_(ids), GroupMember.status == "active")
                .group_by(GroupMember.group_id)
            )
        ).all()
    )
    nexts: dict[uuid.UUID, Any] = _pairs(
        (
            await db.execute(
                select(Listing.group_id, func.min(Listing.starts_at))
                .where(
                    Listing.group_id.in_(ids),
                    Listing.status == "published",
                    Listing.ends_at > utc_now(),
                )
                .group_by(Listing.group_id)
            )
        ).all()
    )
    statuses: dict[uuid.UUID, str] = {}
    if viewer_id is not None:
        for group_id, role, status in (
            await db.execute(
                select(
                    GroupMember.group_id, GroupMember.role, GroupMember.status
                ).where(GroupMember.user_id == viewer_id, GroupMember.group_id.in_(ids))
            )
        ).all():
            statuses[group_id] = "pending" if status == "pending" else role
    return [
        schemas.GroupSummary(
            id=group.id,
            slug=group.slug,
            name=group.name,
            tagline=group.tagline,
            category=group.category,  # type: ignore[arg-type]
            parish=group.parish,  # type: ignore[arg-type]
            join_policy=group.join_policy,  # type: ignore[arg-type]
            member_count=int(counts.get(group.id, 0)),
            next_listing_starts_at=nexts.get(group.id),
            viewer_status=statuses.get(group.id),  # type: ignore[arg-type]
        )
        for group in groups
    ]


async def list_groups(
    db: AsyncSession, viewer_id: uuid.UUID | None
) -> list[schemas.GroupSummary]:
    groups = (await db.scalars(select(Group).order_by(Group.name))).all()
    return await _group_summaries(db, groups, viewer_id)


async def _group(db: AsyncSession, slug: str) -> Group:
    group = await db.scalar(select(Group).where(Group.slug == slug))
    if group is None:
        raise EventsNotFound("Group not found")
    return group


async def get_group(
    db: AsyncSession, slug: str, viewer_id: uuid.UUID | None
) -> schemas.GroupDetail:
    group = await _group(db, slug)
    summary = (await _group_summaries(db, [group], viewer_id))[0]
    hidden = await blocked_ids(db, viewer_id)
    member_rows = (
        await db.execute(
            select(GroupMember.user_id, GroupMember.role, MemberProfile)
            .join(MemberProfile, MemberProfile.user_id == GroupMember.user_id)
            .where(GroupMember.group_id == group.id, GroupMember.status == "active")
            .order_by(GroupMember.role.desc(), MemberProfile.display_name)
        )
    ).all()
    members = [
        schemas.GroupMemberPublic(
            handle=profile.handle,
            display_name=profile.display_name,
            headline=profile.headline,
            role=role,
        )
        for user_id, role, profile in member_rows
        if user_id not in hidden
    ]
    announcements = (
        await db.scalars(
            select(Announcement)
            .where(Announcement.group_id == group.id)
            .order_by(Announcement.posted_at.desc())
            .limit(20)
        )
    ).all()
    authors = await _chips(db, [row.author_id for row in announcements])
    upcoming, _ = await list_listings(
        db, viewer_id=viewer_id, group_id=group.id, limit=20
    )
    chat_id = None
    if summary.viewer_status in {"host", "member"}:
        chat_id = await db.scalar(select(Thread.id).where(Thread.group_id == group.id))
    return schemas.GroupDetail(
        **summary.model_dump(),
        about=group.about,
        announcements=[
            schemas.AnnouncementPublic(
                id=row.id,
                author=authors.get(row.author_id),
                body=row.body,
                posted_at=row.posted_at,
            )
            for row in announcements
        ],
        members=members,
        upcoming=upcoming,
        chat_thread_id=chat_id,
    )


async def set_membership(
    db: AsyncSession, user: User, slug: str, member: bool
) -> str | None:
    """Join (pending for approval groups) or leave. Returns the new status."""
    group = await _group(db, slug)
    await get_or_create_profile(db, user)
    existing = await db.get(GroupMember, (group.id, user.id))
    if not member:
        if existing is not None:
            await db.delete(existing)
            thread_id = await db.scalar(
                select(Thread.id).where(Thread.group_id == group.id)
            )
            if thread_id is not None:
                await db.execute(
                    delete(ThreadParticipant).where(
                        ThreadParticipant.thread_id == thread_id,
                        ThreadParticipant.user_id == user.id,
                    )
                )
        await db.commit()
        return None
    if existing is None:
        status = "pending" if group.join_policy == "approval" else "active"
        existing = GroupMember(group_id=group.id, user_id=user.id, status=status)
        db.add(existing)
        if status == "active":
            await _join_group_chat(db, group.id, user.id)
    await db.commit()
    return existing.status


async def _join_group_chat(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    thread = await db.scalar(select(Thread).where(Thread.group_id == group_id))
    if thread is None:
        thread = Thread(kind="group", group_id=group_id)
        db.add(thread)
        await db.flush()
    if await db.get(ThreadParticipant, (thread.id, user_id)) is None:
        db.add(ThreadParticipant(thread_id=thread.id, user_id=user_id))
