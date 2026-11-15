"""What an online booking pays when it is made (Stripe test-mode slice, #1372).

One profile column, ``payment_at_booking``: ``deposit`` (each service's own
deposit, the behaviour before this column existed) or ``full_price``. Additive:
existing rows get ``deposit``, so nothing changes for any business.

Revision ID: bookingpayment20261115
Revises: bookingcontact20261115
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingpayment20261115"
down_revision = "bookingcontact20261115"
branch_labels = None
depends_on = None

_CHECK = "profile_payment_at_booking_check"


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column(
            "payment_at_booking",
            sa.String(length=20),
            nullable=False,
            server_default="deposit",
        ),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_CHECK),
        "profile",
        "payment_at_booking IN ('deposit', 'full_price')",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "payment_at_booking", schema="bookings")
