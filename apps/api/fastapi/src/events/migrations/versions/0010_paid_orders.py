"""Paid ticket tiers on the shared payments core (N4b, ADR-0027).

A paid online order starts ``pending_payment`` and holds its stock until the
payment arrives (tickets are then issued), the hold expires (``expired``) or the
payment is refunded (``refunded``). ``status`` is plain text, so the new values
need no constraint change.

``payment_intent_id`` points at ``payments.intent.id`` in the main database. It is
a plain UUID: ADR-0003 forbids foreign keys across databases. ``collected_minor``
and ``refunded_minor`` mirror what the payments ledger holds for the order so the
settlement report can reconcile the two. Everything here is additive; the only
rewritten object is the ``payment_method`` check, widened to allow ``online``.
"""

from alembic import op

revision = "events_0010"
down_revision = "events_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE orders
          ADD COLUMN payment_intent_id UUID,
          ADD COLUMN payment_expires_at TIMESTAMP,
          ADD COLUMN paid_at TIMESTAMP,
          ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0,
          DROP CONSTRAINT orders_payment_method_check,
          ADD CONSTRAINT orders_payment_method_check
            CHECK (payment_method IN ('none', 'cash_outlet', 'online'));
        CREATE INDEX ix_orders_payment_intent
          ON orders (payment_intent_id) WHERE payment_intent_id IS NOT NULL;
        CREATE INDEX ix_orders_pending_expiry
          ON orders (payment_expires_at) WHERE status = 'pending_payment';
        CREATE UNIQUE INDEX ux_orders_online_key
          ON orders (listing_id, user_id, idempotency_key)
          WHERE channel = 'online' AND idempotency_key IS NOT NULL;
    """)


def downgrade() -> None:
    # Unpaid holds and online payments cannot be represented by the old schema.
    op.execute("""
        DELETE FROM admissions WHERE ticket_id IN (
          SELECT t.id FROM tickets t JOIN orders o ON o.id = t.order_id
          WHERE o.payment_method = 'online'
        );
        DELETE FROM tickets WHERE order_id IN (
          SELECT id FROM orders WHERE payment_method = 'online'
        );
        DELETE FROM order_items WHERE order_id IN (
          SELECT id FROM orders WHERE payment_method = 'online'
        );
        DELETE FROM orders WHERE payment_method = 'online';
        DROP INDEX ux_orders_online_key;
        DROP INDEX ix_orders_pending_expiry;
        DROP INDEX ix_orders_payment_intent;
        ALTER TABLE orders
          DROP CONSTRAINT orders_payment_method_check,
          ADD CONSTRAINT orders_payment_method_check
            CHECK (payment_method IN ('none', 'cash_outlet')),
          DROP COLUMN refunded_minor,
          DROP COLUMN paid_at,
          DROP COLUMN payment_expires_at,
          DROP COLUMN payment_intent_id;
    """)
