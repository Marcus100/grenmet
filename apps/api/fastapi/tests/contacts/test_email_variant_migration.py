"""Rehearse the variant hash migration (issue #1982) on an autocommit connection.

The migration builds its index CONCURRENTLY, which cannot run inside a
transaction, so this rehearsal cannot use the rolled-back transaction the other
migration rehearsals use. It runs on an autocommit connection, wrapped the way
``alembic/env.py`` wraps a run (``context.begin_transaction``), so the
``autocommit_block`` in the migration works. The teardown puts the schema back
as the test database had it.
"""

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
ORG = "org_variantco"


@pytest.fixture
async def before_migration(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision(REVISION)
    assert target is not None
    with engine.connect() as raw:
        connection = raw.execution_options(isolation_level="AUTOCOMMIT")
        # The test database sits at head, so the column may exist before the test.
        was_applied = _column_exists(connection)
        _drop_added(connection)
        try:
            yield connection, target.module
        finally:
            _cleanup(connection, target.module, restore=was_applied)


def _run(connection, step) -> None:
    """Run one migration step as alembic's env.py runs it: inside begin_transaction."""
    _settle(connection)
    context = MigrationContext.configure(connection)
    with Operations.context(context), context.begin_transaction():
        step()
    _settle(connection)


def _settle(connection) -> None:
    """End any transaction SQLAlchemy opened on the autocommit connection."""
    connection.commit()


def _drop_added(connection) -> None:
    connection.execute(
        text("DROP INDEX IF EXISTS org.contact_organisation_email_variant_hash_idx")
    )
    connection.execute(
        text("ALTER TABLE org.contact DROP COLUMN IF EXISTS email_variant_hash")
    )


def _cleanup(connection, migration, *, restore: bool) -> None:
    """Remove the rows the rehearsal inserted and put the schema back as it was."""
    _settle(connection)
    connection.execute(
        text("DELETE FROM org.contact WHERE organisation_id = :org"), {"org": ORG}
    )
    connection.execute(
        text("DELETE FROM org.organisation WHERE id = :org"), {"org": ORG}
    )
    _drop_added(connection)
    if restore:
        _run(connection, migration.upgrade)
    _settle(connection)


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


def _index_exists(connection) -> bool:
    return bool(
        connection.execute(
            text(
                "SELECT 1 FROM pg_indexes WHERE schemaname = 'org' "
                "AND indexname = 'contact_organisation_email_variant_hash_idx'"
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
            "created_at, updated_at) VALUES (:org, 'variant-co', "
            "'Variant Co', 'business', 'active', now(), now())"
        ),
        {"org": ORG},
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
                "source, erased_at, created_at, updated_at) VALUES (:id, :org, "
                ":hash, :email, 'manual', "
                "CASE WHEN :erased THEN now() ELSE NULL END, now(), now())"
            ),
            {
                "id": contact_id,
                "org": ORG,
                "hash": f"tombstone-{contact_id}" if has_hash else None,
                "email": email,
                "erased": erased,
            },
        )

    _run(connection, migration.upgrade)

    values = dict(
        connection.execute(
            text(
                "SELECT id, email_variant_hash FROM org.contact "
                "WHERE organisation_id = :org"
            ),
            {"org": ORG},
        ).all()
    )
    # The migration's copy of the rule matches the service's helper.
    assert values["con_live_1"] == hash_email_variant("vic.tim+shop@gmail.com")
    assert values["con_live_1"] == hash_email("victim@gmail.com")
    assert values["con_live_2"] == hash_email("plain@example.com")
    assert values["con_erased"] is None
    assert values["con_walkin"] is None
    # The index is built last, so the rehearsal can see it exists.
    assert _index_exists(connection)


def test_downgrade_removes_the_column_and_the_index(before_migration) -> None:
    connection, migration = before_migration
    _run(connection, migration.upgrade)
    assert _column_exists(connection)
    assert _index_exists(connection)
    _run(connection, migration.downgrade)
    assert not _column_exists(connection)
    assert not _index_exists(connection)
