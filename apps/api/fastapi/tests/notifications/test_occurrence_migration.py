"""Step the nullable notification occurrence revision up and down in a rolled-back transaction."""

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

REVISION = "notifoccurrencenull20261025"


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


def _nullable(connection) -> bool:
    return (
        connection.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns"
                " WHERE table_name = 'notification_occurrence'"
                " AND column_name = 'notification_id'"
            )
        ).scalar_one()
        == "YES"
    )


def test_before_the_revision_the_column_is_required(before_migration):
    connection, _ = before_migration
    assert not _nullable(connection)


def test_upgrade_allows_orphans_and_downgrade_removes_them(before_migration):
    connection, migration = before_migration
    migration.upgrade()
    assert _nullable(connection)
    connection.execute(
        text(
            "INSERT INTO notification_occurrence (dedupe_key, notification_id,"
            " created_at) VALUES ('orphan', NULL, now())"
        )
    )

    migration.downgrade()

    assert not _nullable(connection)
    assert (
        connection.execute(
            text("SELECT count(*) FROM notification_occurrence")
        ).scalar_one()
        == 0
    )
