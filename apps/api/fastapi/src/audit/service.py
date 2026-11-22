import base64
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, literal, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission
from src.exceptions import AppValidationError, AuthorizationError, NotFoundError
from src.pagination import PaginatedResponse
from src.utils.datetime import utc_now

from . import registry
from .listener import ACTOR_KEY, ACTOR_SESSION_KEY, actor_session_fields, json_value
from .models import AuditEntry
from .schemas import (
    AuditChangePublic,
    AuditEntryAdminPage,
    AuditEntryAdminPublic,
    AuditEntryPublic,
    AuditValue,
)

SENSITIVE_PERMISSION = "audit.view_sensitive"
ADMIN_READ_PERMISSION = "audit.entries.read"
ADMIN_DEFAULT_LIMIT = 50
ADMIN_MAX_LIMIT = 200
SYSTEM_ACTOR = "System"


def set_actor(session: AsyncSession, actor_id: uuid.UUID | None) -> None:
    """Attribute this session's later flushes to ``actor_id`` (None = system).

    Leaves the sign-in kind alone: a service may name the actor again later in the
    same request, and the request's sign-in (``set_actor_session``) stays."""
    session.info[ACTOR_KEY] = actor_id


def set_actor_session(session: AsyncSession, *, app: str | None) -> None:
    """Record how the actor signed in: an app session (``app`` = its key) or, when
    ``app`` is None, an account session.

    Once per request, first writer wins: a later dependency in the same request
    cannot change the value, so the stamp always matches the token the request
    presented. ``clear_actor_session`` undoes it for a request that ends up a guest."""
    session.info.setdefault(
        ACTOR_SESSION_KEY, ("app", app) if app else ("account", None)
    )


def clear_actor_session(session: AsyncSession) -> None:
    """Forget the sign-in kind (the request turned out to have no signed-in actor)."""
    session.info.pop(ACTOR_SESSION_KEY, None)


async def record_change(
    session: AsyncSession,
    *,
    entity_type: str,
    entity_id: str,
    record_type: str,
    record_id: str,
    action: str,
    changes: dict[str, tuple[Any, Any]],
    sensitive: frozenset[str] = frozenset(),
    organisation_id: str | None = None,
) -> None:
    """Explicit entry for writes the flush listener cannot see (bulk statements)."""
    actor_kind, actor_app = actor_session_fields(session.info)
    session.add(
        AuditEntry(
            entity_type=entity_type,
            entity_id=entity_id,
            record_type=record_type,
            record_id=record_id,
            organisation_id=organisation_id,
            action=action,
            actor_user_id=session.info.get(ACTOR_KEY),
            actor_session=actor_kind,
            actor_app=actor_app,
            changes=[
                {
                    "field": field,
                    "old": json_value(old),
                    "new": json_value(new),
                    "sensitive": field in sensitive,
                }
                for field, (old, new) in changes.items()
            ],
            created_at=utc_now(),
        )
    )


def _display(value: Any) -> AuditValue:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    return json.dumps(value, default=str)


