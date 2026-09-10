"""Versioned CAP hazard profiles; no operational profiles are seeded."""

import sqlalchemy as sa

from alembic import op

revision = "b9c3d4e5f6a7"
down_revision = "a8b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hazard_profile",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("approved_by", sa.Uuid()),
        sa.Column("approved_at", sa.DateTime()),
        sa.UniqueConstraint("key", "version", name="uq_cap_profile_version"),
        schema="cap",
    )
    op.create_index(
        "ix_cap_hazard_profile_key", "hazard_profile", ["key"], schema="cap"
    )


def downgrade() -> None:
    op.drop_table("hazard_profile", schema="cap")
