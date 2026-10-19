"""Barrels Bookings (B1): profile, services, providers, hours, exceptions,
customers, bookings and booking events in a new ``bookings`` schema.

Additive. ``btree_gist`` backs the exclusion constraint that stops two active
bookings for one provider from overlapping (buffers included).

Revision ID: bookings20261019
Revises: emailhash20261018

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "bookings20261019"
down_revision = "emailhash20261018"
branch_labels = None
depends_on = None

ACTIVE = "'pending_payment', 'pending', 'confirmed'"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def _org_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["organisation_id"],
        ["org.organisation.id"],
        name=f"{table}_organisation_id_fkey",
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("CREATE SCHEMA IF NOT EXISTS bookings")

    op.create_table(
        "profile",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("public_slug", sa.String(60), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("slot_step_min", sa.Integer(), nullable=False),
        sa.Column("lead_time_min", sa.Integer(), nullable=False),
        sa.Column("horizon_days", sa.Integer(), nullable=False),
        sa.Column("cancel_cutoff_hours", sa.Integer(), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("notify_email", sa.String(320), nullable=True),
        sa.Column("manage_url_template", sa.String(500), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "slot_step_min BETWEEN 5 AND 240", name="profile_slot_step_check"
        ),
        sa.CheckConstraint("lead_time_min >= 0", name="profile_lead_time_check"),
        sa.CheckConstraint(
            "horizon_days BETWEEN 1 AND 365", name="profile_horizon_check"
        ),
        sa.CheckConstraint(
            "cancel_cutoff_hours >= 0", name="profile_cancel_cutoff_check"
        ),
        _org_fk("profile"),
        sa.PrimaryKeyConstraint("id", name="profile_pkey"),
        sa.UniqueConstraint("organisation_id", name="profile_organisation_id_key"),
        sa.UniqueConstraint("public_slug", name="profile_public_slug_key"),
        schema="bookings",
    )

    op.create_table(
        "service",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("buffer_before_min", sa.Integer(), nullable=False),
        sa.Column("buffer_after_min", sa.Integer(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("deposit_minor", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "duration_min BETWEEN 5 AND 720", name="service_duration_check"
        ),
        sa.CheckConstraint(
            "buffer_before_min >= 0 AND buffer_after_min >= 0",
            name="service_buffers_check",
        ),
        sa.CheckConstraint(
            "price_minor >= 0 AND deposit_minor >= 0 AND deposit_minor <= price_minor",
            name="service_money_check",
        ),
        _org_fk("service"),
        sa.PrimaryKeyConstraint("id", name="service_pkey"),
        schema="bookings",
    )
    op.create_index(
        "service_organisation_id_idx",
        "service",
        ["organisation_id"],
        schema="bookings",
    )

    op.create_table(
        "provider",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
        _org_fk("provider"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name="provider_user_id_fkey", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="provider_pkey"),
        schema="bookings",
    )
    op.create_index(
        "provider_organisation_id_idx",
        "provider",
        ["organisation_id"],
        schema="bookings",
    )

    op.create_table(
        "provider_service",
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["bookings.provider.id"],
            name="provider_service_provider_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["bookings.service.id"],
            name="provider_service_service_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "provider_id", "service_id", name="provider_service_pkey"
        ),
        schema="bookings",
    )

    op.create_table(
        "working_hours",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.CheckConstraint(
            "weekday BETWEEN 0 AND 6", name="working_hours_weekday_check"
        ),
        sa.CheckConstraint("end_time > start_time", name="working_hours_period_check"),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["bookings.provider.id"],
            name="working_hours_provider_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="working_hours_pkey"),
        schema="bookings",
    )
    op.create_index(
        "working_hours_provider_id_idx",
        "working_hours",
        ["provider_id"],
        schema="bookings",
    )

    op.create_table(
        "availability_exception",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('time_off', 'extra_hours')",
            name="availability_exception_kind_check",
        ),
        sa.CheckConstraint(
            "ends_at > starts_at", name="availability_exception_period_check"
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["bookings.provider.id"],
            name="availability_exception_provider_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="availability_exception_pkey"),
        schema="bookings",
    )
    op.create_index(
        "ix_availability_exception_provider_starts",
        "availability_exception",
        ["provider_id", "starts_at"],
        schema="bookings",
    )

    op.create_table(
        "customer",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("email_hash", sa.String(64), nullable=True),
        sa.Column("phone", sa.String(40), nullable=True),
        sa.Column("marketing_consent", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_booked_at", sa.DateTime(), nullable=True),
        _org_fk("customer"),
        sa.PrimaryKeyConstraint("id", name="customer_pkey"),
        schema="bookings",
    )
    op.create_index(
        "customer_organisation_id_idx",
        "customer",
        ["organisation_id"],
        schema="bookings",
    )
    op.create_index(
        "ix_customer_org_email_hash",
        "customer",
        ["organisation_id", "email_hash"],
        schema="bookings",
    )

    op.create_table(
        "booking",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("blocked_from", sa.DateTime(), nullable=False),
        sa.Column("blocked_until", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("deposit_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("manage_token_hash", sa.String(64), nullable=True),
        sa.Column("idempotency_key", sa.String(100), nullable=True),
        sa.Column("cancel_reason", sa.String(300), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "status IN ('pending_payment', 'pending', 'confirmed', 'cancelled', "
            "'no_show', 'completed')",
            name="booking_status_check",
        ),
        sa.CheckConstraint(
            "source IN ('online', 'studio')", name="booking_source_check"
        ),
        sa.CheckConstraint("ends_at > starts_at", name="booking_period_check"),
        sa.CheckConstraint(
            "blocked_from <= starts_at AND blocked_until >= ends_at",
            name="booking_blocked_check",
        ),
        _org_fk("booking"),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["bookings.provider.id"], name="booking_provider_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["service_id"], ["bookings.service.id"], name="booking_service_id_fkey"
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["bookings.customer.id"], name="booking_customer_id_fkey"
        ),
        sa.PrimaryKeyConstraint("id", name="booking_pkey"),
        sa.UniqueConstraint("manage_token_hash", name="booking_manage_token_hash_key"),
        sa.UniqueConstraint(
            "organisation_id", "idempotency_key", name="booking_idempotency_key"
        ),
        postgresql.ExcludeConstraint(
            ("provider_id", "="),
            (sa.text("tsrange(blocked_from, blocked_until)"), "&&"),
            name="booking_no_overlap",
            using="gist",
            where=sa.text(f"status IN ({ACTIVE})"),
        ),
        schema="bookings",
    )
    op.create_index(
        "booking_customer_id_idx", "booking", ["customer_id"], schema="bookings"
    )
    op.create_index(
        "ix_booking_org_starts",
        "booking",
        ["organisation_id", "starts_at"],
        schema="bookings",
    )

    op.create_table(
        "booking_event",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("from_status", sa.String(20), nullable=True),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.booking.id"],
            name="booking_event_booking_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="booking_event_pkey"),
        schema="bookings",
    )
    op.create_index(
        "booking_event_booking_id_idx",
        "booking_event",
        ["booking_id"],
        schema="bookings",
    )


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS bookings CASCADE")
