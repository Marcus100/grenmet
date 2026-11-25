"""A bookable service that is also offered as an add-on (issue #1862, 25 Nov 2026).

Additive: ``bookings.service.also_add_on`` (not null, default false). Existing rows
keep today's behaviour: ``is_add_on`` still means add-on only. The downgrade drops
only this column.

Revision ID: bookingalsoaddon20261125
Revises: bookingsignup20261124
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingalsoaddon20261125"
down_revision = "bookingsignup20261124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "service",
        sa.Column(
            "also_add_on",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_column("service", "also_add_on", schema="bookings")
