"""Deposit terms on each booking (owner review 23 Nov 2026).

Adds ``booking.deposit_non_refundable``, copied from the profile when the booking
is made, so a later change to the business setting never changes the terms of a
booking already made. Additive: existing bookings get false, which is today's
refund behaviour. The downgrade drops only this column.

Revision ID: bookingdepositsnapshot20261123
Revises: bookingdepositpolicy20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdepositsnapshot20261123"
down_revision = "bookingdepositpolicy20261123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column(
            "deposit_non_refundable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_column("booking", "deposit_non_refundable", schema="bookings")
