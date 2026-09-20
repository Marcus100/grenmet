"""hr user_profile remove name columns

Revision ID: c7e2f4a1b9d3
Revises: b5a1503a7136
Create Date: 2026-03-06

Drops first_name, middle_name, last_name, display_name from hr.user_profile.
Auth User is the single source of truth for names; HR reads from it.
"""

import sqlalchemy as sa

from alembic import op

revision = "c7e2f4a1b9d3"
down_revision = "b5a1503a7136"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("user_profile", "display_name", schema="hr")
    op.drop_column("user_profile", "last_name", schema="hr")
    op.drop_column("user_profile", "middle_name", schema="hr")
    op.drop_column("user_profile", "first_name", schema="hr")


def downgrade() -> None:
    op.add_column(
        "user_profile",
        sa.Column(
            "first_name",
            sa.String(length=100),
            nullable=False,
            server_default="",
        ),
        schema="hr",
    )
    op.add_column(
        "user_profile",
        sa.Column(
            "middle_name",
            sa.String(length=100),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "user_profile",
        sa.Column(
            "last_name",
            sa.String(length=100),
            nullable=False,
            server_default="",
        ),
        schema="hr",
    )
    op.add_column(
        "user_profile",
        sa.Column(
            "display_name",
            sa.String(length=150),
            nullable=True,
        ),
        schema="hr",
    )
    op.alter_column(
        "user_profile",
        "first_name",
        server_default=None,
        schema="hr",
    )
    op.alter_column(
        "user_profile",
        "last_name",
        server_default=None,
        schema="hr",
    )
