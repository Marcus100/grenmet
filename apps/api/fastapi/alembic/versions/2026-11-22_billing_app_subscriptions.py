"""Barrels app subscriptions (ADR-0065): plans, prices, subscriptions, Stripe events.

Additive, in the existing ``billing`` schema of the main database:

- ``billing.plan`` and ``billing.plan_price``: a plan per Barrels app, one price per
  currency (minor units). Seeds ``bookings-monthly`` at XCD 3000 (XCD 30.00).
- ``billing.app_subscription``: one row per organisation and app plan. A partial
  unique index allows one live row (not canceled) per organisation and app.
- ``billing.stripe_event``: every applied Stripe event id; the primary key makes a
  repeat delivery a no-op.
- ``billing.customer.stripe_customer_id``: nullable, unique.

Nothing is dropped or renamed. Downgrade drops what this revision added and keeps
the ``billing`` schema, which the invoicing revision owns.

Revision ID: billingappsubs20261122
Revises: bookinglisting20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "billingappsubs20261122"
down_revision = "bookinglisting20261122"
branch_labels = None
depends_on = None

SCHEMA = "billing"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "plan",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("app_key", sa.String(64), nullable=False),
        sa.Column("interval", sa.String(10), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("interval IN ('month', 'year')", name="plan_interval_check"),
        schema=SCHEMA,
    )
    op.create_table(
        "plan_price",
        sa.Column(
            "plan_key",
            sa.String(64),
            sa.ForeignKey("billing.plan.key", name="plan_price_plan_key_fkey"),
            primary_key=True,
        ),
        sa.Column("currency", sa.String(3), primary_key=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="plan_price_amount_positive_check"),
        schema=SCHEMA,
    )
    op.create_table(
        "app_subscription",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey(
                "org.organisation.id", name="app_subscription_organisation_id_fkey"
            ),
            nullable=False,
        ),
        sa.Column(
            "plan_key",
            sa.String(64),
            sa.ForeignKey("billing.plan.key", name="app_subscription_plan_key_fkey"),
            nullable=False,
        ),
        sa.Column("app_key", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("stripe_subscription_id", sa.String(255)),
        sa.Column("current_period_end", sa.DateTime()),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("trial_end", sa.DateTime()),
        sa.Column("last_event_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "stripe_subscription_id", name="app_subscription_stripe_subscription_id_key"
        ),
        sa.CheckConstraint(
            "status IN ('incomplete', 'active', 'past_due', 'canceled', 'unpaid')",
            name="app_subscription_status_check",
        ),
        sa.CheckConstraint(
            "channel IN ('stripe', 'invoice')", name="app_subscription_channel_check"
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "billing_app_subscription_organisation_id_app_key_idx",
        "app_subscription",
        ["organisation_id", "app_key"],
        schema=SCHEMA,
    )
    op.create_index(
        "uq_billing_app_subscription_live",
        "app_subscription",
        ["organisation_id", "app_key"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text(
            "status IN ('incomplete', 'active', 'past_due', 'unpaid')"
        ),
    )
    op.create_table(
        "stripe_event",
        sa.Column("event_id", sa.String(255), primary_key=True),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        schema=SCHEMA,
    )
    op.add_column(
        "customer",
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        schema=SCHEMA,
    )
    op.create_unique_constraint(
        # migration-safety: customer.stripe_customer_id is added in this same
        # revision, so every row is NULL and the constraint validates nothing.
        "customer_stripe_customer_id_key",
        "customer",
        ["stripe_customer_id"],
        schema=SCHEMA,
    )
    # The first app plan: Bookings, XCD 30.00 a month (owner decision, 22 Nov 2026).
    op.execute(
        "INSERT INTO billing.plan (key, app_key, interval, active, name, created_at) "
        "VALUES ('bookings-monthly', 'bookings', 'month', true, 'Bookings monthly', "
        "(now() AT TIME ZONE 'UTC'))"
    )
    op.execute(
        "INSERT INTO billing.plan_price (plan_key, currency, amount_minor) "
        "VALUES ('bookings-monthly', 'XCD', 3000)"
    )


def downgrade() -> None:
    op.drop_constraint(
        "customer_stripe_customer_id_key", "customer", schema=SCHEMA, type_="unique"
    )
    op.drop_column("customer", "stripe_customer_id", schema=SCHEMA)
    op.drop_table("stripe_event", schema=SCHEMA)
    op.drop_index(
        "uq_billing_app_subscription_live",
        table_name="app_subscription",
        schema=SCHEMA,
    )
    op.drop_index(
        "billing_app_subscription_organisation_id_app_key_idx",
        table_name="app_subscription",
        schema=SCHEMA,
    )
    op.drop_table("app_subscription", schema=SCHEMA)
    op.drop_table("plan_price", schema=SCHEMA)
    op.drop_table("plan", schema=SCHEMA)
