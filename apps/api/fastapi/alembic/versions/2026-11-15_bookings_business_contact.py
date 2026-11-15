"""Business contact options on the booking profile.

Four optional columns (phone, WhatsApp, Instagram, email) that the studio sets
and the public booking page shows. Additive: nullable columns, nothing existing
is altered.

Revision ID: bookingcontact20261115
Revises: superuserinvite20261114
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingcontact20261115"
down_revision = "superuserinvite20261114"
branch_labels = None
depends_on = None

_COLUMNS = (
    ("contact_phone", 16),
    ("contact_whatsapp", 15),
    ("contact_instagram", 30),
    ("contact_email", 254),
)


def upgrade() -> None:
    for name, length in _COLUMNS:
        op.add_column(
            "profile",
            sa.Column(name, sa.String(length=length), nullable=True),
            schema="bookings",
        )


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("profile", name, schema="bookings")
