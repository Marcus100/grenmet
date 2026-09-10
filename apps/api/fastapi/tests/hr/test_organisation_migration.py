"""Rehearse ownership backfill inside a rolled-back test-DB transaction."""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from src.config import settings
from src.database import engine


@pytest.fixture
def old_schema(db_async):
    _ = db_async
    assert settings.POSTGRES_DB.endswith("_test")
    path = Path("alembic/versions/2026-09-10_hr_organisation_boundary.py")
    spec = importlib.util.spec_from_file_location("organisation_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
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
