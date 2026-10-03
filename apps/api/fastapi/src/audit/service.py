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
from .listener import ACTOR_KEY, json_value
from .models import AuditEntry
from .schemas import AuditChangePublic, AuditEntryPublic, AuditValue

SENSITIVE_PERMISSION = "audit.view_sensitive"
SYSTEM_ACTOR = "System"


def set_actor(session: AsyncSession, actor_id: uuid.UUID | None) -> None:
    """Attribute this session's later flushes to ``actor_id`` (None = system)."""
    session.info[ACTOR_KEY] = actor_id


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
    session.add(
        AuditEntry(
            entity_type=entity_type,
            entity_id=entity_id,
            record_type=record_type,
            record_id=record_id,
            organisation_id=organisation_id,
            action=action,
            actor_user_id=session.info.get(ACTOR_KEY),
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
