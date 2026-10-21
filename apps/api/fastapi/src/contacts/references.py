"""Tables that hold a required ``contact_id`` (ADR-0028).

A domain's per-person role row (for example ``bookings.customer``) points at a
contact and keeps no personal data of its own. Merging two contacts deletes one,
so every such table is registered here and re-pointed to the surviving contact in
the merge's transaction. Register at import time from the domain's ``models.py``.
"""

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

_TABLES: list[sa.Table] = []


def register(table: sa.Table) -> None:
    """Add a table whose ``contact_id`` column references ``org.contact.id``."""
    if "contact_id" not in table.c:
        raise ValueError(f"{table.fullname} has no contact_id column")
    if table not in _TABLES:
        _TABLES.append(table)


def registered() -> list[sa.Table]:
    return list(_TABLES)


async def move_all(session: AsyncSession, *, from_id: str, to_id: str) -> None:
    """Move every registered row from one contact to another (no commit)."""
    for table in _TABLES:
        await session.execute(
            sa.update(table)
            .where(table.c.contact_id == from_id)
            .values(contact_id=to_id)
        )
