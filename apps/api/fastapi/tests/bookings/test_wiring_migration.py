"""Rehearse the bookings contact-link migration inside a rolled-back transaction."""

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

REVISION = "wiring20261020"


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
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = 'bookings' AND table_name = 'customer' "
                "AND column_name = 'contact_id'"
            )
        ).scalar_one()
    )


def test_upgrade_adds_a_nullable_set_null_link_and_downgrade_removes_it(
    before_migration,
):
    connection, migration = before_migration
    assert not _has_column(connection)

    migration.upgrade()
    assert _has_column(connection)
    nullable, on_delete = connection.execute(
        text(
            "SELECT c.is_nullable, rc.delete_rule "
            "FROM information_schema.columns c "
            "JOIN information_schema.key_column_usage k "
            "  ON k.table_schema = c.table_schema AND k.table_name = c.table_name "
            "  AND k.column_name = c.column_name "
            "JOIN information_schema.referential_constraints rc "
            "  ON rc.constraint_name = k.constraint_name "
            "WHERE c.table_schema = 'bookings' AND c.table_name = 'customer' "
            "AND c.column_name = 'contact_id'"
        )
    ).one()
    assert (nullable, on_delete) == ("YES", "SET NULL")

    migration.downgrade()
    assert not _has_column(connection)
