"""Operations log rules (ADR-0067). Service functions flush; routers commit.

Every lookup is scoped to the caller's organisation in SQL, so another
organisation's log, category or entry is 404. Private entries are 404 to a member
without ``opslog.entries.private``, so their existence is not revealed.
"""

import base64
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError
from src.utils.datetime import utc_now

from .exceptions import (
    OpsLogCategoryNotFoundError,
    OpsLogConflictError,
    OpsLogEntryNotFoundError,
    OpsLogForbiddenError,
    OpsLogNotFoundError,
)
from .models import (
    MAX_CATEGORY_DEPTH,
    OpsLog,
    OpsLogCategory,
    OpsLogComment,
    OpsLogEditRule,
    OpsLogEntry,
    OpsLogEntrySource,
)
from .schemas import (
    OpsLogCategoryCreate,
    OpsLogCategoryUpdate,
    OpsLogCreate,
    OpsLogEntryCreate,
    OpsLogEntryUpdate,
    OpsLogUpdate,
)

MAX_PAGE = 100


def naive_utc(moment: datetime) -> datetime:
    """A request datetime as stored: naive UTC (a naive value is read as UTC)."""
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None)


# --- logs -------------------------------------------------------------------------


async def list_logs(
    session: AsyncSession, *, organisation_id: str, include_archived: bool
) -> Sequence[OpsLog]:
    query = select(OpsLog).where(OpsLog.organisation_id == organisation_id)
    if not include_archived:
        query = query.where(OpsLog.archived_at.is_(None))
    return (await session.scalars(query.order_by(OpsLog.name, OpsLog.id))).all()


async def get_log(
    session: AsyncSession, *, organisation_id: str, log_id: str
) -> OpsLog:
    log = await session.scalar(
        select(OpsLog).where(
            OpsLog.id == log_id, OpsLog.organisation_id == organisation_id
        )
    )
    if log is None:
        raise OpsLogNotFoundError()
    return log


async def _name_taken(
    session: AsyncSession, *, organisation_id: str, name: str, except_id: str | None
) -> bool:
    query = select(OpsLog.id).where(
        OpsLog.organisation_id == organisation_id,
        func.lower(OpsLog.name) == name.lower(),
    )
    if except_id is not None:
        query = query.where(OpsLog.id != except_id)
    return (await session.scalar(query)) is not None


async def create_log(
    session: AsyncSession, *, organisation_id: str, payload: OpsLogCreate
) -> OpsLog:
    name = payload.name.strip()
    if not name:
        raise AppValidationError("A log needs a name")
    if await _name_taken(
        session, organisation_id=organisation_id, name=name, except_id=None
    ):
        raise OpsLogConflictError("A log with this name already exists")
    log = OpsLog(
        organisation_id=organisation_id,
        name=name,
        description=payload.description,
        edit_rule=payload.edit_rule.value,
        edit_window_minutes=payload.edit_window_minutes,
        automatic_entries=payload.automatic_entries,
    )
    session.add(log)
    await session.flush()
    return log


async def update_log(
    session: AsyncSession, *, organisation_id: str, log_id: str, payload: OpsLogUpdate
) -> OpsLog:
    log = await get_log(session, organisation_id=organisation_id, log_id=log_id)
    sent = payload.model_fields_set
    if "name" in sent and payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise AppValidationError("A log needs a name")
        if await _name_taken(
            session, organisation_id=organisation_id, name=name, except_id=log.id
        ):
            raise OpsLogConflictError("A log with this name already exists")
        log.name = name
    if "description" in sent:
        log.description = payload.description
    if "edit_rule" in sent and payload.edit_rule is not None:
        log.edit_rule = payload.edit_rule.value
    if "edit_window_minutes" in sent:
        log.edit_window_minutes = payload.edit_window_minutes
    if "automatic_entries" in sent and payload.automatic_entries is not None:
        log.automatic_entries = payload.automatic_entries
    if "archived" in sent and payload.archived is not None:
        if payload.archived and log.archived_at is None:
            log.archived_at = utc_now()
        elif not payload.archived:
            log.archived_at = None
    await session.flush()
    return log


