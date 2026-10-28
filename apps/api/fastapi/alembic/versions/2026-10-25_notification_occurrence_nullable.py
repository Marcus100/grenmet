"""Let a notification occurrence exist without a notification.

A grouped event for someone with both channels off creates no notification, but
its item must still be remembered so a later channel change does not announce it.

Revision ID: notifoccurrencenull20261025
Revises: mergereturnednotif20261024
"""

import sqlalchemy as sa

from alembic import op

revision = "notifoccurrencenull20261025"
down_revision = "mergereturnednotif20261024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "notification_occurrence",
        "notification_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM notification_occurrence WHERE notification_id IS NULL")
    op.alter_column(
        "notification_occurrence",
        "notification_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
