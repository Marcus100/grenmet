"""Rehearse the outbox pending-order index migration in a rolled-back transaction."""

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

REVISION = "outboxorder20261031"
INDEX = "outbox_pending_order_idx"


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


def _definition(connection) -> str | None:
    return connection.execute(
        text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname = 'platform' AND indexname = :name"
        ),
        {"name": INDEX},
    ).scalar()


def test_upgrade_adds_the_partial_index_and_downgrade_drops_it(before_migration):
    connection, migration = before_migration
    assert _definition(connection) is None
    migration.upgrade()
    definition = _definition(connection)
    assert definition is not None
    assert "(payload ->> 'order_id'::text)" in definition
    assert "WHERE ((status)::text = 'pending'::text)" in definition
    migration.downgrade()
    assert _definition(connection) is None


def test_the_migration_continues_the_dev_head():
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "sociallive20261030"
