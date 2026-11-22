"""Opt-in business listing on the Barrels Bookings home page.

``profile.listed`` (boolean, default false, server default false) and three
nullable text columns: ``category``, ``short_description`` and ``city``. Additive:
nothing existing is altered, and the downgrade drops only these four columns.

Revision ID: bookinglisting20261122
Revises: bookingclosure20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "bookinglisting20261122"
down_revision = "bookingclosure20261122"
branch_labels = None
depends_on = None

_TEXT_COLUMNS = (
    ("category", 80),
    ("short_description", 160),
    ("city", 80),
)


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column(
            "listed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    for name, length in _TEXT_COLUMNS:
        op.add_column(
            "profile",
            sa.Column(name, sa.String(length=length), nullable=True),
            schema="bookings",
        )


def downgrade() -> None:
    for name, _ in reversed(_TEXT_COLUMNS):
        op.drop_column("profile", name, schema="bookings")
    op.drop_column("profile", "listed", schema="bookings")
