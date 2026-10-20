"""Rehearse the social-layer migration (PF10) inside a rolled-back transaction."""

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

REVISION = "rewardssocial20261020"
TABLES = ("leaderboard_opt_in", "challenge", "challenge_progress", "gift")


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
    # One live gift per source stamp and one opt-in row per person and scope.
    indexes = {
        row[0]
        for row in connection.execute(
            text("SELECT indexname FROM pg_indexes WHERE schemaname = 'rewards'")
        )
    }
    assert {"uq_rewards_gift_live_source", "ix_rewards_opt_in_scope"} <= indexes
    # Gifts are not ledger rows: the ledger has no gift reference.
    columns = {
        row[0]
        for row in connection.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'rewards' AND table_name = 'entry'"
            )
        )
    }
    assert not {c for c in columns if "gift" in c}
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
