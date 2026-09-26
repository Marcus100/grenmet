"""Rehearse the leave-ledger backfill inside a rolled-back test-DB transaction."""

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


@pytest.fixture
async def old_schema(db_async):
    from tests.factories import make_department, make_user

    await make_user(db_async)
    await make_department(db_async, "ledger_migration")
    await db_async.commit()
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision("c9d0e1f2a3b4")
    assert target is not None
    migration = target.module
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
                connection.execute(text("DELETE FROM hr.leave_balance_event"))
                yield connection, migration
        finally:
            transaction.rollback()


def _seed(connection, *, duplicate_debit: bool = False):
    user_id = connection.execute(
        text('SELECT id FROM public."user" LIMIT 1')
    ).scalar_one()
    department_id = connection.execute(
        text("SELECT id FROM hr.department WHERE id = 'ledger_migration'")
    ).scalar_one()
    request_id = connection.execute(
        text(
            "INSERT INTO hr.leave_request (id, user_id, department_id, leave_type, start_date, end_date, days_requested, days_with_pay, days_without_pay, salary_in_advance, requires_acting_appointment, status, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :user_id, :dept, 'VACATION', '2026-11-02', '2026-11-03', 2, 2, 0, false, false, 'APPROVED', now(), now()) RETURNING id"
        ),
        {"user_id": user_id, "dept": department_id},
    ).scalar_one()
    rows = [
        ("VACATION", 10, 10, None, "2026-01-01 00:00:00"),
        # Same timestamp as the opening: the id breaks the tie deterministically.
        ("VACATION", 1, 11, None, "2026-01-01 00:00:00"),
        ("VACATION", -2, 9, request_id, "2026-02-01 00:00:00"),
        ("SICK", 5, 5, None, "2026-01-01 00:00:00"),
    ]
    if duplicate_debit:
        rows.append(("VACATION", -2, 7, request_id, "2026-02-01 00:00:01"))
    for leave_type, delta, after, request, created in rows:
        connection.execute(
            text(
                "INSERT INTO hr.leave_balance_event (id, user_id, leave_type, delta_days, balance_after_days, reason, related_leave_request_id, created_by_user_id, created_at) "
                "VALUES (gen_random_uuid(), :user_id, :leave_type, :delta, :after, 'seed', :request, :user_id, :created)"
            ),
            {
                "user_id": user_id,
                "leave_type": leave_type,
                "delta": delta,
                "after": after,
                "request": request,
                "created": created,
            },
        )
    return user_id, request_id


def test_backfill_orders_and_classifies_entries(old_schema):
    connection, migration = old_schema
    _seed(connection)
    migration.upgrade()
    rows = connection.execute(
        text(
            "SELECT leave_type, sequence, entry_kind FROM hr.leave_balance_event "
            "ORDER BY leave_type, sequence"
        )
    ).all()
    assert [tuple(row) for row in rows] == [
        ("SICK", 1, "OPENING"),
        ("VACATION", 1, "OPENING"),
        ("VACATION", 2, "ADJUSTMENT"),
        ("VACATION", 3, "APPROVAL_DEBIT"),
    ]
    assert (
        connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema='hr' "
                "AND table_name='leave_balance_event' AND column_name IN ('sequence', 'entry_kind') "
                "AND is_nullable='NO'"
            )
        ).scalar_one()
        == 2
    )
    migration.downgrade()
    migration.upgrade()


def test_duplicate_debits_stop_before_ddl(old_schema):
    connection, migration = old_schema
    _, request_id = _seed(connection, duplicate_debit=True)
    with pytest.raises(RuntimeError, match=f"HR reconciliation.*{request_id}"):
        migration.upgrade()
    assert (
        connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema='hr' "
                "AND table_name='leave_balance_event' AND column_name='sequence'"
            )
        ).scalar_one()
        == 0
    )
