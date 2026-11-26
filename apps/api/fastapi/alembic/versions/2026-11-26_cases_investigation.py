"""Case engine: investigation, contributing factors and their links (ADR-0069 decision 5).

Additive: four new tables (factor_seed included) in the existing ``cases`` schema.
Nothing existing changes.
Hand-written so every constraint and index name is explicit.

Revision ID: casesinvestigation20261126
Revises: cases20261126
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "casesinvestigation20261126"
down_revision = "cases20261126"
branch_labels = None
depends_on = None

SCHEMA = "cases"
_ORG = "org.organisation.id"
_PROGRAMME = (
    "programme IN ('safety', 'aviation_security', 'occupational_health', "
    "'environmental_management')"
)
_CASE_KEY = ["cases.case.id", "cases.case.organisation_id", "cases.case.programme"]
_CATEGORIES = (
    "category IN ('human_factors', 'procedures', 'equipment', 'environment', "
    "'organisation', 'training', 'communication', 'supervision')"
)


def upgrade() -> None:
    op.create_table(
        "contributing_factor",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("contributing_factor_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "id",
            "organisation_id",
            "programme",
            name="contributing_factor_id_organisation_programme",
        ),
        sa.CheckConstraint(
            _PROGRAMME, name=op.f("contributing_factor_programme_check")
        ),
        sa.CheckConstraint(
            _CATEGORIES, name=op.f("contributing_factor_category_check")
        ),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 120",
            name=op.f("contributing_factor_name_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("cases_contributing_factor_organisation_id_idx"),
        "contributing_factor",
        ["organisation_id"],
        schema=SCHEMA,
    )
    # Names are unique per programme, ignoring case.
    op.create_index(
        "contributing_factor_name",
        "contributing_factor",
        ["organisation_id", "programme", sa.text("lower(name)")],
        unique=True,
        schema=SCHEMA,
    )
    op.create_table(
        "factor_seed",
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("seeded_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint(
            "organisation_id", "programme", name=op.f("factor_seed_pkey")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("factor_seed_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("factor_seed_programme_check")),
        schema=SCHEMA,
    )
    op.create_table(
        "investigation",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("case_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("what_happened", sa.Text(), nullable=True),
        sa.Column("unsafe_acts", sa.Text(), nullable=True),
        sa.Column("unsafe_conditions", sa.Text(), nullable=True),
        sa.Column("why_steps", postgresql.JSONB(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=True),
        sa.Column("no_investigation_reason", sa.Text(), nullable=True),
        sa.Column("return_reason", sa.Text(), nullable=True),
        sa.Column("returned_by", sa.Uuid(), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_by", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("last_edited_by", sa.Uuid(), nullable=False),
        sa.Column("editor_ids", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id", "organisation_id", "programme"],
            _CASE_KEY,
            name="investigation_case_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("investigation_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("case_id", name="investigation_case"),
        sa.UniqueConstraint(
            "id",
            "organisation_id",
            "programme",
            name="investigation_id_organisation_programme",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("investigation_programme_check")),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'not_needed')",
            name=op.f("investigation_status_check"),
        ),
        sa.CheckConstraint(
            "(decided_at IS NOT NULL) = (status IN ('approved', 'not_needed'))",
            name=op.f("investigation_decided_state_check"),
        ),
        sa.CheckConstraint(
            "(decided_at IS NULL) = (decided_by IS NULL)",
            name=op.f("investigation_decided_pair_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("cases_investigation_organisation_id_idx"),
        "investigation",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "investigation_factor",
        sa.Column("investigation_id", sa.String(100), nullable=False),
        sa.Column("factor_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("name_snapshot", sa.String(120), nullable=False),
        sa.Column("category_snapshot", sa.String(20), nullable=False),
        sa.PrimaryKeyConstraint(
            "investigation_id", "factor_id", name=op.f("investigation_factor_pkey")
        ),
        sa.ForeignKeyConstraint(
            ["investigation_id", "organisation_id", "programme"],
            [
                f"{SCHEMA}.investigation.id",
                f"{SCHEMA}.investigation.organisation_id",
                f"{SCHEMA}.investigation.programme",
            ],
            name="investigation_factor_investigation_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["factor_id", "organisation_id", "programme"],
            [
                f"{SCHEMA}.contributing_factor.id",
                f"{SCHEMA}.contributing_factor.organisation_id",
                f"{SCHEMA}.contributing_factor.programme",
            ],
            name="investigation_factor_factor_fkey",
        ),
        sa.CheckConstraint(
            _PROGRAMME, name=op.f("investigation_factor_programme_check")
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("investigation_factor", schema=SCHEMA)
    op.drop_table("investigation", schema=SCHEMA)
    op.drop_table("factor_seed", schema=SCHEMA)
    op.drop_table("contributing_factor", schema=SCHEMA)
