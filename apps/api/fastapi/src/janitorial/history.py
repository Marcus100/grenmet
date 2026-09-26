"""Revision checks and same-transaction change history for janitorial writes.

Every editable row carries a positive ``revision``. Writers send the revision
they last read; a mismatch is a 409 so concurrent edits never silently
overwrite each other. Each accepted write appends a ``change_events`` row in the
same transaction (see ``docs/products/gaa-clean-quality-cms-proposals.md``).
"""

from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .exceptions import JanitorialConflict
from .models import ChangeEvent


class Revisioned(Protocol):
    revision: int


def check_revision(record: Revisioned, expected: int) -> None:
    if record.revision != expected:
        raise JanitorialConflict(
            "This record was changed by someone else. Reload and try again."
        )


def apply(record: object, values: dict[str, Any]) -> dict[str, list[Any]]:
    """Set changed attributes; return ``{field: [old, new]}`` for history."""
    changes: dict[str, list[Any]] = {}
    for field, value in values.items():
        old = getattr(record, field)
        if old != value:
            changes[field] = [_plain(old), _plain(value)]
            setattr(record, field, value)
    return changes


def _plain(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return str(value)


def record(
    session: AsyncSession,
    *,
    entity: str,
    entity_id: object,
    revision: int,
    action: str,
    actor_id: UUID,
    changes: dict[str, Any] | None = None,
) -> None:
    session.add(
        ChangeEvent(
            entity=entity,
            entity_id=str(entity_id),
            revision=revision,
            action=action,
            actor_id=actor_id,
            changes=changes or {},
        )
    )


async def flush(session: AsyncSession, conflict: str) -> None:
    """Flush to learn generated ids early, mapping unique violations to 409."""
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise JanitorialConflict(conflict) from None


async def commit(session: AsyncSession, conflict: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise JanitorialConflict(conflict) from None
