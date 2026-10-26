"""Notification bell choice, grouping and urgent events.

Revision ID: notifbellgroup20261023
Revises: capjobskipped20261023
"""

import sqlalchemy as sa

from alembic import op

revision = "notifbellgroup20261023"
down_revision = "capjobskipped20261023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notification",
        sa.Column("in_bell", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "notification",
        sa.Column("repeat_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("notification", sa.Column("group_key", sa.String(200)))
    op.add_column(
        "notification_preference",
        sa.Column(
            "bell_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.create_table(
        "notification_occurrence",
        sa.Column("dedupe_key", sa.String(300), primary_key=True),
        sa.Column(
            "notification_id",
            sa.Uuid(),
            sa.ForeignKey("notification.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_notification_occurrence_notification_id",
        "notification_occurrence",
        ["notification_id"],
    )


def downgrade() -> None:
    op.drop_table("notification_occurrence")
    op.drop_column("notification_preference", "bell_enabled")
    op.drop_column("notification", "group_key")
    op.drop_column("notification", "repeat_count")
    op.drop_column("notification", "in_bell")
