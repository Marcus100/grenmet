"""Paused state of a Bookings business (ADR-0066 item 6, slice 4a).

Additive: ``bookings.profile.paused_at``, a nullable timestamp. Null for every existing
business, so nothing changes until the subscription switch is turned on. The downgrade
drops the column and nothing else.

Revision ID: bookingpaused20261125
Revises: bookingdepositbiz20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingpaused20261125"
down_revision = "bookingdepositbiz20261125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column("paused_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.drop_column("profile", "paused_at", schema="bookings")
