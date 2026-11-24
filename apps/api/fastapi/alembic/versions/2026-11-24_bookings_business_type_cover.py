"""Booking business type and cover photo (owner requests 24 Nov 2026).

Additive, both nullable, no backfill (a business has no type and no cover until it sets
one):

- ``bookings.profile.business_type``: one of the fixed list (``BookingBusinessType``),
  checked here so the database refuses anything else.
- ``bookings.profile.cover_file_id``: a completed ``booking-cover`` upload (no FK, the
  same as ``logo_file_id``).

The downgrade drops these two columns and the check only; nothing else is touched.

Revision ID: bookingtypecover20261124
Revises: bookingaddons20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingtypecover20261124"
down_revision = "bookingaddons20261123"
branch_labels = None
depends_on = None

BUSINESS_TYPES = (
    "beauty",
    "hair",
    "health",
    "fitness",
    "auto",
    "home_services",
    "lessons",
    "professional",
    "tours",
    "events",
    "other",
)
#: Final names (``op.f``): the metadata convention would add the table prefix again.
TYPE_CHECK = "profile_business_type_check"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column("business_type", sa.String(length=20), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("cover_file_id", sa.Uuid(), nullable=True),
        schema="bookings",
    )
    values = ", ".join(f"'{value}'" for value in BUSINESS_TYPES)
    op.create_check_constraint(
        op.f(TYPE_CHECK),
        "profile",
        f"business_type IS NULL OR business_type IN ({values})",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(TYPE_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "cover_file_id", schema="bookings")
    op.drop_column("profile", "business_type", schema="bookings")
