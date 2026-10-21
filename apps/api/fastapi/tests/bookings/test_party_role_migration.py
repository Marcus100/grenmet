"""Rehearse the bookings party/role migration inside a rolled-back transaction."""

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

REVISION = "bookingspartyrole20261021"


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


def _columns(connection) -> dict[str, str]:
    rows = connection.execute(
        text(
            "SELECT column_name, is_nullable FROM information_schema.columns "
            "WHERE table_schema = 'bookings' AND table_name = 'customer'"
        )
    )
    return dict(rows.tuples().all())


def _contact_hash_nullable(connection) -> str:
    return connection.execute(
        text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_schema = 'org' AND table_name = 'contact' "
            "AND column_name = 'email_hash'"
        )
    ).scalar_one()


def test_upgrade_drops_personal_columns_and_requires_the_contact(before_migration):
    connection, migration = before_migration
    before = _columns(connection)
    assert {"name", "email", "email_hash", "phone", "marketing_consent"} <= set(before)
    assert before["contact_id"] == "YES"
    assert _contact_hash_nullable(connection) == "NO"

    migration.upgrade()
    after = _columns(connection)
    assert set(after) == {
        "id",
        "organisation_id",
        "contact_id",
        "created_at",
        "last_booked_at",
    }
    assert after["contact_id"] == "NO"
    delete_rule = connection.execute(
        text(
            "SELECT rc.delete_rule FROM information_schema.referential_constraints rc "
            "WHERE rc.constraint_schema = 'bookings' "
            "AND rc.constraint_name = 'customer_contact_id_fkey'"
        )
    ).scalar_one()
    assert delete_rule == "NO ACTION"
    assert _contact_hash_nullable(connection) == "YES"

    migration.downgrade()
    assert set(_columns(connection)) == set(before)
