"""Self sign-up columns: trial end and sender-name review flag (ADR-0066 slice 2).

Additive, two nullable columns, no constraints:

- ``billing.app_subscription_trial.trial_ends_at``: the end of a trial that was granted
  with a fixed end (a self-created business's 30 days). Null keeps the fixed
  ``trial_days`` that Babydoll's seeded grant uses.
- ``bookings.profile.sender_name_flagged_at``: set when a self sign-up's name is refused
  by the sender-name guard, so staff review it.

The downgrade drops the two columns and nothing else.

Revision ID: bookingsignup20261124
Revises: bookinglisting20261124
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingsignup20261124"
down_revision = "bookinglisting20261124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "app_subscription_trial",
        sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
        schema="billing",
    )
    op.add_column(
        "profile",
        sa.Column("sender_name_flagged_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_column("profile", "sender_name_flagged_at", schema="bookings")
    op.drop_column("app_subscription_trial", "trial_ends_at", schema="billing")
