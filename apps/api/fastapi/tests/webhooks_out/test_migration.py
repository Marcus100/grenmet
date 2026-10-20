"""Rehearse the outbound webhooks migration (PF6) inside a rolled-back transaction."""

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

REVISION = "webhooksout20261020"


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


def test_upgrade_creates_tables_and_downgrade_drops_the_schema(before_migration):
    connection, migration = before_migration
    assert not _exists(connection, "webhooks.endpoint")
    migration.upgrade()
    assert _exists(connection, "webhooks.endpoint")
    assert _exists(connection, "webhooks.delivery")
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_hookmig', 'hook-mig', "
            "'Hook Mig', 'business', 'active', now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO webhooks.endpoint (id, organisation_id, url, event_types, "
            "secret_encrypted, status, consecutive_failures, created_at, updated_at) "
            "VALUES ('whe_x', 'org_hookmig', 'https://a.example.com', '{*}', "
            "'fernet:v1:x', 'active', 0, now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO webhooks.delivery (id, endpoint_id, event_id, event_type, "
            "attempts, status, created_at, updated_at) VALUES "
            "('whd_x', 'whe_x', 'evt_1', 'booking.created', 0, 'pending', now(), now())"
        )
    )
    # Deleting an organisation cascades to its endpoints and their deliveries.
    connection.execute(text("DELETE FROM org.organisation WHERE id = 'org_hookmig'"))
    assert (
        connection.execute(text("SELECT count(*) FROM webhooks.delivery")).scalar() == 0
    )
    migration.downgrade()
    assert not _exists(connection, "webhooks.endpoint")
    assert not _exists(connection, "webhooks.delivery")
