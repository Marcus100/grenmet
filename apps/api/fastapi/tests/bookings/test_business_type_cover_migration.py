"""Rehearse the business-type and cover migration (bookingtypecover20261124) up and down
inside a rolled-back transaction: additive columns, the CHECK on the fixed list, and a
downgrade that drops only what it added."""

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

REVISION = "bookingtypecover20261124"
COLUMNS = {"business_type", "cover_file_id"}
FIXED_LIST = {
    "beauty",
    "hair",
    "health",
    "fitness",
    "auto",
    "home_services",
    "lessons",
    "professional",
    "tours",
    "events",
    "other",
}


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    target = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION)
    assert target is not None
    assert target.down_revision == "bookingaddons20261123"
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


def _check_definition(connection) -> str | None:
    return connection.execute(
        text(
            "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
            "JOIN pg_class t ON t.oid = c.conrelid "
            "JOIN pg_namespace n ON n.oid = t.relnamespace "
            "WHERE n.nspname = 'bookings' AND t.relname = 'profile' "
            "AND c.conname = 'profile_business_type_check'"
        )
    ).scalar_one_or_none()


def test_upgrade_adds_the_two_columns_and_the_fixed_list_check(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    assert not COLUMNS & _profile_columns(connection)
    assert _check_definition(connection) is None

    migration.upgrade()
    assert COLUMNS <= _profile_columns(connection)
    definition = _check_definition(connection)
    assert definition is not None
    for value in FIXED_LIST:
        assert f"'{value}'" in definition
    assert definition.count("'") == 2 * len(FIXED_LIST)


def test_the_new_columns_are_nullable_with_no_default(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    migration.upgrade()
    rows = connection.execute(
        text(
            "SELECT column_name, is_nullable, column_default FROM "
            "information_schema.columns WHERE table_schema = 'bookings' "
            "AND table_name = 'profile' AND column_name = ANY(:names)"
        ),
        {"names": list(COLUMNS)},
    ).all()
    assert len(rows) == 2
    assert all(
        is_nullable == "YES" and default is None for _, is_nullable, default in rows
    )


def test_downgrade_drops_only_what_it_added(rehearsal):
    connection, migration = rehearsal
    before = _profile_columns(connection)
    migration.downgrade()
    after = _profile_columns(connection)
    assert before - after == COLUMNS
    assert {"payment_at_booking", "cancel_cutoff_hours", "logo_file_id"} <= after
    assert _check_definition(connection) is None
