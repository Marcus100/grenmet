"""Business brand colour and logo for emails (issue #1622).

Additive, all nullable, no backfill (every business keeps the Barrels navy until it
sets a colour):

- ``bookings.profile.brand_color`` and ``bookings.profile.logo_file_id``: the booking
  business's accent and its logo (a completed ``booking-logo`` upload).
- ``events.organisers.brand_color``: the organiser's accent. ``logo_file_id`` already
  exists.

The colour check is a lower-case six-digit hex, matching what the API stores.
The downgrade drops the new columns only; nothing else is touched.

Revision ID: brandcolourlogo20261122
Revises: auditentrycreated20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "brandcolourlogo20261122"
down_revision = "auditentrycreated20261122"
branch_labels = None
depends_on = None

CHECK = "brand_color IS NULL OR brand_color ~ '^#[0-9a-f]{6}$'"
#: Final names (``op.f``): the metadata convention would add the table prefix again.
BOOKINGS_CHECK = "profile_brand_color_check"
EVENTS_CHECK = "organisers_brand_color_check"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column("brand_color", sa.String(length=7), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("logo_file_id", sa.Uuid(), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(BOOKINGS_CHECK), "profile", CHECK, schema="bookings"
    )
    op.add_column(
        "organisers",
        sa.Column("brand_color", sa.Text(), nullable=True),
        schema="events",
    )
    op.create_check_constraint(op.f(EVENTS_CHECK), "organisers", CHECK, schema="events")


def downgrade() -> None:
    op.drop_constraint(op.f(EVENTS_CHECK), "organisers", schema="events", type_="check")
    op.drop_column("organisers", "brand_color", schema="events")
    op.drop_constraint(
        op.f(BOOKINGS_CHECK), "profile", schema="bookings", type_="check"
    )
    op.drop_column("profile", "logo_file_id", schema="bookings")
    op.drop_column("profile", "brand_color", schema="bookings")
