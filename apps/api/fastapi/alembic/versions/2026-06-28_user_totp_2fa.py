"""user: add TOTP 2FA columns

Revision ID: b2d4f6a8c1e3
Revises: a1c2e3f4d5b6
Create Date: 2026-06-28 01:30:00.000000
"""

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision = "b2d4f6a8c1e3"
down_revision = "a1c2e3f4d5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "totp_secret",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "totp_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("user", "totp_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "totp_enabled")
    op.drop_column("user", "totp_secret")
