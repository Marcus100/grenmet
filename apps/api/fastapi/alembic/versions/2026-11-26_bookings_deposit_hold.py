"""Per-business hold time for unpaid deposits (issue #1752).

Two nullable columns, both additive:

- ``profile.deposit_hold_minutes`` (1 to 10080, seven days). Null keeps today's
  ``DEPOSIT_HOLD_MINUTES`` (30).
- ``booking.hold_minutes``, a snapshot taken when the booking enters
  ``pending_payment`` (the effective hold, capped for an online checkout). A later
  change to the profile does not move a live hold. Null for bookings that existed
  before this revision: the sweeper then computes their hold from the profile.

Existing rows stay null, so nothing changes until a business sets a value. The
downgrade drops only these two columns and their checks.

Revision ID: bookingdeposithold20261126
Revises: opsattach20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdeposithold20261126"
down_revision = "opsattach20261125"
branch_labels = None
depends_on = None

_HOLD_CHECK = "profile_deposit_hold_minutes_check"
_BOOKING_HOLD_CHECK = "booking_hold_minutes_check"


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column("deposit_hold_minutes", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_HOLD_CHECK),
        "profile",
        "deposit_hold_minutes IS NULL OR deposit_hold_minutes BETWEEN 1 AND 10080",
        schema="bookings",
    )
    op.add_column(
        "booking",
        sa.Column("hold_minutes", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_BOOKING_HOLD_CHECK),
        "booking",
        "hold_minutes IS NULL OR hold_minutes BETWEEN 1 AND 10080",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f(_BOOKING_HOLD_CHECK), "booking", schema="bookings", type_="check"
    )
    op.drop_column("booking", "hold_minutes", schema="bookings")
    op.drop_constraint(op.f(_HOLD_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "deposit_hold_minutes", schema="bookings")
