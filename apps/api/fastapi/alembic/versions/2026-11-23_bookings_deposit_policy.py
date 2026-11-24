"""Deposit policy for bookings (owner request 23 Nov 2026).

Three nullable or defaulted profile columns: ``deposit_min_price_minor`` (the
business-wide deposit rule skips services priced below it; null means no
minimum), ``deposit_non_refundable`` (default false: a paid deposit is refunded
by the cutoff policy, as today) and ``booking_policy`` (plain text, at most 1000
characters). Additive: existing rows get the defaults, so nothing changes for any
business. The downgrade drops only these three columns and their checks.

Revision ID: bookingdepositpolicy20261123
Revises: bookingdeposit20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdepositpolicy20261123"
down_revision = "bookingdeposit20261123"
branch_labels = None
depends_on = None

_MIN_CHECK = "profile_deposit_min_price_check"
_POLICY_CHECK = "profile_booking_policy_check"


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column("deposit_min_price_minor", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column(
            "deposit_non_refundable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("booking_policy", sa.String(length=1000), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_MIN_CHECK),
        "profile",
        "deposit_min_price_minor IS NULL OR deposit_min_price_minor > 0",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_POLICY_CHECK),
        "profile",
        "booking_policy IS NULL OR char_length(booking_policy) BETWEEN 1 AND 1000",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(_POLICY_CHECK), "profile", schema="bookings", type_="check")
    op.drop_constraint(op.f(_MIN_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "booking_policy", schema="bookings")
    op.drop_column("profile", "deposit_non_refundable", schema="bookings")
    op.drop_column("profile", "deposit_min_price_minor", schema="bookings")
