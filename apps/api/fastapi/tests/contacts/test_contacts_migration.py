"""Rehearse the contacts migration (PF3) inside a rolled-back transaction."""

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

REVISION = "orgcontacts20261020"


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
        connection.execute(text("SELECT to_regclass(:name)"), {"name": table}).scalar()
    )


def test_upgrade_creates_tables_and_downgrade_drops_them(before_migration):
    connection, migration = before_migration
    assert not _exists(connection, "org.contact")
    assert not _exists(connection, "org.contact_consent")

    migration.upgrade()
    assert _exists(connection, "org.contact")
    assert _exists(connection, "org.contact_consent")
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_contactco', 'contact-co', "
            "'Contact Co', 'business', 'active', now(), now())"
        )
    )
    insert = text(
        "INSERT INTO org.contact (id, organisation_id, email_hash, source, "
        "created_at, updated_at) VALUES (:id, 'org_contactco', 'abc', 'manual', "
        "now(), now())"
    )
    connection.execute(insert, {"id": "con_1"})
    with pytest.raises(Exception, match="contact_organisation_email_hash"):
        connection.execute(insert, {"id": "con_2"})


def test_downgrade_removes_tables(before_migration):
    connection, migration = before_migration
    migration.upgrade()
    migration.downgrade()
    assert not _exists(connection, "org.contact")
    assert not _exists(connection, "org.contact_consent")