def _require_active(log: OpsLog) -> None:
    if log.archived_at is not None:
        raise OpsLogConflictError("This log is archived")


# --- categories -------------------------------------------------------------------


async def list_categories(
    session: AsyncSession, *, organisation_id: str, log_id: str, include_archived: bool
) -> Sequence[OpsLogCategory]:
    await get_log(session, organisation_id=organisation_id, log_id=log_id)
    query = select(OpsLogCategory).where(
        OpsLogCategory.log_id == log_id,
        OpsLogCategory.organisation_id == organisation_id,
    )
    if not include_archived:
        query = query.where(OpsLogCategory.archived_at.is_(None))
    return (
        await session.scalars(
            query.order_by(OpsLogCategory.depth, OpsLogCategory.name, OpsLogCategory.id)
        )
    ).all()


async def get_category(
    session: AsyncSession, *, organisation_id: str, category_id: str
) -> OpsLogCategory:
    category = await session.scalar(
        select(OpsLogCategory).where(
            OpsLogCategory.id == category_id,
            OpsLogCategory.organisation_id == organisation_id,
        )
    )
    if category is None:
        raise OpsLogCategoryNotFoundError()
    return category


async def _sibling_named(
    session: AsyncSession,
    *,
    log_id: str,
    parent_id: str | None,
    name: str,
    except_id: str | None,
) -> bool:
    parent = (
        OpsLogCategory.parent_id.is_(None)
        if parent_id is None
        else OpsLogCategory.parent_id == parent_id
    )
    query = select(OpsLogCategory.id).where(
        OpsLogCategory.log_id == log_id,
        parent,
        func.lower(OpsLogCategory.name) == name.lower(),
    )
    if except_id is not None:
        query = query.where(OpsLogCategory.id != except_id)
    return (await session.scalar(query)) is not None


async def create_category(
    session: AsyncSession,
    *,
    organisation_id: str,
    log_id: str,
    payload: OpsLogCategoryCreate,
) -> OpsLogCategory:
    log = await get_log(session, organisation_id=organisation_id, log_id=log_id)
    name = payload.name.strip()
    if not name:
        raise AppValidationError("A category needs a name")
    depth = 1
    if payload.parent_id is not None:
        parent = await session.scalar(
            select(OpsLogCategory).where(
                OpsLogCategory.id == payload.parent_id,
                OpsLogCategory.log_id == log.id,
                OpsLogCategory.organisation_id == organisation_id,
            )
        )
        if parent is None or parent.archived_at is not None:
            raise AppValidationError("The parent category is not in this log")
        depth = parent.depth + 1
        if depth > MAX_CATEGORY_DEPTH:
            raise AppValidationError(
                f"Categories go at most {MAX_CATEGORY_DEPTH} levels deep"
            )
    if await _sibling_named(
        session, log_id=log.id, parent_id=payload.parent_id, name=name, except_id=None
    ):
        raise OpsLogConflictError("A category with this name already exists here")
    category = OpsLogCategory(
        log_id=log.id,
        organisation_id=organisation_id,
        parent_id=payload.parent_id,
        name=name,
        depth=depth,
    )
    session.add(category)
    await session.flush()
    return category


async def update_category(
    session: AsyncSession,
    *,
    organisation_id: str,
    category_id: str,
    payload: OpsLogCategoryUpdate,
) -> OpsLogCategory:
    category = await get_category(
        session, organisation_id=organisation_id, category_id=category_id
    )
    sent = payload.model_fields_set
    if "name" in sent and payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise AppValidationError("A category needs a name")
        if await _sibling_named(
            session,
            log_id=category.log_id,
            parent_id=category.parent_id,
            name=name,
            except_id=category.id,
        ):
            raise OpsLogConflictError("A category with this name already exists here")
        category.name = name
    if "archived" in sent and payload.archived is not None:
        if payload.archived and category.archived_at is None:
            category.archived_at = utc_now()
        elif not payload.archived:
            category.archived_at = None
    await session.flush()
    return category


