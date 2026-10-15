"""Clock sites for token-based clock-in.

Revision ID: clocksite20261016
Revises: rosterrules20261015
"""

import sqlalchemy as sa

from alembic import op

revision = "clocksite20261016"
down_revision = "rosterrules20261015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clock_site",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "department_id",
            sa.String(),
            sa.ForeignKey("hr.department.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema="hr",
    )
    op.create_index(
        "ix_hr_clock_site_department_id", "clock_site", ["department_id"], schema="hr"
    )
    op.create_index(
        "ix_hr_clock_site_token_hash",
        "clock_site",
        ["token_hash"],
        unique=True,
        schema="hr",
    )


def downgrade() -> None:
    op.drop_table("clock_site", schema="hr")
