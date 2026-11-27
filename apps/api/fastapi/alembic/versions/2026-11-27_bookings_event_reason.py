"""Bookings: a staff reason code on each history row (issue #1987).

Additive: one nullable column on ``bookings.booking_event``.

- ``reason`` (nullable, 40): a code from ``BookingEventReason`` (customer_request,
  business_closed, staff_unavailable, weather, other), set by the Studio decline and
  cancel actions. Existing rows and rows given no code stay null. It is a code, not
  personal text, so erasure keeps it.

The downgrade drops the column and nothing else.

Revision ID: bookingeventreason20261127
Revises: eventsordercontact20261127
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingeventreason20261127"
down_revision = "eventsordercontact20261127"
branch_labels = None
depends_on = None

_SCHEMA = "bookings"


def upgrade() -> None:
    op.add_column(
        "booking_event",
        sa.Column("reason", sa.String(length=40), nullable=True),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("booking_event", "reason", schema=_SCHEMA)