async def _usable_category(
    session: AsyncSession, *, log: OpsLog, category_id: str | None
) -> str | None:
    """``category_id`` when it is an active category of ``log``; 422 otherwise."""
    if category_id is None:
        return None
    found = await session.scalar(
        select(OpsLogCategory.id).where(
            OpsLogCategory.id == category_id,
            OpsLogCategory.log_id == log.id,
            OpsLogCategory.organisation_id == log.organisation_id,
            OpsLogCategory.archived_at.is_(None),
        )
    )
    if found is None:
        raise AppValidationError("The category is not an active category of this log")
    return found


# --- entries ----------------------------------------------------------------------


@dataclass(frozen=True)
class EntryView:
    entry: OpsLogEntry
    author_name: str | None
    comment_count: int


@dataclass(frozen=True)
class CommentView:
    comment: OpsLogComment
    author_name: str | None


@dataclass(frozen=True)
class EntryFilters:
    occurred_from: datetime | None = None
    occurred_to: datetime | None = None
    category_id: str | None = None
    author_id: uuid.UUID | None = None
    source: OpsLogEntrySource | None = None
    q: str | None = None


async def _names(
    session: AsyncSession, user_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    users = await session.scalars(select(User).where(User.id.in_(user_ids)))
    return {user.id: (user.full_name or None) for user in users}


async def _comment_counts(
    session: AsyncSession, entry_ids: list[str]
) -> dict[str, int]:
    if not entry_ids:
        return {}
    rows = await session.execute(
        select(OpsLogComment.entry_id, func.count())
        .where(OpsLogComment.entry_id.in_(entry_ids))
        .group_by(OpsLogComment.entry_id)
    )
    return dict(rows.tuples())


async def _views(
    session: AsyncSession, entries: Sequence[OpsLogEntry]
) -> list[EntryView]:
    names = await _names(session, {e.author_id for e in entries if e.author_id})
    counts = await _comment_counts(session, [e.id for e in entries])
    return [
        EntryView(
            entry=e,
            author_name=names.get(e.author_id) if e.author_id else None,
            comment_count=counts.get(e.id, 0),
        )
        for e in entries
    ]


def _encode_cursor(entry: OpsLogEntry) -> str:
    raw = json.dumps(
        {"t": entry.occurred_at.isoformat(), "i": entry.id}, separators=(",", ":")
    )
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        stamp = datetime.fromisoformat(payload["t"])
        after_id = str(payload["i"])
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise AppValidationError("The cursor is not valid") from exc
    if stamp.tzinfo is not None:
        raise AppValidationError("The cursor is not valid")
    return stamp, after_id


def _escaped(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_entries(
    session: AsyncSession,
    *,
    organisation_id: str,
    log_id: str,
    can_read_private: bool,
    filters: EntryFilters,
    limit: int,
    cursor: str | None,
) -> tuple[list[EntryView], str | None]:
    """A page of a log's entries, newest first (keyset on occurred_at, id)."""
    await get_log(session, organisation_id=organisation_id, log_id=log_id)
    query = select(OpsLogEntry).where(
        OpsLogEntry.log_id == log_id,
        OpsLogEntry.organisation_id == organisation_id,
    )
    if not can_read_private:
        query = query.where(OpsLogEntry.private.is_(False))
    if filters.occurred_from is not None:
        query = query.where(OpsLogEntry.occurred_at >= naive_utc(filters.occurred_from))
    if filters.occurred_to is not None:
        query = query.where(OpsLogEntry.occurred_at < naive_utc(filters.occurred_to))
    if filters.author_id is not None:
        query = query.where(OpsLogEntry.author_id == filters.author_id)
    if filters.source is not None:
        query = query.where(OpsLogEntry.source == filters.source.value)
    if filters.category_id is not None:
        # The category and everything under it (at most three levels).
        children = select(OpsLogCategory.id).where(
            OpsLogCategory.parent_id == filters.category_id
        )
        tree = select(OpsLogCategory.id).where(
            OpsLogCategory.organisation_id == organisation_id,
            sa.or_(
                OpsLogCategory.id == filters.category_id,
                OpsLogCategory.parent_id == filters.category_id,
                OpsLogCategory.parent_id.in_(children),
            ),
        )
        query = query.where(OpsLogEntry.category_id.in_(tree))
    if filters.q:
        query = query.where(
            OpsLogEntry.text.ilike(f"%{_escaped(filters.q)}%", escape="\\")
        )
    if cursor is not None:
        after_stamp, after_id = _decode_cursor(cursor)
        query = query.where(
            sa.tuple_(OpsLogEntry.occurred_at, OpsLogEntry.id)
            < sa.tuple_(sa.literal(after_stamp), sa.literal(after_id))
        )
    rows = (
        await session.scalars(
            query.order_by(OpsLogEntry.occurred_at.desc(), OpsLogEntry.id.desc()).limit(
                limit + 1
            )
        )
    ).all()
    page = list(rows[:limit])
    next_cursor = _encode_cursor(page[-1]) if len(rows) > limit else None
    return await _views(session, page), next_cursor


async def _get_entry(
    session: AsyncSession,
    *,
    organisation_id: str,
    entry_id: str,
    can_read_private: bool,
) -> OpsLogEntry:
    entry = await session.scalar(
        select(OpsLogEntry).where(
            OpsLogEntry.id == entry_id,
            OpsLogEntry.organisation_id == organisation_id,
        )
    )
    if entry is None or (entry.private and not can_read_private):
        raise OpsLogEntryNotFoundError()
    return entry


async def get_entry(
    session: AsyncSession,
    *,
    organisation_id: str,
    entry_id: str,
    can_read_private: bool,
) -> tuple[EntryView, list[CommentView]]:
    entry = await _get_entry(
        session,
        organisation_id=organisation_id,
        entry_id=entry_id,
        can_read_private=can_read_private,
    )
    comments = (
        await session.scalars(
            select(OpsLogComment)
            .where(OpsLogComment.entry_id == entry.id)
            .order_by(OpsLogComment.created_at, OpsLogComment.id)
        )
    ).all()
    names = await _names(session, {c.author_id for c in comments})
    [view] = await _views(session, [entry])
    return view, [
        CommentView(comment=c, author_name=names.get(c.author_id)) for c in comments
    ]


async def create_entry(
    session: AsyncSession,
    *,
    organisation_id: str,
    log_id: str,
    author: User,
    can_write_private: bool,
    payload: OpsLogEntryCreate,
) -> EntryView:
    log = await get_log(session, organisation_id=organisation_id, log_id=log_id)
    _require_active(log)
    if payload.private and not can_write_private:
        raise OpsLogForbiddenError("You cannot write private entries")
    category_id = await _usable_category(
        session, log=log, category_id=payload.category_id
    )
    entry = OpsLogEntry(
        log_id=log.id,
        organisation_id=organisation_id,
        category_id=category_id,
        occurred_at=naive_utc(payload.occurred_at)
        if payload.occurred_at
        else utc_now(),
        author_id=author.id,
        text=payload.text,
        location=payload.location,
        private=payload.private,
        source=OpsLogEntrySource.MANUAL.value,
    )
    session.add(entry)
    await session.flush()
    return EntryView(entry=entry, author_name=author.full_name or None, comment_count=0)


async def update_entry(
    session: AsyncSession,
    *,
    organisation_id: str,
    entry_id: str,
    editor: User,
    can_read_private: bool,
    payload: OpsLogEntryUpdate,
) -> EntryView:
    """Change an entry under its log's edit rule. The audit keeps the old values."""
    entry = await _get_entry(
        session,
        organisation_id=organisation_id,
        entry_id=entry_id,
        can_read_private=can_read_private,
    )
    log = await get_log(session, organisation_id=organisation_id, log_id=entry.log_id)
    _require_active(log)
    if entry.source == OpsLogEntrySource.AUTOMATIC.value:
        raise OpsLogConflictError("Automatic entries cannot be edited; add a comment")
    if log.edit_rule != OpsLogEditRule.OPEN.value:
        raise OpsLogConflictError("Entries in this log cannot be edited")
    if entry.author_id != editor.id:
        raise OpsLogForbiddenError("Only the author can edit an entry")
    now = utc_now()
    if log.edit_window_minutes is not None and now > entry.created_at + timedelta(
        minutes=log.edit_window_minutes
    ):
        raise OpsLogConflictError("The edit window for this entry has closed")
    sent = payload.model_fields_set
    if "text" in sent and payload.text is not None:
        entry.text = payload.text
    if "occurred_at" in sent and payload.occurred_at is not None:
        entry.occurred_at = naive_utc(payload.occurred_at)
    if "category_id" in sent:
        entry.category_id = await _usable_category(
            session, log=log, category_id=payload.category_id
        )
    if "location" in sent:
        entry.location = payload.location
    if session.is_modified(entry):
        entry.edited_at = now
    await session.flush()
    [view] = await _views(session, [entry])
    return view


async def add_comment(
    session: AsyncSession,
    *,
    organisation_id: str,
    entry_id: str,
    author: User,
    can_read_private: bool,
    text: str,
) -> CommentView:
    entry = await _get_entry(
        session,
        organisation_id=organisation_id,
        entry_id=entry_id,
        can_read_private=can_read_private,
    )
    log = await get_log(session, organisation_id=organisation_id, log_id=entry.log_id)
    _require_active(log)
    if log.edit_rule == OpsLogEditRule.LOCKED.value:
        raise OpsLogConflictError("This log is locked; entries take no comments")
    comment = OpsLogComment(
        entry_id=entry.id,
        organisation_id=organisation_id,
        author_id=author.id,
        text=text,
    )
    session.add(comment)
    await session.flush()
    return CommentView(comment=comment, author_name=author.full_name or None)


# --- automatic entries ------------------------------------------------------------


async def receiving_log(
    session: AsyncSession, *, organisation_id: str, log_id: str | None
) -> OpsLog | None:
    """The active log an automatic entry goes to, or ``None`` when there is none.

    A named log must belong to the organisation; without a name, the oldest active
    log that accepts automatic entries."""
    query = select(OpsLog).where(
        OpsLog.organisation_id == organisation_id, OpsLog.archived_at.is_(None)
    )
    if log_id is not None:
        query = query.where(OpsLog.id == log_id)
    else:
        query = (
            query.where(OpsLog.automatic_entries.is_(True))
            .order_by(OpsLog.created_at, OpsLog.id)
            .limit(1)
        )
    log: OpsLog | None = await session.scalar(query)
    return log


async def entry_for_message(
    session: AsyncSession, message_id: uuid.UUID
) -> OpsLogEntry | None:
    entry: OpsLogEntry | None = await session.scalar(
        select(OpsLogEntry).where(OpsLogEntry.outbox_message_id == message_id)
    )
    return entry


async def add_automatic_entry(
    session: AsyncSession,
    *,
    log: OpsLog,
    message_id: uuid.UUID,
    text: str,
    occurred_at: datetime | None,
    category_id: str | None,
    location: str | None,
    private: bool,
    record: tuple[str, str] | None,
) -> OpsLogEntry:
    """Write the entry an outbox message asked for. An unusable category is dropped
    rather than refusing the whole entry."""
    try:
        usable = await _usable_category(session, log=log, category_id=category_id)
    except AppValidationError:
        usable = None
    entry = OpsLogEntry(
        log_id=log.id,
        organisation_id=log.organisation_id,
        category_id=usable,
        occurred_at=naive_utc(occurred_at) if occurred_at else utc_now(),
        author_id=None,
        text=text,
        location=location,
        private=private,
        source=OpsLogEntrySource.AUTOMATIC.value,
        source_kind=record[0] if record else None,
        source_id=record[1] if record else None,
        outbox_message_id=message_id,
    )
    session.add(entry)
    await session.flush()
    return entry
