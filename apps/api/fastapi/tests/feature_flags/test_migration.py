"""Rehearse the feature-flags migration (PF7) inside a rolled-back transaction."""

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

REVISION = "featureflags20261020"


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


def _table_exists(connection) -> bool:
    return bool(
        connection.execute(text("SELECT to_regclass('flags.feature_flag')")).scalar()
    )


def test_upgrade_creates_the_table_and_downgrade_drops_the_schema(before_migration):
    connection, migration = before_migration
    assert not _table_exists(connection)

    migration.upgrade()
    assert _table_exists(connection)
    connection.execute(
        text(
            "INSERT INTO flags.feature_flag (id, key, description, enabled, exposed, "
            "audience, created_at, updated_at) VALUES ('flag_t', 'good-key', '', "
            "false, false, '{}'::jsonb, now(), now())"
        )
    )
    with pytest.raises(Exception, match="feature_flag_key_format_check"):
        with connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO flags.feature_flag (id, key, description, enabled, "
                    "exposed, audience, created_at, updated_at) VALUES ('flag_u', "
                    "'Bad_Key', '', false, false, '{}'::jsonb, now(), now())"
                )
            )
    with pytest.raises(Exception, match="feature_flag_key_key"):
        with connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO flags.feature_flag (id, key, description, enabled, "
                    "exposed, audience, created_at, updated_at) VALUES ('flag_v', "
                    "'good-key', '', false, false, '{}'::jsonb, now(), now())"
                )
            )

    migration.downgrade()
    assert not _table_exists(connection)
    assert not connection.execute(
        text("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'flags'")
    ).scalar()
