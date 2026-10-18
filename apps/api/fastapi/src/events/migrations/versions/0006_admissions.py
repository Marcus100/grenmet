"""Door admissions (E2): one row per admitted ticket.

``ticket_id`` is unique, so a ticket can be admitted once even when two devices
scan it at the same moment. The optional client ``idempotency_key`` lets a
retried scan replay its own success instead of reading as a duplicate.
"""

from alembic import op

revision = "events_0006"
down_revision = "events_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE admissions (
          id UUID PRIMARY KEY,
          ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id),
          listing_id UUID NOT NULL REFERENCES listings(id),
          admitted_by UUID NOT NULL,
          admitted_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          method TEXT NOT NULL DEFAULT 'qr',
          idempotency_key TEXT
        );
        CREATE INDEX ix_admissions_listing ON admissions (listing_id, admitted_at);
        CREATE UNIQUE INDEX ux_admissions_key
          ON admissions (listing_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE admissions;
    """)
