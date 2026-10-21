"""Tables that hold a required ``contact_id`` (ADR-0028).

A domain's per-person role row (for example ``bookings.customer``) points at a
contact and keeps no personal data of its own. Merging two contacts deletes one,
so every such table is registered here and moved to the surviving contact in the
merge's transaction. Register at import time from the domain's ``models.py``.

A table whose rows must stay unique per contact passes ``merge``: an async
function ``(session, from_id, to_id)`` that moves or folds the rows itself.
Without it the rows are simply re-pointed.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

Merge = Callable[[AsyncSession, str, str], Awaitable[None]]


@dataclass(frozen=True)
class Reference:
    table: sa.Table
    merge: Merge | None = None


_REFERENCES: list[Reference] = []


def register(table: sa.Table, *, merge: Merge | None = None) -> None:
    """Add a table whose ``contact_id`` column references ``org.contact.id``."""
    if "contact_id" not in table.c:
        raise ValueError(f"{table.fullname} has no contact_id column")
    if all(ref.table is not table for ref in _REFERENCES):
        _REFERENCES.append(Reference(table, merge))


def registered() -> list[sa.Table]:
    return [ref.table for ref in _REFERENCES]


async def move_all(session: AsyncSession, *, from_id: str, to_id: str) -> None:
    """Move every registered row from one contact to another (no commit)."""
    for ref in _REFERENCES:
        if ref.merge is not None:
            await ref.merge(session, from_id, to_id)
            continue
        await session.execute(
            sa.update(ref.table)
            .where(ref.table.c.contact_id == from_id)
            .values(contact_id=to_id)
        )
