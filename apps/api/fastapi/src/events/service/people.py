"""Profiles, blocks, connections and the direct-message permission check."""

import re
import secrets
import uuid
from collections.abc import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import schemas
from ..exceptions import EventsConflict, EventsNotFound
from ..models import (
    Block,
    Connection,
    GroupMember,
    MemberProfile,
)

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
