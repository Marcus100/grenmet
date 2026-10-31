"""Payments: when the refund reconciliation job last checked an intent.

Additive: a nullable ``payments.intent.refunds_checked_at``. The daily job (#869)
takes captured provider payments oldest-checked first (never checked first), so
every payment in its window is covered in turn even when a run cannot reach them
all. Existing rows start NULL (never checked). Downgrade drops the column.

Revision ID: refundcheck20261031
Revises: outboxorder20261031
"""

import sqlalchemy as sa

from alembic import op

revision = "refundcheck20261031"
down_revision = "outboxorder20261031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intent",
        sa.Column("refunds_checked_at", sa.DateTime(), nullable=True),
        schema="payments",
    )


def downgrade() -> None:
    op.drop_column("intent", "refunds_checked_at", schema="payments")
