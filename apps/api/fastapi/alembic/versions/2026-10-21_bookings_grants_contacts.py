"""Organisations with bookings get the contacts product (ADR-0028).

Data only. Every organisation that already has ``bookings`` enabled gets
``contacts`` enabled too, so it can view, merge and erase the people its bookings
created. New grants of ``bookings`` do the same in the service.

Revision ID: bookingsgrantscontacts20261021
Revises: bookingspartyrole20261021
"""

from alembic import op

revision = "bookingsgrantscontacts20261021"
down_revision = "bookingspartyrole20261021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO org.organisation_app "
        "(organisation_id, app_key, enabled, created_at, updated_at) "
        "SELECT organisation_id, 'contacts', true, now(), now() "
        "FROM org.organisation_app WHERE app_key = 'bookings' AND enabled "
        "ON CONFLICT (organisation_id, app_key) DO UPDATE SET enabled = true"
    )


def downgrade() -> None:
    # Cannot tell which grants were bundled; leaving them is harmless.
    pass