async def list_history(
    *,
    session: AsyncSession,
    actor: User,
    entity_type: str,
    entity_id: str,
    page: int = 1,
    size: int = 50,
) -> PaginatedResponse[AuditEntryPublic]:
    check = registry.read_check(entity_type)
    if check is None:
        raise NotFoundError("No history is kept for this kind of record")
    if not actor.is_superuser and not await check(session, actor, entity_id):
        raise AuthorizationError("You cannot view this record's history")

    base = select(AuditEntry).where(
        AuditEntry.entity_type == entity_type, AuditEntry.entity_id == entity_id
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    entries = list(
        (
            await session.execute(
                base.order_by(AuditEntry.created_at.desc(), AuditEntry.id)
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    names = await _actor_names(session, entries)
    see_sensitive = has_permission(
        current_user=actor, permission_key=SENSITIVE_PERMISSION
    )
    data = [
        _public_entry(entry, names, see_sensitive=see_sensitive) for entry in entries
    ]
    return PaginatedResponse(data=data, count=total or 0, page=page, size=size)


async def _actor_names(
    session: AsyncSession, entries: list[AuditEntry]
) -> dict[uuid.UUID, str]:
    actor_ids = {entry.actor_user_id for entry in entries if entry.actor_user_id}
    if not actor_ids:
        return {}
    users = await session.execute(select(User).where(User.id.in_(actor_ids)))
    return {user.id: user.full_name or user.email for user in users.scalars()}


def _public_entry(
    entry: AuditEntry, names: dict[uuid.UUID, str], *, see_sensitive: bool
) -> AuditEntryPublic:
    # A change is masked when it was stored as sensitive OR the registry marks the
    # field sensitive now: rows written before a field was marked still mask.
    return AuditEntryPublic(
        id=entry.id,
        record_type=entry.record_type,
        record_label=registry.record_label(entry.record_type),
        record_id=entry.record_id,
        action=entry.action,
        actor_user_id=entry.actor_user_id,
        actor_name=(
            names.get(entry.actor_user_id, "Former user")
            if entry.actor_user_id
            else SYSTEM_ACTOR
        ),
        actor_session=entry.actor_session,
        actor_app=entry.actor_app,
        changes=[
            AuditChangePublic(field=change["field"], masked=True)
            if not see_sensitive
            and (
                change.get("sensitive")
                or change["field"] in registry.sensitive_fields(entry.record_type)
            )
            else AuditChangePublic(
                field=change["field"],
                old=_display(change.get("old")),
                new=_display(change.get("new")),
            )
            for change in entry.changes
        ],
        created_at=entry.created_at,
    )


async def list_admin_entries(
    *,
    session: AsyncSession,
    actor: User,
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    organisation_id: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    cursor: str | None = None,
    limit: int = ADMIN_DEFAULT_LIMIT,
) -> AuditEntryAdminPage:
    """The global log, newest first, one keyset page at a time.

    The caller holds ``ADMIN_READ_PERMISSION`` (the router checks it). Filters and
    the keyset run in SQL; the page reads ``limit + 1`` rows to learn whether a next
    page exists, so no query is unbounded.
    """
    start = _naive_utc(created_from) if created_from is not None else None
    end = _naive_utc(created_to) if created_to is not None else None
    if start is not None and end is not None and start > end:
        raise AppValidationError("created_from must not be after created_to")

    stmt = select(AuditEntry)
    if actor_id is not None:
        stmt = stmt.where(AuditEntry.actor_user_id == actor_id)
    if action:
        stmt = stmt.where(AuditEntry.action == action)
    if entity_type:
        stmt = stmt.where(AuditEntry.entity_type == entity_type)
    if organisation_id:
        stmt = stmt.where(AuditEntry.organisation_id == organisation_id)
    if start is not None:
        stmt = stmt.where(AuditEntry.created_at >= start)
    if end is not None:
        stmt = stmt.where(AuditEntry.created_at <= end)
    if cursor is not None:
        after_stamp, after_id = _decode_cursor(cursor)
        # Strictly after the cursor in (created_at desc, id desc) order.
        stmt = stmt.where(
            tuple_(AuditEntry.created_at, AuditEntry.id)
            < tuple_(literal(after_stamp), literal(after_id))
        )
    rows = list(
        (
            await session.execute(
                stmt.order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc()).limit(
                    limit + 1
                )
            )
        )
        .scalars()
        .all()
    )
    page = rows[:limit]
    next_cursor = _encode_cursor(page[-1]) if len(rows) > limit else None
    names = await _actor_names(session, page)
    see_sensitive = has_permission(
        current_user=actor, permission_key=SENSITIVE_PERMISSION
    )
    data = [
        AuditEntryAdminPublic(
            **_public_entry(entry, names, see_sensitive=see_sensitive).model_dump(),
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            organisation_id=entry.organisation_id,
        )
        for entry in page
    ]
    return AuditEntryAdminPage(data=data, limit=limit, next_cursor=next_cursor)


def _naive_utc(value: datetime) -> datetime:
    """Stored timestamps are naive UTC (src.utils.datetime.utc_now)."""
    if value.tzinfo is None:
        raise AppValidationError("Dates must include a timezone")
    try:
        return value.astimezone(UTC).replace(tzinfo=None)
    except OverflowError as exc:  # year 1 with a positive offset steps before year 1
        raise AppValidationError("That date is outside the audit log") from exc


def _encode_cursor(entry: AuditEntry) -> str:
    raw = json.dumps(
        {"t": entry.created_at.isoformat(), "i": str(entry.id)},
        separators=(",", ":"),
    )
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        stamp = datetime.fromisoformat(payload["t"])
        after_id = uuid.UUID(payload["i"])
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise AppValidationError("The cursor is not valid") from exc
    if stamp.tzinfo is not None:
        raise AppValidationError("The cursor is not valid")
    return stamp, after_id
