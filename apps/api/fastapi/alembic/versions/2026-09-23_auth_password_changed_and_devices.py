"""Record when a password last changed and which devices signed in.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""

import sqlalchemy as sa

from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user", sa.Column("password_changed_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "user",
        sa.Column(
            "known_device_keys",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "known_device_keys")
    op.drop_column("user", "password_changed_at")
