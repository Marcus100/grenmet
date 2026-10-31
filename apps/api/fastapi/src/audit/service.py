import json
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission
from src.exceptions import AuthorizationError, NotFoundError
from src.pagination import PaginatedResponse
from src.utils.datetime import utc_now

from . import registry
from .listener import ACTOR_KEY, ACTOR_SESSION_KEY, actor_session_fields, json_value
from .models import AuditEntry
from .schemas import AuditChangePublic, AuditEntryPublic, AuditValue

SENSITIVE_PERMISSION = "audit.view_sensitive"
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
    actor_ids = {entry.actor_user_id for entry in entries if entry.actor_user_id}
    names: dict[uuid.UUID, str] = {}
    if actor_ids:
        users = await session.execute(select(User).where(User.id.in_(actor_ids)))
        names = {user.id: user.full_name or user.email for user in users.scalars()}
    see_sensitive = has_permission(
        current_user=actor, permission_key=SENSITIVE_PERMISSION
    )
    data = [
        AuditEntryPublic(
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
                if change.get("sensitive") and not see_sensitive
                else AuditChangePublic(
                    field=change["field"],
                    old=_display(change.get("old")),
                    new=_display(change.get("new")),
                )
                for change in entry.changes
            ],
            created_at=entry.created_at,
        )
        for entry in entries
    ]
    return PaginatedResponse(data=data, count=total or 0, page=page, size=size)
