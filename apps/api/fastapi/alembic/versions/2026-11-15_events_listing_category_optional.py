"""Let an events listing be uncategorised (#810).

Owner decision 2026-11-15: an organiser may clear a listing's category. The
legacy ``events.listings.category`` column becomes nullable; the check
constraint still limits real values to the ten categories (NULL passes it).
Additive: no existing row changes.

Revision ID: eventsnocat20261115
Revises: bookingcontact20261115
"""

import sqlalchemy as sa

from alembic import op

revision = "eventsnocat20261115"
down_revision = "bookingcontact20261115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "listings", "category", existing_type=sa.Text(), nullable=True, schema="events"
    )


def downgrade() -> None:
    # Uncategorised listings get the old form default ("fete") so NOT NULL can
    # return.
    op.execute("UPDATE events.listings SET category = 'fete' WHERE category IS NULL")
    op.alter_column(
        "listings", "category", existing_type=sa.Text(), nullable=False, schema="events"
    )
