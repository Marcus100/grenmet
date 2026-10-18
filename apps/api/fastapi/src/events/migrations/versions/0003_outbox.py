"""Events outbox (F6): changes that must notify people, written in the same
Events-DB transaction as the change and drained by the worker.

``dedupe_key`` is unique so a change enqueues at most one row per effect, and it
is also the idempotency key handed to ``notifications.notify``. Payloads hold
ids and public labels only (no email addresses).
"""

from alembic import op

revision = "events_0003"
down_revision = "events_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE outbox (
          id UUID PRIMARY KEY,
          kind TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}',
          dedupe_key TEXT NOT NULL UNIQUE,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          available_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          processed_at TIMESTAMP,
          failed_at TIMESTAMP
        );
        CREATE INDEX ix_outbox_due ON outbox (available_at)
          WHERE processed_at IS NULL AND failed_at IS NULL;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE outbox")
