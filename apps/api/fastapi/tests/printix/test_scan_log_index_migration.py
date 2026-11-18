"""Rehearse the printix scan-log time index migration in a rolled-back transaction."""

import os
from collections.abc import AsyncIterator
from types import ModuleType

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "printixscanlogorder20261118"
INDEX = "scan_log_pairing_id_happened_at_idx"


@pytest.fixture
async def before_migration(
    db_async: AsyncSession,
) -> AsyncIterator[tuple[Connection, ModuleType]]:
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision(REVISION)
    assert target is not None
    previous = target.down_revision
    assert isinstance(previous, str)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                for revision in scripts.iterate_revisions(
                    context.get_current_heads(), previous
                ):
                    revision.module.downgrade()
                yield connection, target.module
        finally:
            transaction.rollback()


def _definition(connection: Connection) -> str | None:
    found = connection.execute(
        text(
            "SELECT indexdef FROM pg_indexes "
            "WHERE schemaname = 'printix' AND indexname = :name"
        ),
        {"name": INDEX},
    ).scalar()
    return None if found is None else str(found)


def test_upgrade_adds_the_expression_index_and_downgrade_drops_it(
    before_migration: tuple[Connection, ModuleType],
) -> None:
    connection, migration = before_migration
    assert _definition(connection) is None
    migration.upgrade()
    definition = _definition(connection)
    assert definition is not None
    assert "pairing_id" in definition
    assert "COALESCE(offline_scanned_at, scanned_at)" in definition
    migration.downgrade()
    assert _definition(connection) is None


def test_the_migration_continues_the_current_head() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "authsessionsignedin20261116"
    assert scripts.get_heads() == [REVISION]
