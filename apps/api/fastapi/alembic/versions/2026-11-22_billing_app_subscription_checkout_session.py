"""Barrels app subscriptions: remember the pending Checkout Session (ADR-0065).

Additive: one nullable column, ``billing.app_subscription.checkout_session_id``. A
repeat checkout reads it to resume an open Stripe Checkout Session instead of being
refused until the session expires (issue #1723). Rows written before this revision
keep it null and are not resumed.

Downgrade drops the column and keeps everything the earlier revision created.

Revision ID: billingappcheckout20261122
Revises: billingappsubs20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "billingappcheckout20261122"
down_revision = "billingappsubs20261122"
branch_labels = None
depends_on = None

SCHEMA = "billing"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "app_subscription",
        sa.Column("checkout_session_id", sa.String(255), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("app_subscription", "checkout_session_id", schema=SCHEMA)
