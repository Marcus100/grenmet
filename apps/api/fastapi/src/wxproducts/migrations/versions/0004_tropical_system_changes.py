"""Append-only history of edits to a tracked tropical system's identity."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "wxproducts_0004"
down_revision = "wxproducts_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tropical_system_changes",
        sa.Column("id", sa.Integer(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "system_id",
            sa.Uuid(),
            sa.ForeignKey("tropical_systems.id"),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Text(), nullable=False),
        sa.Column("actor_name", sa.Text(), nullable=False),
        sa.Column("before", JSONB(), nullable=False),
        sa.Column("after", JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "tropical_system_changes_system_idx",
        "tropical_system_changes",
        ["system_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("tropical_system_changes")
