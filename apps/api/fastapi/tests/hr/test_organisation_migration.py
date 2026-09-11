"""Rehearse ownership backfill inside a rolled-back test-DB transaction."""

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
async def old_schema(db, db_async):
    # Seeding commits the rows, then refresh opens a read transaction. Release
    # its locks before a separate connection performs transactional DDL.
    # The session-wide autouse legacy fixture is a second independent session.
    # Either one can retain locks after seeding or previous tests.
    db.rollback()
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision("a8b2c3d4e5f6")
    assert target is not None
    migration = target.module
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                # Remove descendants first: newer tables may reference this
                # migration's constraints. All DDL remains inside the rollback.
                for revision in scripts.iterate_revisions(
                    context.get_current_heads(), target.down_revision
                ):
                    revision.module.downgrade()
                yield connection, migration
        finally:
            transaction.rollback()


def test_backfill_and_constraints(old_schema):
    connection, migration = old_schema
    user_id = connection.execute(
        text('SELECT id FROM public."user" LIMIT 1')
    ).scalar_one()
    connection.execute(
        text(
            "INSERT INTO hr.department (id, name, created_at, updated_at) VALUES ('legacy', 'Legacy', now(), now())"
        )
    )
    connection.execute(
        text(
            "INSERT INTO hr.employment_record (id, user_id, department_id, status, created_at, updated_at) VALUES (gen_random_uuid(), :user_id, 'legacy', 'ACTIVE', now(), now())"
        ),
        {"user_id": user_id},
    )
    connection.execute(
        text(
            "INSERT INTO hr.employee_document (id, user_id, category, sensitivity, title, object_key, original_filename, content_type, size_bytes, created_at, updated_at) VALUES (gen_random_uuid(), :user_id, 'CONTRACT', 'STANDARD', 'Contract', 'test/legacy', 'contract.pdf', 'application/pdf', 10, now(), now())"
        ),
        {"user_id": user_id},
    )
    role_id = connection.execute(
        text(
            "INSERT INTO public.role (id, name, description, created_at, updated_at) VALUES (gen_random_uuid(), 'legacy-role', '', now(), now()) RETURNING id"
        )
    ).scalar_one()
    connection.execute(
        text(
            "INSERT INTO public.user_role_assignment (id, user_id, role_id, scope, effective_from, created_at, updated_at) VALUES (gen_random_uuid(), :user_id, :role_id, 'DEPARTMENT', now(), now(), now())"
        ),
        {"user_id": user_id, "role_id": role_id},
    )
    migration.upgrade()
    assert connection.execute(
        text("SELECT organisation_id, department_id FROM public.user_role_assignment")
    ).one() == ("gaa", "legacy")
    assert (
        connection.execute(
            text("SELECT organisation_id FROM hr.employee_document")
        ).scalar_one()
        == "gaa"
    )
    assert (
        connection.execute(
            text("SELECT organisation_id FROM hr.employment_record")
        ).scalar_one()
        == "gaa"
    )
    assert (
        connection.execute(text("SELECT code FROM hr.department")).scalar_one()
        == "legacy"
    )
    assert (
        connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema='hr' AND column_name='organisation_id' AND is_nullable='NO'"
            )
        ).scalar_one()
        == 3
    )


def test_orphan_document_stops_before_ddl(old_schema):
    connection, migration = old_schema
    connection.execute(
        text(
            "INSERT INTO hr.employee_document (id, user_id, category, sensitivity, title, object_key, original_filename, content_type, size_bytes, created_at, updated_at) SELECT gen_random_uuid(), id, 'CONTRACT', 'STANDARD', 'Orphan', 'test/orphan', 'contract.pdf', 'application/pdf', 10, now(), now() FROM public.\"user\" LIMIT 1"
        )
    )
    with pytest.raises(RuntimeError, match="requires employment.*IDs:"):
        migration.upgrade()
    assert (
        connection.execute(text("SELECT to_regclass('hr.organisation')")).scalar_one()
        is None
    )


def test_unattributable_assignment_stops_before_ddl(old_schema):
    connection, migration = old_schema
    role_id = connection.execute(
        text(
            "INSERT INTO public.role (id, name, description, created_at, updated_at) VALUES (gen_random_uuid(), 'legacy-role', '', now(), now()) RETURNING id"
        )
    ).scalar_one()
    connection.execute(
        text(
            "INSERT INTO public.user_role_assignment (id, user_id, role_id, scope, effective_from, created_at, updated_at) SELECT gen_random_uuid(), id, :role_id, 'ALL', now(), now(), now() FROM public.\"user\" LIMIT 1"
        ),
        {"role_id": role_id},
    )
    with pytest.raises(
        RuntimeError, match="requires an explicit department or employment.*IDs:"
    ):
        migration.upgrade()
    assert (
        connection.execute(text("SELECT to_regclass('hr.organisation')")).scalar_one()
        is None
    )
