"""Platform outbox: index pending rows by the order their payload names.

Additive. The Events refund path asks whether a refund of an order is already
waiting (``outbox.pending_for_order``: topic, ``payload ->> 'order_id'``, status
pending) on every refund and cancel. Without an index that was a scan of the whole
outbox, done rows included (they are kept for 30 days). The partial index holds only
pending rows, so it stays small. Downgrade drops it.

Revision ID: outboxorder20261031
Revises: sociallive20261030
"""

import sqlalchemy as sa

from alembic import op

revision = "outboxorder20261031"
down_revision = "sociallive20261030"
branch_labels = None
depends_on = None

INDEX = "outbox_pending_order_idx"


def upgrade() -> None:
    # A plain CREATE INDEX, not CONCURRENTLY, on purpose: the outbox is small (done
    # rows are deleted after 30 days), the build takes well under a second, and this
    # ships before launch with little traffic, so the brief write lock is harmless.
    # CONCURRENTLY would also need its own non-transactional migration step.
    op.create_index(
        INDEX,
        "outbox",
        ["topic", sa.text("(payload ->> 'order_id')")],
        schema="platform",
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="outbox", schema="platform")
