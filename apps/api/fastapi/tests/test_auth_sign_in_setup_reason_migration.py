"""Rehearse the authsigninreason20261104 data migration in a rolled-back transaction."""

import json
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

REVISION = "authsigninreason20261104"
PREFIX = "mig-sign-in-reason-"

REASON_UNFLAGGED = {
    "field": "reason",
    "old": None,
    "new": "Work mailbox not live",
    "sensitive": False,
}
REASON_UNKEYED = {"field": "reason", "old": None, "new": "Phone is in the office"}
REASON_FLAGGED = {
    "field": "reason",
    "old": None,
    "new": "Already masked",
    "sensitive": True,
}
EXPIRY = {
    "field": "expires_at",
    "old": None,
    "new": "2026-11-05T10:00:00",
    "sensitive": False,
}
DELIVERY = {"field": "delivery_problem", "old": None, "new": None, "sensitive": False}


@pytest.fixture
async def rehearsal(db_async):
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    migration = scripts.get_revision(REVISION).module
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                yield connection, migration
        finally:
            transaction.rollback()


def _insert(connection, name: str, record_type: str, changes: list[dict]) -> str:
    entity_id = f"{PREFIX}{name}-{uuid.uuid4().hex}"
    connection.execute(
        text(
            "INSERT INTO audit_entry (id, entity_type, entity_id, record_type, record_id, "
            "action, changes, created_at) VALUES (gen_random_uuid(), 'account', :entity_id, "
            ":record_type, :entity_id, 'issued', CAST(:changes AS json), now())"
        ),
        {
            "entity_id": entity_id,
            "record_type": record_type,
            "changes": json.dumps(changes),
        },
    )
    return entity_id


def _snapshot(connection) -> dict[str, list[dict]]:
    rows = connection.execute(
        text(
            "SELECT entity_id, changes FROM audit_entry "
            "WHERE entity_id LIKE :prefix ORDER BY entity_id"
        ),
        {"prefix": f"{PREFIX}%"},
    ).all()
    return dict(rows)


def test_flags_only_unflagged_reasons_on_sign_in_setup_rows(rehearsal):
    connection, migration = rehearsal
    rows = {
        "unflagged": _insert(
            connection, "unflagged", "sign_in_setup", [EXPIRY, REASON_UNFLAGGED]
        ),
        "unkeyed": _insert(
            connection, "unkeyed", "sign_in_setup", [REASON_UNKEYED, EXPIRY]
        ),
        "flagged": _insert(
            connection, "flagged", "sign_in_setup", [EXPIRY, REASON_FLAGGED]
        ),
        "no_reason": _insert(
            connection, "no_reason", "sign_in_setup", [EXPIRY, DELIVERY]
        ),
        "other_record": _insert(connection, "other", "hr_profile", [REASON_UNFLAGGED]),
    }
    before = _snapshot(connection)
    assert len(before) == 5

    migration.upgrade()

    after = _snapshot(connection)
    assert set(after) == set(before), "no row is added or removed"
    # Only the reason of the unflagged and unkeyed rows changes; order and values stay.
    assert after[rows["unflagged"]] == [EXPIRY, {**REASON_UNFLAGGED, "sensitive": True}]
    assert after[rows["unkeyed"]] == [
        {**REASON_UNKEYED, "sensitive": True},
        EXPIRY,
    ]
    assert after[rows["flagged"]] == before[rows["flagged"]]
    assert after[rows["no_reason"]] == before[rows["no_reason"]]
    assert after[rows["other_record"]] == before[rows["other_record"]]


def test_a_row_with_a_nul_escape_is_skipped_and_does_not_abort_the_migration(
    rehearsal,
):
    connection, migration = rehearsal
    nul = _insert(
        connection,
        "nul",
        "sign_in_setup",
        [EXPIRY, {**REASON_UNFLAGGED, "new": "ten chars\x00 here"}],
    )
    plain = _insert(connection, "plain", "sign_in_setup", [REASON_UNFLAGGED])
    before = _snapshot(connection)

    migration.upgrade()

    after = _snapshot(connection)
    assert after[nul] == before[nul], "the NUL row is left for a manual fix"
    assert after[plain] == [{**REASON_UNFLAGGED, "sensitive": True}]


def test_a_second_run_changes_nothing(rehearsal):
    connection, migration = rehearsal
    _insert(connection, "again", "sign_in_setup", [EXPIRY, REASON_UNFLAGGED])
    migration.upgrade()
    first = _snapshot(connection)

    migration.upgrade()

    assert _snapshot(connection) == first


def test_downgrade_is_a_no_op_and_keeps_the_masking(rehearsal):
    connection, migration = rehearsal
    _insert(connection, "down", "sign_in_setup", [REASON_UNFLAGGED])
    migration.upgrade()
    masked = _snapshot(connection)

    migration.downgrade()

    assert _snapshot(connection) == masked


def test_the_migration_continues_the_cap_feed_chain():
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    assert revision.down_revision == "capfeedinsecure20261103"
