"""Person pages, plans and the member network."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import schemas
from ..exceptions import EventsConflict, EventsNotFound
from ..models import (
    Block,
    Connection,
    Follow,
    Group,
    GroupMember,
    Listing,
    MemberProfile,
    Organiser,
    Report,
    Rsvp,
    SavedListing,
    Thread,
)
from .discover import _cards, _group_summaries, _organiser_public, _public_listings
from .messaging import _direct_key
from .people import (
    _connection_between,
    _profile_by_handle,
    blocked_ids,
    can_message,
    connection_state,
    get_or_create_profile,
)

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
