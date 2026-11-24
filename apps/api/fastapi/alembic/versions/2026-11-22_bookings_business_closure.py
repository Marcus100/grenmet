"""Whole-business closures (Bookings BK-20): one new table.

``bookings.business_closure`` holds the organisation's closed local days (both
ends inclusive). Additive: nothing existing is altered. The downgrade drops only
this table.

Revision ID: bookingclosure20261122
Revises: brandcolourlogo20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingclosure20261122"
down_revision = "brandcolourlogo20261122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_closure",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "ends_on >= starts_on", name="business_closure_period_check"
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name="business_closure_organisation_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="business_closure_pkey"),
        schema="bookings",
    )
    op.create_index(
        "ix_business_closure_org_starts",
        "business_closure",
        ["organisation_id", "starts_on"],
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_business_closure_org_starts",
        table_name="business_closure",
        schema="bookings",
    )
    op.drop_table("business_closure", schema="bookings")
