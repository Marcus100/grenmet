"""Bookings: each booking keeps the name typed on it.

Additive: one nullable column on ``bookings.booking``.

- ``booked_name`` (nullable, 120): the name typed on this booking. Views and mail
  show it for that booking and fall back to the contact's name, so existing rows
  (null) read exactly as before and the stored contact keeps its own name for
  matching and the customer list.

Revision ID: bookingbookedname20261126
Revises: bookingpayafteraccept20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingbookedname20261126"
down_revision = "bookingpayafteraccept20261126"
branch_labels = None
depends_on = None

_SCHEMA = "bookings"


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column("booked_name", sa.String(length=120), nullable=True),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("booking", "booked_name", schema=_SCHEMA)
