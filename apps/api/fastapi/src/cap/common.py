"""Small helpers shared by the alert services."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.cap.models import (
    CapAuditEvent,
    CapSettings,
)

# A plain-http feed saved before the https-only rule keeps working for this long
# after it is first flagged, then it is no longer fetched.
INSECURE_FEED_GRACE = timedelta(days=14)


def is_plain_http(url: str) -> bool:
    return url.strip().lower().startswith("http://")


def feed_grace_ends_at(insecure_since: datetime | None) -> datetime | None:
    return None if insecure_since is None else insecure_since + INSECURE_FEED_GRACE


def feed_grace_expired(insecure_since: datetime | None, now: datetime) -> bool:
    ends = feed_grace_ends_at(insecure_since)
    return ends is not None and now >= ends


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
