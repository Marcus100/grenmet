"""Rehearse the platform reliability migration (PF2) inside a rolled-back transaction."""

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

REVISION = "reliability20261020"


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


def _tables(connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'platform'")
        )
    }


def test_upgrade_creates_both_tables_and_downgrade_removes_them(before_migration):
    connection, migration = before_migration
    assert _tables(connection) == set()
    migration.upgrade()
    assert _tables(connection) == {"idempotency_key", "outbox"}
    constraints = {
        row[0]
        for row in connection.execute(
            text(
                "SELECT conname FROM pg_constraint c JOIN pg_namespace n "
                "ON n.oid = c.connamespace WHERE n.nspname = 'platform'"
            )
        )
    }
    assert "idempotency_key_scope_organisation_id_key_key" in constraints
    assert "outbox_topic_dedupe_key_key" in constraints
    assert "outbox_status_check" in constraints
    migration.downgrade()
    assert _tables(connection) == set()


def test_migration_continues_the_payments_revision():
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "payments20261020"
