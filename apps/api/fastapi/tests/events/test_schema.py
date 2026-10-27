"""Events lives in the ``events`` schema of the main database (ADR-0003)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_events_tables_are_in_the_main_database_without_a_private_outbox(
    db_async: AsyncSession,
) -> None:
    tables = set(
        await db_async.scalars(
            text(
                "SELECT table_name FROM information_schema.tables"
                " WHERE table_schema = 'events'"
            )
        )
    )
    assert {"listings", "organisers", "orders", "tickets", "admissions"} <= tables
    assert "outbox" not in tables  # notifications use platform.outbox


@pytest.mark.asyncio
async def test_activity_log_rejects_updates(db_async: AsyncSession) -> None:
    await db_async.execute(
        text(
            "INSERT INTO events.activity (id, entity_type, entity_id, action, actor_id)"
            " VALUES (gen_random_uuid(), 'listing', 'x', 'listing.created',"
            " gen_random_uuid())"
        )
    )
    await db_async.commit()
    with pytest.raises(DBAPIError):
        await db_async.execute(text("UPDATE events.activity SET action = 'y'"))
    await db_async.rollback()
