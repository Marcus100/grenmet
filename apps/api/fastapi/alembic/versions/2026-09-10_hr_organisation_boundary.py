"""Explicit organisation ownership for the personnel foundation.

Revision ID: a8b2c3d4e5f6
Revises: f7a1c2d3e4b5

This migration is for the existing single-GAA installation. Preflight rejects
unattributable records before any DDL; PostgreSQL also rolls back the complete
migration on failure. No application or database default assigns future rows.
"""

import sqlalchemy as sa

from alembic import op

revision = "a8b2c3d4e5f6"
down_revision = "f7a1c2d3e4b5"
branch_labels = None
depends_on = None


def _reject_rows(query: str, message: str) -> None:
    rows = op.get_bind().execute(sa.text(query)).scalars().all()
    if rows:
        sample = ", ".join(str(value) for value in rows[:20])
        raise RuntimeError(f"{message}: {len(rows)} record(s); IDs: {sample}")


def upgrade() -> None:
    _reject_rows(
        "SELECT d.id FROM hr.employee_document d LEFT JOIN hr.employment_record e "
        "ON e.user_id = d.user_id WHERE e.id IS NULL ORDER BY d.id",
        "Organisation backfill requires employment for each document subject",
    )
    _reject_rows(
        "SELECT a.id FROM public.user_role_assignment a "
        "LEFT JOIN hr.department d ON d.id = a.department_id "
        "LEFT JOIN hr.employment_record e ON e.user_id = a.user_id "
        "WHERE (a.department_id IS NOT NULL AND d.id IS NULL) "
        "OR (a.department_id IS NULL AND e.id IS NULL) ORDER BY a.id",
        "Organisation backfill requires an explicit department or employment for assignments",
    )
    op.create_table(
        "organisation",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        schema="hr",
    )
    op.execute(
        "INSERT INTO hr.organisation (id, code, name) "
        "VALUES ('gaa', 'GAA', 'Grenada Airports Authority')"
    )
    for table, schema in (
        ("department", "hr"),
        ("employment_record", "hr"),
        ("employee_document", "hr"),
        ("user_role_assignment", None),
    ):
        op.add_column(
            table, sa.Column("organisation_id", sa.String(100)), schema=schema
        )

    op.add_column("department", sa.Column("code", sa.String(100)), schema="hr")
    op.execute("UPDATE hr.department SET organisation_id = 'gaa', code = id")
    op.execute(
        "UPDATE hr.employment_record e SET organisation_id = d.organisation_id "
        "FROM hr.department d WHERE e.department_id = d.id"
    )
    op.execute(
        "UPDATE hr.employee_document d SET organisation_id = e.organisation_id "
        "FROM hr.employment_record e WHERE d.user_id = e.user_id"
    )
    op.execute(
        "UPDATE public.user_role_assignment a SET organisation_id = d.organisation_id "
        "FROM hr.department d WHERE a.department_id = d.id"
    )
    op.execute(
        "UPDATE public.user_role_assignment a SET organisation_id = e.organisation_id "
        "FROM hr.employment_record e WHERE a.user_id = e.user_id "
        "AND a.department_id IS NULL"
    )
    # Make formerly implicit department grants explicit, preserving their scope.
    op.execute(
        "UPDATE public.user_role_assignment a SET department_id = e.department_id "
        "FROM hr.employment_record e WHERE a.user_id = e.user_id "
        "AND a.scope = 'DEPARTMENT' AND a.department_id IS NULL"
    )
    for table, schema in (
        ("department", "hr"),
        ("employment_record", "hr"),
        ("employee_document", "hr"),
        ("user_role_assignment", None),
    ):
        op.alter_column(table, "organisation_id", nullable=False, schema=schema)
        op.create_foreign_key(
            f"fk_{table}_organisation",
            table,
            "organisation",
            ["organisation_id"],
            ["id"],
            source_schema=schema,
            referent_schema="hr",
        )
        op.create_index(
            f"ix_{'hr_' if schema else ''}{table}_organisation_id",
            table,
            ["organisation_id"],
            schema=schema,
        )
    op.alter_column("department", "code", nullable=False, schema="hr")
    op.drop_index("ix_hr_department_name", table_name="department", schema="hr")
    for columns, name in (
        (["id", "organisation_id"], "uq_hr_department_id_org"),
        (["organisation_id", "code"], "uq_hr_department_org_code"),
        (["organisation_id", "name"], "uq_hr_department_org_name"),
    ):
        op.create_unique_constraint(name, "department", columns, schema="hr")
    op.drop_index(
        "ix_hr_employment_record_employee_number",
        table_name="employment_record",
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_employee_number",
        "employment_record",
        ["employee_number"],
        schema="hr",
    )
    op.create_unique_constraint(
        "uq_hr_employment_org_number",
        "employment_record",
        ["organisation_id", "employee_number"],
        schema="hr",
    )
    for table, schema, name in (
        ("employment_record", "hr", "fk_hr_employment_department_org"),
        ("user_role_assignment", None, "fk_role_assignment_department_org"),
    ):
        op.create_foreign_key(
            name,
            table,
            "department",
            ["department_id", "organisation_id"],
            ["id", "organisation_id"],
            source_schema=schema,
            referent_schema="hr",
        )


def downgrade() -> None:
    # Flattening multiple organisations would discard ownership and may collide
    # on the old globally unique names/numbers. Require explicit reconciliation.
    _reject_rows(
        "SELECT id FROM hr.organisation WHERE id <> 'gaa' ORDER BY id",
        "Cannot remove organisation ownership while additional organisations exist",
    )
    op.drop_constraint(
        "fk_hr_employment_department_org", "employment_record", schema="hr"
    )
    op.drop_constraint("fk_role_assignment_department_org", "user_role_assignment")
    op.drop_constraint("uq_hr_employment_org_number", "employment_record", schema="hr")
    op.drop_index(
        "ix_hr_employment_record_employee_number",
        table_name="employment_record",
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_employee_number",
        "employment_record",
        ["employee_number"],
        unique=True,
        schema="hr",
    )
    for name in (
        "uq_hr_department_org_name",
        "uq_hr_department_org_code",
        "uq_hr_department_id_org",
    ):
        op.drop_constraint(name, "department", schema="hr")
    op.create_index(
        "ix_hr_department_name", "department", ["name"], unique=True, schema="hr"
    )
    op.drop_column("department", "code", schema="hr")
    for table, schema in (
        ("employee_document", "hr"),
        ("employment_record", "hr"),
        ("user_role_assignment", None),
        ("department", "hr"),
    ):
        op.drop_constraint(f"fk_{table}_organisation", table, schema=schema)
        op.drop_index(
            f"ix_{'hr_' if schema else ''}{table}_organisation_id",
            table_name=table,
            schema=schema,
        )
        op.drop_column(table, "organisation_id", schema=schema)
    op.drop_table("organisation", schema="hr")
