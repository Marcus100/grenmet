"""Rehearse the variant hash migration (issue #1982) inside a rolled-back transaction."""

import os

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from src.config import settings
from src.database import engine
from src.utils.email_hash import hash_email, hash_email_variant
from tests.database_target import require_owned_database

REVISION = "contactvariant20261127"


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


def _column_exists(connection) -> bool:
    return bool(
        connection.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'org' AND table_name = 'contact' "
                "AND column_name = 'email_variant_hash'"
            )
        ).scalar()
    )


def test_backfill_fills_live_contacts_and_leaves_erased_and_walk_ins_null(
    before_migration,
) -> None:
    connection, migration = before_migration
    assert not _column_exists(connection)

    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES ('org_variantco', 'variant-co', "
            "'Variant Co', 'business', 'active', now(), now())"
        )
    )
    contacts = [
        # id, email, email_hash, erased_at
        ("con_live_1", "vic.tim+shop@gmail.com", True, False),
        ("con_live_2", "plain@example.com", True, False),
        ("con_erased", None, True, True),  # erased: email blanked, tombstone kept
        ("con_walkin", None, False, False),  # walk-in: no address at all
    ]
    for contact_id, email, has_hash, erased in contacts:
        connection.execute(
            text(
                "INSERT INTO org.contact (id, organisation_id, email_hash, email, "
                "source, erased_at, created_at, updated_at) VALUES (:id, "
                "'org_variantco', :hash, :email, 'manual', "
                "CASE WHEN :erased THEN now() ELSE NULL END, now(), now())"
            ),
            {
                "id": contact_id,
                "hash": f"tombstone-{contact_id}" if has_hash else None,
                "email": email,
                "erased": erased,
            },
        )

    migration.upgrade()

    values = dict(
        connection.execute(
            text(
                "SELECT id, email_variant_hash FROM org.contact "
                "WHERE organisation_id = 'org_variantco'"
            )
        ).all()
    )
    # The migration's copy of the rule matches the service's helper.
    assert values["con_live_1"] == hash_email_variant("vic.tim+shop@gmail.com")
    assert values["con_live_1"] == hash_email("victim@gmail.com")
    assert values["con_live_2"] == hash_email("plain@example.com")
    assert values["con_erased"] is None
    assert values["con_walkin"] is None


def test_downgrade_removes_the_column(before_migration) -> None:
    connection, migration = before_migration
    migration.upgrade()
    assert _column_exists(connection)
    migration.downgrade()
    assert not _column_exists(connection)
