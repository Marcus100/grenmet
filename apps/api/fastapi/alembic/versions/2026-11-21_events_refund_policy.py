"""Per-event refund policy and cancellation fee (refund_policy.py).

Additive. Four columns on ``events.listings``, all with server defaults so every
existing listing keeps today's behaviour (refundable, platform cutoff, no fee):

- ``refund_policy``: ``refundable`` | ``no_refunds``.
- ``refund_cutoff_hours``: NULL = the platform default (48); 0-720 otherwise.
- ``cancellation_fee_type``: ``none`` | ``fixed`` (minor units per ticket) |
  ``percent`` (whole percent of the refundable amount, 0-100).
- ``cancellation_fee_value``: NOT NULL, default 0; 0 when the type is ``none``.

And one column on ``events.orders``: ``cancellation_fee_kept_minor`` (NOT NULL,
default 0), what an organiser cancel kept under the terms.

The CHECK constraints are added NOT VALID and then validated, with a short lock
timeout so the upgrade fails fast instead of queueing behind traffic.

Revision ID: eventsrefundpolicy20261121
Revises: printixscanlogorder20261118
"""

import sqlalchemy as sa

from alembic import op

revision = "eventsrefundpolicy20261121"
down_revision = "printixscanlogorder20261118"
branch_labels = None
depends_on = None

CHECKS = (
    (
        "listings_refund_policy_check",
        "refund_policy IN ('refundable', 'no_refunds')",
    ),
    (
        "listings_refund_cutoff_hours_check",
        "refund_cutoff_hours IS NULL OR refund_cutoff_hours BETWEEN 0 AND 720",
    ),
    (
        "listings_cancellation_fee_type_check",
        "cancellation_fee_type IN ('none', 'fixed', 'percent')",
    ),
    (
        "listings_cancellation_fee_value_check",
        "cancellation_fee_value >= 0"
        " AND (cancellation_fee_type <> 'none' OR cancellation_fee_value = 0)"
        " AND (cancellation_fee_type <> 'percent' OR cancellation_fee_value <= 100)",
    ),
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "listings",
        sa.Column(
            "refund_policy", sa.Text(), server_default="refundable", nullable=False
        ),
        schema="events",
    )
    op.add_column(
        "listings",
        sa.Column("refund_cutoff_hours", sa.Integer(), nullable=True),
        schema="events",
    )
    op.add_column(
        "listings",
        sa.Column(
            "cancellation_fee_type", sa.Text(), server_default="none", nullable=False
        ),
        schema="events",
    )
    op.add_column(
        "listings",
        sa.Column(
            "cancellation_fee_value", sa.Integer(), server_default="0", nullable=False
        ),
        schema="events",
    )
    for name, condition in CHECKS:
        op.execute(
            f"ALTER TABLE events.listings ADD CONSTRAINT {name} "
            f"CHECK ({condition}) NOT VALID"
        )
    for name, _ in CHECKS:
        op.execute(f"ALTER TABLE events.listings VALIDATE CONSTRAINT {name}")
    # What an organiser cancel kept under the refund terms on each order (reporting:
    # kept, not owed to the buyer). Existing orders kept nothing under a policy.
    op.add_column(
        "orders",
        sa.Column(
            "cancellation_fee_kept_minor",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        schema="events",
    )


def downgrade() -> None:
    op.drop_column("orders", "cancellation_fee_kept_minor", schema="events")
    for name, _ in CHECKS:
        op.execute(f"ALTER TABLE events.listings DROP CONSTRAINT IF EXISTS {name}")
    op.drop_column("listings", "cancellation_fee_value", schema="events")
    op.drop_column("listings", "cancellation_fee_type", schema="events")
    op.drop_column("listings", "refund_cutoff_hours", schema="events")
    op.drop_column("listings", "refund_policy", schema="events")
