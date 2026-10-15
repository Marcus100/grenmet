"""Notification snoozes: silence an event until a set time.

Revision ID: notifsnooze20261017
Revises: clocksite20261016
"""

import sqlalchemy as sa

from alembic import op

revision = "notifsnooze20261017"
down_revision = "clocksite20261016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_snooze",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organisation_id", sa.String(100)),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(60)),
        sa.Column("entity_id", sa.String(100)),
        sa.Column("until", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_notification_snooze_event", "notification_snooze", ["event_key", "until"]
    )


def downgrade() -> None:
    op.drop_index("ix_notification_snooze_event", table_name="notification_snooze")
    op.drop_table("notification_snooze")
