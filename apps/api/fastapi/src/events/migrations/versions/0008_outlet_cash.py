"""Outlet cash sales (E3): tickets sold for cash by the organiser's own staff.

Outlet buyers have no account, so ``orders.user_id`` and ``tickets.user_id``
become nullable (an online order always has a user; an outlet order never
does). ``orders`` records the channel, payment method, amount collected, the
optional buyer name and phone, the selling staff member and their till session.
``till_sessions`` is one row per staff member, listing and Grenada day: an
opening float and, at close, the counted cash.
"""

from alembic import op

revision = "events_0008"
down_revision = "events_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE till_sessions (
          id UUID PRIMARY KEY,
          listing_id UUID NOT NULL REFERENCES listings(id),
          staff_id UUID NOT NULL,
          day DATE NOT NULL,
          opening_float_minor INTEGER NOT NULL CHECK (opening_float_minor >= 0),
          opened_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          closed_at TIMESTAMP,
          counted_minor INTEGER CHECK (counted_minor >= 0),
          close_note TEXT,
          CONSTRAINT ux_till_staff_day UNIQUE (listing_id, staff_id, day),
          CONSTRAINT ck_till_closed CHECK (
            (closed_at IS NULL) = (counted_minor IS NULL)
          )
        );
        ALTER TABLE orders
          ALTER COLUMN user_id DROP NOT NULL,
          ADD COLUMN channel TEXT NOT NULL DEFAULT 'online'
            CHECK (channel IN ('online', 'outlet')),
          ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'none'
            CHECK (payment_method IN ('none', 'cash_outlet')),
          ADD COLUMN collected_minor INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN buyer_name TEXT,
          ADD COLUMN buyer_phone TEXT,
          ADD COLUMN sold_by UUID,
          ADD COLUMN till_session_id UUID REFERENCES till_sessions(id),
          ADD COLUMN idempotency_key TEXT,
          ADD CONSTRAINT ck_orders_channel_user
            CHECK ((channel = 'online') = (user_id IS NOT NULL));
        ALTER TABLE tickets ALTER COLUMN user_id DROP NOT NULL;
        CREATE INDEX ix_orders_till ON orders (till_session_id);
        CREATE UNIQUE INDEX ux_orders_outlet_key
          ON orders (listing_id, sold_by, idempotency_key)
          WHERE idempotency_key IS NOT NULL;
    """)


def downgrade() -> None:
    # Outlet sales have no account to attach to, so they cannot survive.
    op.execute("""
        DELETE FROM admissions WHERE ticket_id IN (
          SELECT id FROM tickets WHERE user_id IS NULL
        );
        DELETE FROM tickets WHERE user_id IS NULL;
        DELETE FROM order_items WHERE order_id IN (
          SELECT id FROM orders WHERE user_id IS NULL
        );
        DELETE FROM orders WHERE user_id IS NULL;
        DROP INDEX ux_orders_outlet_key;
        DROP INDEX ix_orders_till;
        ALTER TABLE tickets ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE orders
          DROP CONSTRAINT ck_orders_channel_user,
          DROP COLUMN idempotency_key,
          DROP COLUMN till_session_id,
          DROP COLUMN sold_by,
          DROP COLUMN buyer_phone,
          DROP COLUMN buyer_name,
          DROP COLUMN collected_minor,
          DROP COLUMN payment_method,
          DROP COLUMN channel,
          ALTER COLUMN user_id SET NOT NULL;
        DROP TABLE till_sessions;
    """)
