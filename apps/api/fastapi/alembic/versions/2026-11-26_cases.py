"""Case engine: cases, risk grid, risk assessments and corrective actions (ADR-0069).

Additive: a new ``cases`` schema with five tables. Nothing existing changes.
Hand-written so every constraint and index name is explicit.

Revision ID: cases20261126
Revises: opslogsummary20261126
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "cases20261126"
down_revision = "opslogsummary20261126"
branch_labels = None
depends_on = None

SCHEMA = "cases"
_ORG = "org.organisation.id"
_PROGRAMME = (
    "programme IN ('safety', 'aviation_security', 'occupational_health', "
    "'environmental_management')"
)
_CASE_KEY = ["cases.case.id", "cases.case.organisation_id", "cases.case.programme"]


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "risk_grid",
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("likelihoods", postgresql.JSONB(), nullable=False),
        sa.Column("severities", postgresql.JSONB(), nullable=False),
        sa.Column("cells", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint(
            "organisation_id", "programme", name=op.f("risk_grid_pkey")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("risk_grid_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("risk_grid_programme_check")),
        schema=SCHEMA,
    )
    op.create_table(
        "counter",
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False, autoincrement=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint(
            "organisation_id", "programme", "year", name=op.f("counter_pkey")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("counter_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("counter_programme_check")),
        schema=SCHEMA,
    )
    op.create_table(
        "case",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("reference", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(15), nullable=False),
        sa.Column("source_kind", sa.String(60), nullable=True),
        sa.Column("source_id", sa.String(100), nullable=True),
        sa.Column("reported_by", sa.Uuid(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.Uuid(), nullable=True),
        sa.Column("closed_no_risk", sa.Boolean(), nullable=False),
        sa.Column("close_reason", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("case_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "organisation_id", "programme", "reference", name="case_reference"
        ),
        sa.UniqueConstraint(
            "id", "organisation_id", "programme", name="case_id_organisation_programme"
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("case_programme_check")),
        sa.CheckConstraint(
            "status IN ('reported', 'assessing', 'investigating', 'actions', "
            "'monitoring', 'closed')",
            name=op.f("case_status_check"),
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200", name=op.f("case_title_check")
        ),
        sa.CheckConstraint(
            "(status = 'closed') = (closed_at IS NOT NULL)",
            name=op.f("case_closed_state_check"),
        ),
        sa.CheckConstraint(
            "(source_kind IS NULL) = (source_id IS NULL)",
            name=op.f("case_source_ref_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "case_organisation_programme_created_idx",
        "case",
        ["organisation_id", "programme", "created_at"],
        schema=SCHEMA,
    )
    op.create_table(
        "risk_assessment",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("case_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("likelihood", sa.SmallInteger(), nullable=False),
        sa.Column("likelihood_label", sa.String(60), nullable=False),
        sa.Column("severity", sa.String(2), nullable=False),
        sa.Column("severity_label", sa.String(60), nullable=False),
        sa.Column("band", sa.String(12), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("assessed_by", sa.Uuid(), nullable=False),
        sa.Column("accepted_by", sa.Uuid(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("acceptance_note", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id", "organisation_id", "programme"],
            _CASE_KEY,
            name="risk_assessment_case_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("risk_assessment_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("risk_assessment_programme_check")),
        sa.CheckConstraint(
            "kind IN ('initial', 'residual')", name=op.f("risk_assessment_kind_check")
        ),
        sa.CheckConstraint(
            "band IN ('acceptable', 'tolerable', 'intolerable')",
            name=op.f("risk_assessment_band_check"),
        ),
        sa.CheckConstraint(
            "(accepted_at IS NULL) = (accepted_by IS NULL)",
            name=op.f("risk_assessment_accepted_pair_check"),
        ),
        sa.CheckConstraint(
            "accepted_at IS NULL OR band = 'tolerable'",
            name=op.f("risk_assessment_accept_tolerable_only_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "risk_assessment_case_created_idx",
        "risk_assessment",
        ["case_id", "created_at"],
        schema=SCHEMA,
    )
    op.create_index(
        op.f("cases_risk_assessment_organisation_id_idx"),
        "risk_assessment",
        ["organisation_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "action",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("case_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("programme", sa.String(30), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("progress_note", sa.String(2000), nullable=True),
        sa.Column("done_at", sa.DateTime(), nullable=True),
        sa.Column("verified_by", sa.Uuid(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id", "organisation_id", "programme"],
            _CASE_KEY,
            name="action_case_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            [_ORG],
            name=op.f("action_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(_PROGRAMME, name=op.f("action_programme_check")),
        sa.CheckConstraint(
            "status IN ('open', 'done', 'verified')", name=op.f("action_status_check")
        ),
        sa.CheckConstraint(
            "char_length(title) BETWEEN 1 AND 200", name=op.f("action_title_check")
        ),
        sa.CheckConstraint(
            "(status = 'verified') = (verified_at IS NOT NULL)",
            name=op.f("action_verified_state_check"),
        ),
        schema=SCHEMA,
    )
    op.create_index("action_case_idx", "action", ["case_id"], schema=SCHEMA)
    op.create_index(
        "action_owner_status_idx", "action", ["owner_user_id", "status"], schema=SCHEMA
    )
    op.create_index(
        op.f("cases_action_organisation_id_idx"),
        "action",
        ["organisation_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("action", schema=SCHEMA)
    op.drop_table("risk_assessment", schema=SCHEMA)
    op.drop_table("case", schema=SCHEMA)
    op.drop_table("counter", schema=SCHEMA)
    op.drop_table("risk_grid", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
