"""Barrels Events business rules.

Filtering, joins and counts happen in SQL; Pydantic shapes the result at the
edge. Safety rules live here so every client gets them:

- direct messages only between accepted connections or members of a shared
  group (``can_message``);
- a block hides each person from the other: profiles, going lists, people
  suggestions and messaging;
- ``visibility="connections"`` profiles show only name and headline to people
  outside the member's network.
"""

import re
import secrets
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import Select, and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from . import schemas
from .exceptions import EventsConflict, EventsForbidden, EventsNotFound
from .models import (
    Announcement,
    Block,
    Connection,
    Follow,
    Group,
    GroupMember,
    Listing,
    MemberProfile,
    Message,
    Organiser,
    OrganiserMember,
    Report,
    Rsvp,
    SavedListing,
    Suggestion,
    Thread,
    ThreadParticipant,
    TicketTier,
)

#: Grenada does not observe daylight saving.
GRENADA = timezone(timedelta(hours=-4))
FRIDAY, SUNDAY = 4, 6  # datetime.weekday()
GOING_PREVIEW = 4


def _pairs(rows: Iterable[Any]) -> dict[uuid.UUID, Any]:
    """``{key: value}`` from two-column result rows."""
    return {row[0]: row[1] for row in rows}


# --- Time windows --------------------------------------------------------------


UTC_TZ = UTC


def _naive_utc(value: datetime) -> datetime:
    """Stored timestamps are naive UTC."""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC_TZ).replace(tzinfo=None)


def when_window(when: schemas.When, now: datetime) -> tuple[datetime, datetime]:
    """Grenada-calendar window as naive-UTC bounds ``[start, end)`` for start times."""
    local_now = now.replace(tzinfo=UTC_TZ).astimezone(GRENADA)
    today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if when == "tonight":
        start, end = today, today + timedelta(days=1)
    elif when == "weekend":
        # Friday–Sunday; on a weekend day the window starts today.
        weekday = local_now.weekday()
        start = today if weekday >= FRIDAY else today + timedelta(days=FRIDAY - weekday)
        end = (
            today + timedelta(days=SUNDAY - weekday + 1)
            if weekday >= FRIDAY
            else start + timedelta(days=3)
        )
    elif when == "week":
        start, end = today, today + timedelta(days=7)
    else:
        start, end = today, today + timedelta(days=31)
    return _naive_utc(start), _naive_utc(end)


# --- Profiles and people ----------------------------------------------------------


_HANDLE_STRIP = re.compile(r"[^a-z0-9]+")


async def _unique_handle(db: AsyncSession, seed: str) -> str:
    base = _HANDLE_STRIP.sub("-", seed.lower()).strip("-")[:20] or "member"
    if len(base) < 2:
        base = f"{base}-member"
    candidate = base
    for _ in range(6):
        if (
            await db.scalar(
                select(MemberProfile.user_id).where(MemberProfile.handle == candidate)
            )
            is None
        ):
            return candidate
        candidate = f"{base}-{secrets.token_hex(2)}"
    return f"member-{uuid.uuid4().hex[:8]}"


async def get_or_create_profile(db: AsyncSession, user: User) -> MemberProfile:
    profile = await db.get(MemberProfile, user.id)
    if profile is not None:
        return profile
    display = user.full_name.strip() or user.email.split("@", 1)[0]
    profile = MemberProfile(
        user_id=user.id,
        handle=await _unique_handle(db, user.first_name or display),
        display_name=display[:80],
        interests=[],
        intents=[],
    )
    db.add(profile)
    await db.commit()
    return profile


async def _profile_by_handle(db: AsyncSession, handle: str) -> MemberProfile:
    profile = await db.scalar(
        select(MemberProfile).where(MemberProfile.handle == handle)
    )
    if profile is None:
        raise EventsNotFound("Member not found")
    return profile


async def blocked_ids(db: AsyncSession, viewer_id: uuid.UUID | None) -> set[uuid.UUID]:
    """Everyone the viewer blocked or who blocked the viewer."""
    if viewer_id is None:
        return set()
    rows = await db.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            or_(Block.blocker_id == viewer_id, Block.blocked_id == viewer_id)
        )
    )
    return {
        blocked if blocker == viewer_id else blocker for blocker, blocked in rows.all()
    }


