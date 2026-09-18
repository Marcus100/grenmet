"""Persist aviation working drafts and revision snapshots."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "wxproducts_0002"
down_revision = "wxproducts_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "aviation_drafts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("station", sa.Text(), nullable=False),
        sa.Column("content", JSONB(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),
        sa.Column("actor_name", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('METAR', 'SPECI', 'TAF')", name="aviation_kind"),
        sa.CheckConstraint("station ~ '^[A-Z]{4}$'", name="aviation_station"),
        sa.CheckConstraint("revision > 0", name="aviation_revision_positive"),
    )
    op.create_index(
        "aviation_drafts_station_kind_idx", "aviation_drafts", ["station", "kind"]
    )
    op.create_table(
        "aviation_draft_revisions",
        sa.Column(
            "draft_id", sa.Uuid(), sa.ForeignKey("aviation_drafts.id"), primary_key=True
        ),
        sa.Column("revision", sa.Integer(), primary_key=True),
        sa.Column("content", JSONB(), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),
        sa.Column("actor_name", sa.String(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    raise RuntimeError(
        "Aviation draft history requires explicit retention review before removal"
    )
