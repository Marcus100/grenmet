"""Rehearse the gamification migration (PF9) inside a rolled-back transaction."""

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

REVISION = "rewardsgame20261020"
TABLES = (
    "venue",
    "trail",
    "trail_stop",
    "check_in",
    "achievement_definition",
    "achievement_award",
)


@pytest.fixture
async def before_migration(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision(REVISION)
    assert target is not None
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                for revision in scripts.iterate_revisions(
                    context.get_current_heads(), target.down_revision
                ):
                    revision.module.downgrade()
                yield connection, target.module
        finally:
            transaction.rollback()


def _exists(connection, table: str) -> bool:
    return bool(
        connection.execute(text(f"SELECT to_regclass('rewards.{table}')")).scalar()
    )


def test_upgrade_adds_tables_and_downgrade_keeps_the_ledger(before_migration):
    connection, migration = before_migration
    assert not any(_exists(connection, table) for table in TABLES)
    assert _exists(connection, "entry")

    migration.upgrade()
    assert all(_exists(connection, table) for table in TABLES)
    # One check-in per person, venue and local day is a database rule.
    constraints = {
        row[0]
        for row in connection.execute(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'rewards.check_in'::regclass AND contype = 'u'"
            )
        )
    }
    assert constraints == {"uq_rewards_check_in_day"}
    # The append-only ledger trigger is untouched.
    assert connection.execute(
        text(
            "SELECT count(*) FROM pg_trigger "
            "WHERE tgrelid = 'rewards.entry'::regclass AND tgname = 'entry_append_only'"
        )
    ).scalar_one()

    migration.downgrade()
    assert not any(_exists(connection, table) for table in TABLES)
    assert _exists(connection, "entry")
    assert _exists(connection, "program")
