"""Rehearse the API-key migration (PF5) inside a rolled-back transaction."""

import os

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "orgapikeys20261020"


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


def _exists(connection) -> bool:
    return bool(connection.execute(text("SELECT to_regclass('org.api_key')")).scalar())


def test_upgrade_creates_the_table_and_downgrade_drops_it(before_migration):
    connection, migration = before_migration
    assert not _exists(connection)
    migration.upgrade()
    assert _exists(connection)
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_keymig', 'key-mig', 'Key Mig', "
            "'business', 'active', now(), now())"
        )
    )
    insert = text(
        "INSERT INTO org.api_key (id, organisation_id, name, key_prefix, key_hash, "
        "scopes, created_at) VALUES (:id, 'org_keymig', 'k', 'abcd1234', :hash, "
        "ARRAY['bookings.read'], now())"
    )
    connection.execute(insert, {"id": "key_1", "hash": "h" * 64})
    with pytest.raises(IntegrityError, match="api_key_key_hash_key"):
        with connection.begin_nested():
            connection.execute(insert, {"id": "key_2", "hash": "h" * 64})
    migration.downgrade()
    assert not _exists(connection)
