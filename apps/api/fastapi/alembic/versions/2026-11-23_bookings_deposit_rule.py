"""Business-wide deposit rule for bookings (owner request 23 Nov 2026).

Three nullable or defaulted profile columns: ``deposit_mode`` (``none`` |
``percent`` | ``fixed``, default ``none``), ``deposit_percent`` (1 to 100) and
``deposit_fixed_minor``. Additive: existing rows get ``none``, so nothing changes
for any business. The downgrade drops only these three columns and their checks.

Revision ID: bookingdeposit20261123
Revises: billingappstrial20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingdeposit20261123"
down_revision = "billingappstrial20261123"
branch_labels = None
depends_on = None

_MODE_CHECK = "profile_deposit_mode_check"
_RULE_CHECK = "profile_deposit_rule_check"


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column(
            "deposit_mode",
            sa.String(length=10),
            nullable=False,
            server_default="none",
        ),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("deposit_percent", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("deposit_fixed_minor", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_MODE_CHECK),
        "profile",
        "deposit_mode IN ('none', 'percent', 'fixed')",
        schema="bookings",
    )
    op.create_check_constraint(
        op.f(_RULE_CHECK),
        "profile",
        "deposit_mode = 'none'"
        " OR (deposit_mode = 'percent' AND deposit_percent IS NOT NULL"
        " AND deposit_percent BETWEEN 1 AND 100)"
        " OR (deposit_mode = 'fixed' AND deposit_fixed_minor IS NOT NULL"
        " AND deposit_fixed_minor > 0)",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(_RULE_CHECK), "profile", schema="bookings", type_="check")
    op.drop_constraint(op.f(_MODE_CHECK), "profile", schema="bookings", type_="check")
    op.drop_column("profile", "deposit_fixed_minor", schema="bookings")
    op.drop_column("profile", "deposit_percent", schema="bookings")
    op.drop_column("profile", "deposit_mode", schema="bookings")
