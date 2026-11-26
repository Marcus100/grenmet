"""Deposit paid to the business marked received by staff (issue #1869).

Additive. When a customer pays the business's deposit by hand (``deposit_collection``
``business``), staff record that it arrived. No money moves through Barrels, so no
ledger entry is written:

- ``bookings.booking.deposit_received_at`` (naive UTC, null until received),
  ``deposit_received_method`` (cash, bank_transfer, paypal or other) and
  ``deposit_received_reference`` (1 to 100 characters, optional). The method and the
  time are set and cleared together.
- ``bookings.booking_event.staff_note``: a history row that changes no status and is
  left out of the customer calendar's SEQUENCE count, so recording a deposit never
  sends calendar updates.

The downgrade drops these columns and their checks, nothing else.

Revision ID: bookingdepositreceived20261125
Revises: incidents20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdepositreceived20261125"
down_revision = "incidents20261125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "booking",
        sa.Column("deposit_received_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "booking",
        sa.Column("deposit_received_method", sa.String(20), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "booking",
        sa.Column("deposit_received_reference", sa.String(100), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "booking_event",
        sa.Column(
            "staff_note",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("booking_deposit_received_method_check"),
        "booking",
        "deposit_received_method IS NULL OR deposit_received_method IN "
        "('cash', 'bank_transfer', 'paypal', 'other')",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("booking_deposit_received_pair_check"),
        "booking",
        "(deposit_received_at IS NULL) = (deposit_received_method IS NULL)",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("booking_deposit_received_reference_check"),
        "booking",
        "deposit_received_reference IS NULL"
        " OR char_length(deposit_received_reference) BETWEEN 1 AND 100",
        schema="bookings",
    )


def downgrade() -> None:
    for name in (
        "deposit_received_reference",
        "deposit_received_pair",
        "deposit_received_method",
    ):
        op.drop_constraint(
            op.f(f"booking_{name}_check"),
            "booking",
            schema="bookings",
            type_="check",
        )
    op.drop_column("booking_event", "staff_note", schema="bookings")
    for column in (
        "deposit_received_reference",
        "deposit_received_method",
        "deposit_received_at",
    ):
        op.drop_column("booking", column, schema="bookings")
