"""Rehearse the public-sites migration (PF1) inside a rolled-back transaction."""

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

REVISION = "orgsites20261020"


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
        connection.execute(text("SELECT to_regclass('org.public_site')")).scalar()
    )


def test_upgrade_seeds_sites_and_downgrade_drops_only_the_table(before_migration):
    connection, migration = before_migration
    assert not _table_exists(connection)
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_rewardsco', 'rewards-co', "
            "'Rewards Co', 'business', 'active', now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO rewards.program (id, organisation_id, name, kind, "
            "stamps_required, reward_description, qualifying_source_type, "
            "stamps_per_source, status, created_at, updated_at) VALUES "
            "(gen_random_uuid(), 'org_rewardsco', 'Card', 'stamp_card', 5, "
            "'Free coffee', 'events.admission', 1, 'active', now(), now())"
        )
    )

    migration.upgrade()
    sites = dict(
        connection.execute(
            text("SELECT key, organisation_id FROM org.public_site")
        ).all()
    )
    assert sites["barrels"] == "barrels"
    assert sites["signal"] == "barrels"
    has_gaa = connection.execute(
        text("SELECT 1 FROM org.organisation WHERE id = 'gaa'")
    ).scalar()
    if has_gaa:
        assert sites["mbia"] == "gaa"
        assert sites["gms-alerts"] == "gaa"
    kind = connection.execute(
        text("SELECT kind FROM org.organisation WHERE id = 'barrels'")
    ).scalar_one()
    assert kind == "barrels"
    # Organisations already running a rewards programme keep access.
    assert connection.execute(
        text(
            "SELECT enabled FROM org.organisation_app "
            "WHERE organisation_id = 'org_rewardsco' AND app_key = 'rewards'"
        )
    ).scalar_one()

    migration.downgrade()
    assert not _table_exists(connection)
    assert connection.execute(
        text("SELECT 1 FROM org.organisation WHERE id = 'barrels'")
    ).scalar()
