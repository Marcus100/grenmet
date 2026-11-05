"""Rehearse the payments refunds_checked_at migration in a rolled-back transaction."""

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

REVISION = "refundcheck20261031"


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


def _has_column(connection) -> bool:
    return bool(
        connection.execute(
            text(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = "
                "'payments' AND table_name = 'intent' "
                "AND column_name = 'refunds_checked_at'"
            )
        ).scalar()
    )


def test_upgrade_adds_the_nullable_column_and_downgrade_drops_it(before_migration):
    connection, migration = before_migration
    assert not _has_column(connection)
    migration.upgrade()
    assert _has_column(connection)
    migration.downgrade()
    assert not _has_column(connection)


def test_the_migration_continues_the_index_migration():
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "outboxorder20261031"
