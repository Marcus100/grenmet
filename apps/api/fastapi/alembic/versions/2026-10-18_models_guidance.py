"""Model guidance: stored NWP point series and GMS Dashboard access requests.

Additive: three new tables in the default schema. ``model_guidance_run`` is one
stored model cycle, ``model_guidance_series`` holds the compact point series
(JSONB) for that run, and ``model_guidance_access_request`` records an
organisation's request for the ``gmsdash`` app that GMS staff decide.

Revision ID: modelguide20261018
Revises: environment20261018
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "modelguide20261018"
down_revision = "environment20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_guidance_run",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("model", sa.String(20), nullable=False),
        sa.Column("run_time", sa.DateTime(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("model", "run_time", name="uq_model_guidance_run"),
    )
    op.create_index(
        "ix_model_guidance_run_model_time",
        "model_guidance_run",
        ["model", "run_time"],
    )
    op.create_table(
        "model_guidance_series",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "run_id",
            sa.Uuid(),
            sa.ForeignKey("model_guidance_run.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("point_key", sa.String(40), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("series", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("run_id", "point_key", name="uq_model_guidance_series"),
    )
    op.create_index("ix_model_guidance_series_run", "model_guidance_series", ["run_id"])
    op.create_table(
        "model_guidance_access_request",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "requested_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("note", sa.String(500)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "decided_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("decision_note", sa.String(500)),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name=op.f("model_guidance_access_request_status_check"),
        ),
    )
    op.create_index(
        "ix_model_guidance_access_request_org",
        "model_guidance_access_request",
        ["organisation_id"],
    )
    op.create_index(
        "uq_model_guidance_access_pending",
        "model_guidance_access_request",
        ["organisation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_model_guidance_access_pending", table_name="model_guidance_access_request"
    )
    op.drop_index(
        "ix_model_guidance_access_request_org",
        table_name="model_guidance_access_request",
    )
    op.drop_table("model_guidance_access_request")
    op.drop_index("ix_model_guidance_series_run", table_name="model_guidance_series")
    op.drop_table("model_guidance_series")
    op.drop_index("ix_model_guidance_run_model_time", table_name="model_guidance_run")
    op.drop_table("model_guidance_run")
