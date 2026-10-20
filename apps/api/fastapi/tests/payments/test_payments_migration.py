"""Rehearse the payments migration (PF4) inside a rolled-back transaction."""

import os

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "payments20261020"


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


def _exists(connection, name: str) -> bool:
    return bool(
        connection.execute(text("SELECT to_regclass(:n)"), {"n": name}).scalar()
    )


def test_upgrade_creates_the_schema_and_the_ledger_trigger(before_migration):
    connection, migration = before_migration
    assert not _exists(connection, "payments.ledger_entry")

    migration.upgrade()
    for table in ("intent", "attempt", "refund", "ledger_entry"):
        assert _exists(connection, f"payments.{table}")

    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, created_at, "
            "updated_at) VALUES ('org_paymig', 'paymig', 'Pay Mig', 'business', "
            "'active', now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO payments.intent (id, organisation_id, amount_minor, currency, "
            "status, provider, source_type, idempotency_key, created_at, updated_at) "
            "VALUES ('00000000-0000-0000-0000-000000000001', 'org_paymig', 100, 'XCD', "
            "'succeeded', 'manual', 'x.y', 'key-0001', now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO payments.ledger_entry (id, organisation_id, intent_id, kind, "
            "amount_minor, currency, provider, provider_event_id, created_at) VALUES "
            "('00000000-0000-0000-0000-0000000000a1', 'org_paymig', "
            "'00000000-0000-0000-0000-000000000001', 'charge', 100, 'XCD', 'manual', "
            "'manual:1', now())"
        )
    )
    for statement in (
        "UPDATE payments.ledger_entry SET amount_minor = 5",
        "DELETE FROM payments.ledger_entry",
    ):
        savepoint = connection.begin_nested()
        with pytest.raises(DBAPIError, match="append-only"):
            connection.execute(text(statement))
        savepoint.rollback()

    # The same provider event cannot be recorded twice.
    savepoint = connection.begin_nested()
    with pytest.raises(DBAPIError):
        connection.execute(
            text(
                "INSERT INTO payments.ledger_entry (id, organisation_id, intent_id, "
                "kind, amount_minor, currency, provider, provider_event_id, created_at) "
                "VALUES (gen_random_uuid(), 'org_paymig', "
                "'00000000-0000-0000-0000-000000000001', 'charge', 100, 'XCD', "
                "'manual', 'manual:1', now())"
            )
        )
    savepoint.rollback()


def test_downgrade_drops_the_schema(before_migration):
    connection, migration = before_migration
    migration.upgrade()
    migration.downgrade()
    assert not _exists(connection, "payments.intent")
    assert not connection.execute(
        text("SELECT 1 FROM pg_namespace WHERE nspname = 'payments'")
    ).scalar()
