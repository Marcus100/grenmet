"""Rehearse the platform-organisation migration inside a rolled-back transaction."""

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

REVISION = "platformorgs20261018"


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


def _org_schema_exists(connection) -> bool:
    return bool(
        connection.execute(
            text("SELECT 1 FROM pg_namespace WHERE nspname = 'org'")
        ).scalar()
    )


def test_downgrade_removes_only_the_org_schema(before_migration):
    connection, _ = before_migration
    assert not _org_schema_exists(connection)
    assert (
        connection.execute(text("SELECT count(*) FROM hr.organisation")).scalar_one()
        >= 1
    )


def test_upgrade_backfills_one_row_per_hr_organisation(before_migration):
    connection, migration = before_migration
    connection.execute(
        text(
            "INSERT INTO hr.organisation (id, code, name) VALUES "
            "('barrels', 'BARRELS', 'Barrels Grenada'), "
            "('St_Mary-1', 'SM', 'St Mary Co')"
        )
    )
    migration.upgrade()
    rows = {
        row.id: row
        for row in connection.execute(
            text("SELECT id, slug, name, kind, status FROM org.organisation")
        )
    }
    hr_ids = set(connection.execute(text("SELECT id FROM hr.organisation")).scalars())
    assert set(rows) == hr_ids
    assert rows["gaa"].kind == "client"
    assert rows["gaa"].slug == "gaa"
    assert rows["barrels"].kind == "barrels"
    assert rows["St_Mary-1"].slug == "st-mary-1"
    assert rows["St_Mary-1"].name == "St Mary Co"
    assert {row.status for row in rows.values()} == {"active"}

    migration.downgrade()
    assert not _org_schema_exists(connection)
    assert connection.execute(
        text("SELECT count(*) FROM hr.organisation")
    ).scalar_one() == len(hr_ids)
