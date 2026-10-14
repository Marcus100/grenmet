"""Direct and group message threads."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from .. import schemas
from ..exceptions import EventsForbidden, EventsNotFound
from ..models import (
    Group,
    GroupMember,
    MemberProfile,
    Message,
    Thread,
    ThreadParticipant,
)
from .people import (
    _chips,
    _profile_by_handle,
    blocked_ids,
    can_message,
    get_or_create_profile,
)

_THREAD_KIND = TypeAdapter(Literal["direct", "group"])

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
                kind=_THREAD_KIND.validate_python(thread.kind),
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
        kind=_THREAD_KIND.validate_python(thread.kind),
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