async def _connection_between(
    db: AsyncSession, a: uuid.UUID, b: uuid.UUID
) -> Connection | None:
    link: Connection | None = await db.scalar(
        select(Connection).where(
            or_(
                and_(Connection.requester_id == a, Connection.addressee_id == b),
                and_(Connection.requester_id == b, Connection.addressee_id == a),
            )
        )
    )
    return link


async def connection_state(
    db: AsyncSession, viewer_id: uuid.UUID, other_id: uuid.UUID
) -> schemas.ConnectionState:
    if viewer_id == other_id:
        return "self"
    if other_id in await blocked_ids(db, viewer_id):
        return "blocked"
    link = await _connection_between(db, viewer_id, other_id)
    if link is None:
        return "none"
    if link.status == "accepted":
        return "connected"
    return "sent" if link.requester_id == viewer_id else "received"


async def _shares_group(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    mine = select(GroupMember.group_id).where(
        GroupMember.user_id == a, GroupMember.status == "active"
    )
    shared = await db.scalar(
        select(func.count())
        .select_from(GroupMember)
        .where(
            GroupMember.user_id == b,
            GroupMember.status == "active",
            GroupMember.group_id.in_(mine),
        )
    )
    return bool(shared)


async def can_message(
    db: AsyncSession, viewer_id: uuid.UUID, other_id: uuid.UUID
) -> bool:
    """Accepted connection or a shared group, and no block either way."""
    state = await connection_state(db, viewer_id, other_id)
    if state in {"self", "blocked"}:
        return False
    return state == "connected" or await _shares_group(db, viewer_id, other_id)


async def _chips(
    db: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, schemas.PersonChip]:
    if not ids:
        return {}
    rows = await db.execute(
        select(
            MemberProfile.user_id, MemberProfile.handle, MemberProfile.display_name
        ).where(MemberProfile.user_id.in_(set(ids)))
    )
    return {
        user_id: schemas.PersonChip(handle=handle, display_name=name)
        for user_id, handle, name in rows.all()
    }


async def update_profile(
    db: AsyncSession, user: User, body: schemas.ProfileUpdate
) -> MemberProfile:
    profile = await get_or_create_profile(db, user)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "handle" in changes and changes["handle"] != profile.handle:
        taken = await db.scalar(
            select(MemberProfile.user_id).where(
                MemberProfile.handle == changes["handle"]
            )
        )
        if taken is not None:
            raise EventsConflict("That handle is taken")
    for key, value in changes.items():
        setattr(profile, key, value)
    profile.updated_at = utc_now()
    db.add(profile)
    await db.commit()
    return profile


def my_profile(profile: MemberProfile) -> schemas.MyProfile:
    return schemas.MyProfile.model_validate(profile, from_attributes=True)


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


# --- People ---------------------------------------------------------------------------------


async def get_person(
    db: AsyncSession, handle: str, viewer_id: uuid.UUID | None
) -> schemas.ProfilePublic:
    profile = await _profile_by_handle(db, handle)
    if viewer_id is not None and profile.user_id in await blocked_ids(db, viewer_id):
        raise EventsNotFound("Member not found")
    state: schemas.ConnectionState = (
        await connection_state(db, viewer_id, profile.user_id) if viewer_id else "none"
    )
    restricted = profile.visibility == "connections" and state not in {
        "self",
        "connected",
    }
    group_rows = (
        await db.scalars(
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(
                GroupMember.user_id == profile.user_id, GroupMember.status == "active"
            )
        )
    ).all()
    allowed = bool(viewer_id) and await can_message(db, viewer_id, profile.user_id)  # type: ignore[arg-type]
    thread_id = None
    if viewer_id is not None and viewer_id != profile.user_id:
        thread_id = await db.scalar(
            select(Thread.id).where(
                Thread.direct_key == _direct_key(viewer_id, profile.user_id)
            )
        )
    return schemas.ProfilePublic(
        handle=profile.handle,
        display_name=profile.display_name,
        headline=profile.headline,
        parish=profile.parish,  # type: ignore[arg-type]
        restricted=restricted,
        bio=None if restricted else profile.bio,
        interests=[] if restricted else list(profile.interests),  # type: ignore[arg-type]
        intents=[] if restricted else list(profile.intents),  # type: ignore[arg-type]
        groups=[] if restricted else await _group_summaries(db, group_rows, viewer_id),
        connection_state=state,
        can_message=allowed,
        direct_thread_id=thread_id,
    )


async def plans(db: AsyncSession, user: User) -> schemas.PlansPublic:
    going_ids = select(Rsvp.listing_id).where(Rsvp.user_id == user.id)
    saved_ids = select(SavedListing.listing_id).where(SavedListing.user_id == user.id)
    now = utc_now()
    going_rows = (
        await db.execute(
            _public_listings()
            .where(Listing.id.in_(going_ids), Listing.ends_at > now)
            .order_by(Listing.starts_at)
        )
    ).all()
    saved_rows = (
        await db.execute(
            _public_listings()
            .where(Listing.id.in_(saved_ids), Listing.ends_at > now)
            .order_by(Listing.starts_at)
        )
    ).all()
    groups = (
        await db.scalars(
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user.id)
            .order_by(Group.name)
        )
    ).all()
    organisers = (
        await db.scalars(
            select(Organiser)
            .join(Follow, Follow.organiser_id == Organiser.id)
            .where(Follow.user_id == user.id)
            .order_by(Organiser.name)
        )
    ).all()
    return schemas.PlansPublic(
        going=await _cards(db, [(r[0], r[1]) for r in going_rows], user.id),
        saved=await _cards(db, [(r[0], r[1]) for r in saved_rows], user.id),
        groups=await _group_summaries(db, groups, user.id),
        following=[await _organiser_public(db, row, user.id) for row in organisers],
    )


