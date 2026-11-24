"""Bookings: the private calendar feed token (one new table).

``bookings.calendar_feed`` holds one row per organisation: the SHA-256 of the
subscribed URL's token, and when it was created and last rotated. The token
itself is never stored. Additive: nothing existing is altered. The downgrade
drops only this table.

Revision ID: bookingcalendar20261123
Revises: bookingdepositsnapshot20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingcalendar20261123"
down_revision = "bookingdepositsnapshot20261123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_feed",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("rotated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name="calendar_feed_organisation_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="calendar_feed_pkey"),
        sa.UniqueConstraint("organisation_id", name="calendar_feed_organisation_key"),
        sa.UniqueConstraint("token_hash", name="calendar_feed_token_hash_key"),
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_table("calendar_feed", schema="bookings")
