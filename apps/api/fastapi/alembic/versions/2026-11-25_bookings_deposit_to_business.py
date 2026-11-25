"""Deposit paid to the business, instructions and late fee (issues #1864, #1865).

Additive. A display-only mode for businesses whose customers pay the deposit to the
business by hand (PayPal, bank transfer, cash), outside Barrels:

- ``bookings.profile.deposit_collection``: ``online`` (default, today's behaviour) or
  ``business``.
- ``bookings.profile.deposit_instructions``: plain text, 1 to 500 characters, or null.
- ``bookings.profile.late_fee_minor`` / ``late_grace_min``: the structured late rule.
- ``bookings.booking.deposit_to_business_minor``: the amount a customer was told to pay
  the business; ``deposit_minor`` (collected online) stays 0.

The downgrade drops these columns and their checks, nothing else.

Revision ID: bookingdepositbiz20261125
Revises: bookingalsoaddon20261125
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdepositbiz20261125"
down_revision = "bookingalsoaddon20261125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column(
            "deposit_collection",
            sa.String(20),
            nullable=False,
            server_default="online",
        ),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("deposit_instructions", sa.String(500), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("late_fee_minor", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("late_grace_min", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "booking",
        sa.Column(
            "deposit_to_business_minor",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("profile_deposit_collection_check"),
        "profile",
        "deposit_collection IN ('online', 'business')",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("profile_deposit_instructions_check"),
        "profile",
        "deposit_instructions IS NULL"
        " OR char_length(deposit_instructions) BETWEEN 1 AND 500",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("profile_late_fee_check"),
        "profile",
        "late_fee_minor IS NULL OR late_fee_minor > 0",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("profile_late_grace_check"),
        "profile",
        "late_grace_min IS NULL OR late_grace_min BETWEEN 0 AND 240",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("booking_deposit_to_business_check"),
        "booking",
        "deposit_to_business_minor >= 0",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("booking_deposit_to_business_check"),
        "booking",
        schema="bookings",
        type_="check",
    )
    op.drop_column("booking", "deposit_to_business_minor", schema="bookings")
    for name in (
        "late_grace",
        "late_fee",
        "deposit_instructions",
        "deposit_collection",
    ):
        op.drop_constraint(
            op.f(f"profile_{name}_check"),
            "profile",
            schema="bookings",
            type_="check",
        )
    for column in (
        "late_grace_min",
        "late_fee_minor",
        "deposit_instructions",
        "deposit_collection",
    ):
        op.drop_column("profile", column, schema="bookings")