# --- Network ------------------------------------------------------------------------------


async def network(db: AsyncSession, user: User) -> schemas.NetworkPublic:
    me = await get_or_create_profile(db, user)
    hidden = await blocked_ids(db, user.id)
    links = (
        await db.scalars(
            select(Connection).where(
                or_(
                    Connection.requester_id == user.id,
                    Connection.addressee_id == user.id,
                )
            )
        )
    ).all()
    other_ids = [
        link.addressee_id if link.requester_id == user.id else link.requester_id
        for link in links
    ]
    profiles = {
        row.user_id: row
        for row in (
            await db.scalars(
                select(MemberProfile).where(MemberProfile.user_id.in_(other_ids))
            )
        ).all()
    }
    connections = []
    for link, other_id in zip(links, other_ids, strict=True):
        profile = profiles.get(other_id)
        if profile is None or other_id in hidden:
            continue
        state = (
            "connected"
            if link.status == "accepted"
            else ("sent" if link.requester_id == user.id else "received")
        )
        connections.append(
            schemas.ConnectionPublic(
                id=link.id,
                person=schemas.PersonChip(
                    handle=profile.handle, display_name=profile.display_name
                ),
                headline=profile.headline,
                state=state,  # type: ignore[arg-type]
            )
        )
    # Suggestions: share a group or an interest; not linked, not blocked.
    my_groups = select(GroupMember.group_id).where(GroupMember.user_id == user.id)
    excluded = {user.id, *other_ids, *hidden}
    candidates = (
        await db.scalars(
            select(MemberProfile)
            .where(
                MemberProfile.user_id.not_in(excluded),
                MemberProfile.visibility == "public",
                or_(
                    MemberProfile.user_id.in_(
                        select(GroupMember.user_id).where(
                            GroupMember.group_id.in_(my_groups)
                        )
                    ),
                    MemberProfile.interests.overlap(me.interests or ["__none__"]),
                ),
            )
            .limit(12)
        )
    ).all()
    return schemas.NetworkPublic(
        connections=connections,
        suggestions=[
            schemas.PersonSuggestion(
                handle=row.handle,
                display_name=row.display_name,
                headline=row.headline,
                intents=list(row.intents),  # type: ignore[arg-type]
            )
            for row in candidates
        ],
    )


async def request_connection(db: AsyncSession, user: User, handle: str) -> None:
    await get_or_create_profile(db, user)
    other = await _profile_by_handle(db, handle)
    if other.user_id == user.id:
        raise EventsConflict("You can't connect with yourself")
    if other.user_id in await blocked_ids(db, user.id):
        raise EventsNotFound("Member not found")
    existing = await _connection_between(db, user.id, other.user_id)
    if existing is not None:
        # Requesting someone who already asked you accepts their request.
        if existing.status == "pending" and existing.addressee_id == user.id:
            existing.status = "accepted"
            db.add(existing)
            await db.commit()
        return
    db.add(Connection(requester_id=user.id, addressee_id=other.user_id))
    await db.commit()


