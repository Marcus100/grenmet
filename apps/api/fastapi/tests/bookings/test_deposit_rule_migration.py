"""Rehearse the deposit-rule migration (bookingdeposit20261123) up and down inside a
rolled-back transaction: additive columns, the none default, and the checks."""

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

REVISION = "bookingdeposit20261123"
COLUMNS = {"deposit_mode", "deposit_percent", "deposit_fixed_minor"}


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    target = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(REVISION)
    assert target is not None
    assert target.down_revision == "billingappstrial20261123"
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


def test_upgrade_adds_the_rule_with_none_as_the_default(rehearsal):
    connection, migration = rehearsal
    migration.downgrade()
    assert not COLUMNS & _profile_columns(connection)

    migration.upgrade()
    assert COLUMNS <= _profile_columns(connection)
    assert {"profile_deposit_mode_check", "profile_deposit_rule_check"} <= _checks(
        connection
    )
    default = connection.execute(
        text(
            "SELECT column_default FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'profile' "
            "AND column_name = 'deposit_mode'"
        )
    ).scalar_one()
    assert "none" in default


def test_downgrade_drops_only_the_rule_columns(rehearsal):
    connection, migration = rehearsal
    before = _profile_columns(connection)
    migration.downgrade()
    after = _profile_columns(connection)
    assert before - after == COLUMNS
    assert {"payment_at_booking", "cancel_cutoff_hours"} <= after
