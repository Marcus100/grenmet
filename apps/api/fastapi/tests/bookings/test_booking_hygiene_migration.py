"""Rehearse the booking-hygiene migration (bookinghygiene20261124) up and down inside a
rolled-back transaction: two additive profile columns, server defaults so the previous
release still inserts profiles, the checks, and a downgrade that drops only what it
added. Also: a single Alembic head."""

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

REVISION = "bookinghygiene20261124"
COLUMNS = {"pending_expiry_hours", "max_open_per_customer"}
CHECKS = {
    "profile_pending_expiry_hours_check",
    "profile_max_open_per_customer_check",
}


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    target = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION)
    assert target is not None
    assert target.down_revision == "bookingtypecover20261124"
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            with Operations.context(MigrationContext.configure(connection)):
                yield connection, target.module
        finally:
            transaction.rollback()


def _profile_columns(connection) -> set[str]:
    rows = connection.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'profile'"
        )
    )
    return {row[0] for row in rows}


def _checks(connection) -> set[str]:
    rows = connection.execute(
        text(
            "SELECT conname FROM pg_constraint c "
            "JOIN pg_class t ON t.oid = c.conrelid "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "WHERE n.nspname = 'bookings' AND t.relname = 'profile' AND c.contype = 'c'"
        )
    )
    return {row[0] for row in rows}


def test_there_is_a_single_alembic_head() -> None:
    # Later slices stack on this one; the head moves with each new revision.
    heads = ScriptDirectory.from_config(Config("alembic.ini")).get_heads()
    assert heads == ["bookingpaused20261125"]


def test_upgrade_adds_both_columns_with_their_defaults(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    assert not COLUMNS & _profile_columns(connection)

    migration.upgrade()
    assert COLUMNS <= _profile_columns(connection)
    assert CHECKS <= _checks(connection)
    defaults = dict(
        connection.execute(
            text(
                "SELECT column_name, column_default FROM information_schema.columns "
                "WHERE table_schema = 'bookings' AND table_name = 'profile' "
                "AND column_name = ANY(:names)"
            ),
            {"names": list(COLUMNS)},
        ).all()
    )
    # The previous release inserts profiles without these columns: the defaults apply.
    assert "24" in defaults["pending_expiry_hours"]
    assert "3" in defaults["max_open_per_customer"]


def test_max_open_is_not_null_and_expiry_window_is_nullable(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    migration.upgrade()
    nullable = dict(
        connection.execute(
            text(
                "SELECT column_name, is_nullable FROM information_schema.columns "
                "WHERE table_schema = 'bookings' AND table_name = 'profile' "
                "AND column_name = ANY(:names)"
            ),
            {"names": list(COLUMNS)},
        ).all()
    )
    assert nullable == {"pending_expiry_hours": "YES", "max_open_per_customer": "NO"}


def test_downgrade_drops_only_what_it_added(rehearsal):
    connection, migration = rehearsal
    before = _profile_columns(connection)
    migration.downgrade()
    after = _profile_columns(connection)
    assert before - after == COLUMNS
    assert {"payment_at_booking", "cancel_cutoff_hours", "business_type"} <= after
    assert not CHECKS & _checks(connection)
