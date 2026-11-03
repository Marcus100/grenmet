"""Rehearse the cap.feed_import.insecure_since migration in a rolled-back transaction."""

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

REVISION = "capfeedinsecure20261103"


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
                "'cap' AND table_name = 'feed_import' "
                "AND column_name = 'insecure_since'"
            )
        ).scalar()
    )


def test_upgrade_adds_the_column_flags_http_feeds_and_downgrade_drops_it(
    before_migration,
):
    connection, migration = before_migration
    assert not _has_column(connection)
    connection.execute(
        text(
            "INSERT INTO cap.feed_import (id, name, url, status, created_at, updated_at) "
            "VALUES (gen_random_uuid(), 'a', 'http://a.example.org/x', 'ACTIVE', now(), now()), "
            "(gen_random_uuid(), 'b', 'https://b.example.org/x', 'ACTIVE', now(), now())"
        )
    )
    migration.upgrade()
    assert _has_column(connection)
    rows = dict(
        connection.execute(
            text("SELECT name, insecure_since IS NOT NULL FROM cap.feed_import")
        ).all()
    )
    assert rows == {"a": True, "b": False}
    migration.downgrade()
    assert not _has_column(connection)


def test_the_migration_continues_the_payroll_chain():
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "payrollpayslips20261031"
    # Later migrations may land after this one: it only has to stay in the head's history.
    history = [item.revision for item in scripts.walk_revisions()]
    assert REVISION in history
