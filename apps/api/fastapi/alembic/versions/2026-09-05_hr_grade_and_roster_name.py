"""hr grade bands and roster display names

Revision ID: d5f2c8a4b1e6
Revises: c3e5a1b7d9f2
Create Date: 2026-09-05

Gives the HR schema the two identity facts that until now lived only in the
offline converter profile (scripts/gms-roster/profiles/gms.json):

- hr.grade — a department's seniority bands, in the order the printed roster
  groups them. Department-scoped like hr.shift_catalog, so a second department
  ships its own rows. `establishment_band` maps the local band onto the
  GAA-wide establishment ladder and stays null until that data is loaded.
- hr.employment_record.grade_id — the band this person holds.
- hr.employment_record.roster_name — what the printed roster prints for this
  person, which is not always their personnel initial + surname (the GMS roster
  prints "J. Charles" for Jude Andre Charles and "K. Bedeau" for Kenrick
  Dieonne Bedeau). Null means "derive it from the personnel record".

Schema-only; hr.grade rows and the per-person backfill are applied by
scripts/seed_department.py, which is idempotent and profile-driven.
"""

import sqlalchemy as sa

from alembic import op

revision = "d5f2c8a4b1e6"
down_revision = "c3e5a1b7d9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grade",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=150), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("establishment_band", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.UniqueConstraint(
            "department_id", "code", name="uq_hr_grade_department_code"
        ),
        schema="hr",
    )
    op.create_index(
        op.f("ix_hr_grade_department_id"),
        "grade",
        ["department_id"],
        unique=False,
        schema="hr",
    )

    op.add_column(
        "employment_record",
        sa.Column("grade_id", sa.String(length=120), nullable=True),
        schema="hr",
    )
    op.add_column(
        "employment_record",
        sa.Column("roster_name", sa.String(length=60), nullable=True),
        schema="hr",
    )
    op.create_foreign_key(
        "employment_record_grade_id_fkey",
        "employment_record",
        "grade",
        ["grade_id"],
        ["id"],
        source_schema="hr",
        referent_schema="hr",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_hr_employment_record_grade_id",
        "employment_record",
        ["grade_id"],
        unique=False,
        schema="hr",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hr_employment_record_grade_id", table_name="employment_record", schema="hr"
    )
    op.drop_constraint(
        "employment_record_grade_id_fkey",
        "employment_record",
        schema="hr",
        type_="foreignkey",
    )
    op.drop_column("employment_record", "roster_name", schema="hr")
    op.drop_column("employment_record", "grade_id", schema="hr")
    op.drop_index(op.f("ix_hr_grade_department_id"), table_name="grade", schema="hr")
    op.drop_table("grade", schema="hr")
