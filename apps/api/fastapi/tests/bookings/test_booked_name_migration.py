"""Rehearse the booked-name migration (bookingbookedname20261126) up and down inside a
rolled-back transaction: one additive nullable column on ``bookings.booking``, so the
previous release still inserts bookings, and a downgrade that drops only what it added."""

import os

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "bookingbookedname20261126"
COLUMN = "booked_name"


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    target = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION)
    assert target is not None
    assert target.down_revision == "bookingpayafteraccept20261126"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            with Operations.context(MigrationContext.configure(connection)):
                yield connection, target.module
        finally:
            transaction.rollback()


def _booking_columns(connection) -> dict[str, str]:
    rows = connection.execute(
        text(
            "SELECT column_name, is_nullable FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'booking'"
        )
    )
    return {row[0]: row[1] for row in rows}


def test_upgrade_adds_one_nullable_column(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    assert COLUMN not in _booking_columns(connection)

    migration.upgrade()
    columns = _booking_columns(connection)
    # Nullable with no default: a booking made by the previous release reads as
    # before, because every view falls back to the contact's name.
    assert columns[COLUMN] == "YES"


def test_downgrade_drops_only_what_it_added(rehearsal):
    connection, migration = rehearsal
    before = set(_booking_columns(connection))
    migration.downgrade()
    after = set(_booking_columns(connection))
    assert before - after == {COLUMN}
    assert {"pay_after_acceptance", "accepted_at", "customer_id"} <= after
