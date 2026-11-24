"""Add-ons for bookings (owner request 23 Nov 2026, switched off by default).

Additive only: ``profile.add_ons_enabled`` (default false), ``service.is_add_on``
(default false) and ``service.add_on_categories`` (nullable), plus the
``booking_add_on`` table that holds each booking's add-on lines with their name,
length and price copied at booking time. Existing rows keep today's behaviour.
The downgrade drops only what this revision adds.

Revision ID: bookingaddons20261123
Revises: bookingdeposit20261123
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "bookingaddons20261123"
down_revision = "bookingdeposit20261123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column(
            "add_ons_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    op.add_column(
        "service",
        sa.Column(
            "is_add_on",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    op.add_column(
        "service",
        sa.Column(
            "add_on_categories",
            postgresql.ARRAY(sa.String(length=80)),
            nullable=True,
        ),
        schema="bookings",
    )
    op.create_table(
        "booking_add_on",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "duration_min > 0", name=op.f("booking_add_on_duration_check")
        ),
        sa.CheckConstraint("price_minor >= 0", name=op.f("booking_add_on_price_check")),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.booking.id"],
            name=op.f("booking_add_on_booking_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("booking_add_on_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["bookings.service.id"],
            name=op.f("booking_add_on_service_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("booking_add_on_pkey")),
        sa.UniqueConstraint("booking_id", "service_id", name="booking_add_on_key"),
        schema="bookings",
    )
    op.create_index(
        "bookings_booking_add_on_booking_id_idx",
        "booking_add_on",
        ["booking_id"],
        unique=False,
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_index(
        "bookings_booking_add_on_booking_id_idx",
        table_name="booking_add_on",
        schema="bookings",
    )
    op.drop_table("booking_add_on", schema="bookings")
    op.drop_column("service", "add_on_categories", schema="bookings")
    op.drop_column("service", "is_add_on", schema="bookings")
    op.drop_column("profile", "add_ons_enabled", schema="bookings")