async def accept_connection(
    db: AsyncSession, user: User, connection_id: uuid.UUID
) -> None:
    link = await db.get(Connection, connection_id)
    if link is None or link.addressee_id != user.id:
        raise EventsNotFound("Request not found")
    link.status = "accepted"
    db.add(link)
    await db.commit()


async def remove_connection(
    db: AsyncSession, user: User, connection_id: uuid.UUID
) -> None:
    link = await db.get(Connection, connection_id)
    if link is None or user.id not in {link.requester_id, link.addressee_id}:
        raise EventsNotFound("Connection not found")
    await db.delete(link)
    await db.commit()


async def set_block(db: AsyncSession, user: User, handle: str, blocked: bool) -> None:
    other = await _profile_by_handle(db, handle)
    if other.user_id == user.id:
        raise EventsConflict("You can't block yourself")
    existing = await db.get(Block, (user.id, other.user_id))
    if blocked and existing is None:
        db.add(Block(blocker_id=user.id, blocked_id=other.user_id))
        link = await _connection_between(db, user.id, other.user_id)
        if link is not None:
            await db.delete(link)
    elif not blocked and existing is not None:
        await db.delete(existing)
    await db.commit()


async def create_report(
    db: AsyncSession, user: User, body: schemas.ReportCreate
) -> Report:
    report = Report(reporter_id=user.id, **body.model_dump())
    db.add(report)
    await db.commit()
    return report


# --- Messaging -----------------------------------------------------------------------------


def _direct_key(a: uuid.UUID, b: uuid.UUID) -> str:
    low, high = sorted((str(a), str(b)))
    return f"{low}:{high}"


async def _thread_title(
    db: AsyncSession, thread: Thread, viewer_id: uuid.UUID
) -> tuple[str, str | None]:
    if thread.kind == "group" and thread.group_id:
        group = await db.get(Group, thread.group_id)
        return (group.name if group else "Group chat"), (group.slug if group else None)
    other = await db.scalar(
        select(MemberProfile.display_name)
        .join(ThreadParticipant, ThreadParticipant.user_id == MemberProfile.user_id)
        .where(
            ThreadParticipant.thread_id == thread.id,
            ThreadParticipant.user_id != viewer_id,
        )
    )
    return other or "Conversation", None


async def list_threads(db: AsyncSession, user: User) -> list[schemas.ThreadSummary]:
    threads = (
        await db.scalars(
            select(Thread)
            .join(ThreadParticipant, ThreadParticipant.thread_id == Thread.id)
            .where(ThreadParticipant.user_id == user.id)
        )
    ).all()
    summaries = []
    for thread in threads:
        last = await db.scalar(
            select(Message)
            .where(Message.thread_id == thread.id)
            .order_by(Message.sent_at.desc())
            .limit(1)
        )
        title, group_slug = await _thread_title(db, thread, user.id)
        summaries.append(
            schemas.ThreadSummary(
                id=thread.id,
                kind=thread.kind,  # type: ignore[arg-type]
                title=title,
                group_slug=group_slug,
                last_message=last.body[:140] if last else None,
                last_sent_at=last.sent_at if last else None,
            )
        )
    summaries.sort(key=lambda row: row.last_sent_at or datetime.min, reverse=True)
    return summaries


async def _participant_thread(
    db: AsyncSession, user: User, thread_id: uuid.UUID
) -> Thread:
    thread = await db.get(Thread, thread_id)
    if thread is None or await db.get(ThreadParticipant, (thread_id, user.id)) is None:
        raise EventsNotFound("Conversation not found")
    return thread


async def _can_send(db: AsyncSession, thread: Thread, user: User) -> bool:
    if thread.kind == "group":
        if thread.group_id is None:
            return False
        member = await db.get(GroupMember, (thread.group_id, user.id))
        return member is not None and member.status == "active"
    other = await db.scalar(
        select(ThreadParticipant.user_id).where(
            ThreadParticipant.thread_id == thread.id,
            ThreadParticipant.user_id != user.id,
        )
    )
    return other is not None and await can_message(db, user.id, other)


