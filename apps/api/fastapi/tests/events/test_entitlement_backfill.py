"""Rehearse the events entitlement backfill (ADR-0044, S2) in a rolled-back transaction."""

import os
import uuid

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from src.config import settings
from src.database import engine
from tests.database_target import require_owned_database

REVISION = "eventsentitlement20261022"


@pytest.fixture
async def at_previous_revision(db_async):
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
                yield connection, target.module
        finally:
            transaction.rollback()


def _org(connection, org_id: str, status: str = "active") -> None:
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, "
            "created_at, updated_at) VALUES (:id, :id, :id, 'business', :status, "
            "now(), now())"
        ),
        {"id": org_id, "status": status},
    )


def _organiser(connection, organisation_id: str | None) -> None:
    suffix = uuid.uuid4().hex[:8]
    connection.execute(
        text(
            "INSERT INTO events.organisers (id, slug, name, bio, verified, "
            "organisation_id, created_at) VALUES (gen_random_uuid(), :slug, 'N', "
            "'', true, :org, now())"
        ),
        {"slug": f"o-{suffix}", "org": organisation_id},
    )


def _apps(connection, organisation_id: str) -> list[tuple[str, bool]]:
    return [
        (row[0], row[1])
        for row in connection.execute(
            text(
                "SELECT app_key, enabled FROM org.organisation_app "
                "WHERE organisation_id = :id ORDER BY app_key"
            ),
            {"id": organisation_id},
        )
    ]


def test_linked_organisations_get_events_and_unlinked_do_not(at_previous_revision):
    connection, migration = at_previous_revision
    for org_id in ("org_evlinked", "org_evoff", "org_evhas", "org_evnone"):
        _org(connection, org_id)
    _org(connection, "org_evsusp", "suspended")
    _organiser(connection, "org_evsusp")
    _organiser(connection, "org_evlinked")
    _organiser(connection, "org_evoff")
    _organiser(connection, "org_evhas")
    _organiser(connection, None)  # legacy organiser: no organisation to entitle
    connection.execute(
        text(
            "INSERT INTO org.organisation_app "
            "(organisation_id, app_key, enabled, created_at, updated_at) VALUES "
            "('org_evoff', 'events', false, now(), now()), "
            "('org_evhas', 'events', true, now(), now()), "
            "('org_evhas', 'payments', true, now(), now())"
        )
    )

    migration.upgrade()

    assert _apps(connection, "org_evlinked") == [("events", True)]
    # A staff-set disable is kept; only missing rows are inserted.
    assert _apps(connection, "org_evoff") == [("events", False)]
    # Suspension is enforced at request time, not by withholding the product.
    assert _apps(connection, "org_evsusp") == [("events", True)]
    assert _apps(connection, "org_evhas") == [("events", True), ("payments", True)]
    assert _apps(connection, "org_evnone") == []


def test_running_twice_is_safe(at_previous_revision):
    connection, migration = at_previous_revision
    _org(connection, "org_evtwice")
    _organiser(connection, "org_evtwice")
    migration.upgrade()
    migration.upgrade()
    assert _apps(connection, "org_evtwice") == [("events", True)]
    migration.downgrade()
    assert _apps(connection, "org_evtwice") == [("events", True)]
