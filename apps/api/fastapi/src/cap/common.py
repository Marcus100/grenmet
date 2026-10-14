"""Small helpers shared by the alert services."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.cap.models import (
    CapAuditEvent,
    CapSettings,
)


def _record_audit(
    *,
    session: AsyncSession,
    alert_id: uuid.UUID | None,
    actor: User,
    action: str,
    previous_state: str | None,
    next_state: str | None,
    note: str | None = None,
    payload: dict[str, object] | None = None,
) -> None:
    session.add(
        CapAuditEvent(
            alert_id=alert_id,
            actor_user_id=actor.id,
            action=action,
            previous_state=previous_state,
            next_state=next_state,
            note=note,
            payload=payload or {},
        )
    )


def _new_identifier(*, settings: CapSettings) -> str:
    if settings.wmo_oid:
        return f"urn:oid:{settings.wmo_oid}:{uuid.uuid4()}"
    return f"urn:grenmet:cap:{uuid.uuid4()}"


def _as_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _db_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)