async def get_thread(
    db: AsyncSession, user: User, thread_id: uuid.UUID
) -> schemas.ThreadDetail:
    thread = await _participant_thread(db, user, thread_id)
    hidden = await blocked_ids(db, user.id)
    participant_ids = (
        await db.scalars(
            select(ThreadParticipant.user_id).where(
                ThreadParticipant.thread_id == thread.id
            )
        )
    ).all()
    messages = (
        await db.scalars(
            select(Message)
            .where(Message.thread_id == thread.id)
            .order_by(Message.sent_at)
            .limit(500)
        )
    ).all()
    chips = await _chips(db, [*participant_ids, *(m.author_id for m in messages)])
    title, group_slug = await _thread_title(db, thread, user.id)
    return schemas.ThreadDetail(
        id=thread.id,
        kind=thread.kind,  # type: ignore[arg-type]
        title=title,
        group_slug=group_slug,
        participants=[
            chips[pid] for pid in participant_ids if pid in chips and pid not in hidden
        ],
        messages=[
            schemas.MessagePublic(
                id=message.id,
                author=chips.get(message.author_id),
                body=message.body,
                sent_at=message.sent_at,
                mine=message.author_id == user.id,
            )
            for message in messages
            if message.author_id not in hidden
        ],
        can_send=await _can_send(db, thread, user),
    )


async def open_direct_thread(db: AsyncSession, user: User, handle: str) -> uuid.UUID:
    await get_or_create_profile(db, user)
    other = await _profile_by_handle(db, handle)
    if not await can_message(db, user.id, other.user_id):
        raise EventsForbidden("Connect or join a shared group to message this member")
    key = _direct_key(user.id, other.user_id)
    existing = await db.scalar(select(Thread.id).where(Thread.direct_key == key))
    if existing is not None:
        return existing
    thread = Thread(kind="direct", direct_key=key)
    db.add(thread)
    await db.flush()
    db.add_all(
        [
            ThreadParticipant(thread_id=thread.id, user_id=user.id),
            ThreadParticipant(thread_id=thread.id, user_id=other.user_id),
        ]
    )
    await db.commit()
    return thread.id


async def send_message(
    db: AsyncSession, user: User, thread_id: uuid.UUID, body: schemas.MessageCreate
) -> schemas.MessagePublic:
    thread = await _participant_thread(db, user, thread_id)
    if not await _can_send(db, thread, user):
        raise EventsForbidden("You can't message in this conversation")
    profile = await get_or_create_profile(db, user)
    message = Message(thread_id=thread.id, author_id=user.id, body=body.body.strip())
    db.add(message)
    await db.commit()
    return schemas.MessagePublic(
        id=message.id,
        author=schemas.PersonChip(
            handle=profile.handle, display_name=profile.display_name
        ),
        body=message.body,
        sent_at=message.sent_at,
        mine=True,
    )


# --- Suggestions and moderation ---------------------------------------------------------------


async def create_suggestion(
    db: AsyncSession, user: User | None, body: schemas.SuggestionCreate
) -> Suggestion:
    suggestion = Suggestion(submitted_by=user.id if user else None, **body.model_dump())
    db.add(suggestion)
    await db.commit()
    return suggestion


async def list_suggestions(db: AsyncSession) -> Sequence[Suggestion]:
    return (
        await db.scalars(
            select(Suggestion)
            .where(Suggestion.status == "pending")
            .order_by(Suggestion.created_at)
        )
    ).all()


async def update_suggestion(
    db: AsyncSession, suggestion_id: uuid.UUID, body: schemas.SuggestionUpdate
) -> Suggestion:
    suggestion = await db.get(Suggestion, suggestion_id)
    if suggestion is None:
        raise EventsNotFound("Suggestion not found")
    suggestion.status = body.status
    db.add(suggestion)
    await db.commit()
    return suggestion


async def list_reports(db: AsyncSession) -> Sequence[Report]:
    return (
        await db.scalars(
            select(Report).where(Report.status == "open").order_by(Report.created_at)
        )
    ).all()


async def update_report(
    db: AsyncSession, report_id: uuid.UUID, body: schemas.ReportUpdate
) -> Report:
    report = await db.get(Report, report_id)
    if report is None:
        raise EventsNotFound("Report not found")
    report.status = body.status
    db.add(report)
    await db.commit()
    return report


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
