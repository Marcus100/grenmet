"""Manual refunds (E5): money handed back for outlet cash tickets.

One row per refunded ticket (``ticket_id`` is unique, so a ticket is refunded
once). The ticket itself moves to ``status='refunded'``, which frees its seat and
keeps it out of admission. ``till_session_id`` links a cash refund to the till
it was paid from so settlement can subtract it from that till's expected cash;
it is null for bank refunds or when no till was open.
"""

from alembic import op

revision = "events_0009"
down_revision = "events_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE refunds (
          id UUID PRIMARY KEY,
          listing_id UUID NOT NULL REFERENCES listings(id),
          order_id UUID NOT NULL REFERENCES orders(id),
          ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id),
          amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
          method TEXT NOT NULL CHECK (method IN ('cash', 'bank')),
          reference TEXT,
          refunded_by UUID NOT NULL,
          refunded_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          till_session_id UUID REFERENCES till_sessions(id)
        );
        CREATE INDEX ix_refunds_listing ON refunds (listing_id, refunded_at);
        CREATE INDEX ix_refunds_till ON refunds (till_session_id);
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE tickets SET status = 'cancelled'
          WHERE status = 'refunded';
        DROP TABLE refunds;
    """)
