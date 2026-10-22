"""Rehearse the membership-grant migration (ADR-0044, S1) in a rolled-back transaction."""

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

REVISION = "membershipgrant20261022"


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
    return bool(
        connection.execute(text("SELECT to_regclass('org.membership_grant')")).scalar()
    )


def test_upgrade_creates_the_table_with_a_live_unique_index(before_migration):
    connection, migration = before_migration
    assert not _exists(connection)
    migration.upgrade()
    assert _exists(connection)
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_grmig', 'gr-mig', 'Gr Mig', "
            "'business', 'active', now(), now())"
        )
    )
    user_id = connection.execute(text('SELECT id FROM "user" LIMIT 1')).scalar()
    if user_id is None:
        pytest.skip("needs one user row for the membership foreign key")
    connection.execute(
        text(
            "INSERT INTO org.membership (id, organisation_id, user_id, role, "
            "status, created_at, updated_at) VALUES ('mem_grmig', 'org_grmig', "
            ":uid, 'member', 'active', now(), now())"
        ),
        {"uid": user_id},
    )
    insert = text(
        "INSERT INTO org.membership_grant (id, membership_id, organisation_id, "
        "role_key, granted_at, revoked_at) VALUES (:id, 'mem_grmig', 'org_grmig', "
        "'events-door', now(), :revoked)"
    )
    connection.execute(insert, {"id": "grant_1", "revoked": None})
    with pytest.raises(IntegrityError, match="uq_membership_grant_live"):
        with connection.begin_nested():
            connection.execute(insert, {"id": "grant_2", "revoked": None})
    # A revoked row does not hold the slot.
    connection.execute(insert, {"id": "grant_3", "revoked": "2026-01-01"})
    migration.downgrade()
    assert not _exists(connection)
