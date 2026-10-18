"""Orders and tickets (E1): free and registration tiers.

A ticket is one admission. ``tickets.code`` is an opaque random code (no
personal data); the QR token is derived from it and signed in the application.
Inventory is the count of ``valid`` tickets per tier, guarded by a row lock on
the tier. ``per_account_limit`` caps valid tickets one account may hold per tier.
"""

from alembic import op

revision = "events_0005"
down_revision = "events_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE ticket_tiers
          ADD COLUMN per_account_limit INTEGER NOT NULL DEFAULT 4
          CHECK (per_account_limit BETWEEN 1 AND 50);
        CREATE TABLE orders (
          id UUID PRIMARY KEY,
          listing_id UUID NOT NULL REFERENCES listings(id),
          user_id UUID NOT NULL,
          status TEXT NOT NULL DEFAULT 'confirmed',
          total_minor INTEGER NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'XCD',
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE INDEX ix_orders_user ON orders (user_id, created_at DESC);
        CREATE INDEX ix_orders_listing ON orders (listing_id);
        CREATE TABLE order_items (
          id UUID PRIMARY KEY,
          order_id UUID NOT NULL REFERENCES orders(id),
          tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          unit_price_minor INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX ix_order_items_order ON order_items (order_id);
        CREATE TABLE tickets (
          id UUID PRIMARY KEY,
          order_id UUID NOT NULL REFERENCES orders(id),
          listing_id UUID NOT NULL REFERENCES listings(id),
          tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
          user_id UUID NOT NULL,
          code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'valid',
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          cancelled_at TIMESTAMP
        );
        CREATE INDEX ix_tickets_tier_status ON tickets (tier_id, status);
        CREATE INDEX ix_tickets_user_tier ON tickets (user_id, tier_id, status);
        CREATE INDEX ix_tickets_listing ON tickets (listing_id, status);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE tickets;
        DROP TABLE order_items;
        DROP TABLE orders;
        ALTER TABLE ticket_tiers DROP COLUMN per_account_limit;
    """)
