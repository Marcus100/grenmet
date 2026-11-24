"""Booking hygiene (issue #1808, roadmap item 1).

Additive, two profile columns, no backfill beyond the server defaults, so the previous
release (which does not know them) still inserts and updates profiles:

- ``bookings.profile.pending_expiry_hours``: hours an unconfirmed request waits before it
  expires; 24 by default, null means "only at the start time". Checked 1 to 168 or null.
- ``bookings.profile.max_open_per_customer``: future bookings one customer may hold with
  the business; 3 by default, checked 1 to 20. Not null.

The downgrade drops these two columns and their checks only.

Revision ID: bookinghygiene20261124
Revises: bookingtypecover20261124
"""

import sqlalchemy as sa

from alembic import op

revision = "bookinghygiene20261124"
down_revision = "bookingtypecover20261124"
branch_labels = None
depends_on = None

#: Final names (``op.f``): the metadata convention would add the table prefix again.
EXPIRY_CHECK = "profile_pending_expiry_hours_check"
CAP_CHECK = "profile_max_open_per_customer_check"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column(
            "pending_expiry_hours",
            sa.Integer(),
            nullable=True,
            server_default="24",
        ),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column(
            "max_open_per_customer",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(EXPIRY_CHECK),
        "profile",
        "pending_expiry_hours IS NULL OR pending_expiry_hours BETWEEN 1 AND 168",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(CAP_CHECK),
        "profile",
        "max_open_per_customer BETWEEN 1 AND 20",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(CAP_CHECK), "profile", schema="bookings", type_="check")
    op.drop_constraint(op.f(EXPIRY_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "max_open_per_customer", schema="bookings")
    op.drop_column("profile", "pending_expiry_hours", schema="bookings")
