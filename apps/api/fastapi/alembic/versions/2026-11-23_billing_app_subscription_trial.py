"""Per-organisation app subscription trials (ADR-0065 amendment, 23 Nov 2026).

Additive, in the ``billing`` schema of the main database:

- ``billing.app_subscription_trial``: free trial days for one organisation on one plan.
  The primary key (organisation, plan) allows one grant per organisation and plan. No
  row means no trial, so the default for every business is no trial.

Nothing is dropped or renamed. The global ``BILLING_APP_TRIAL_DAYS`` setting, which gave
every business the same trial, is removed from the code in the same change.

Revision ID: billingappstrial20261123
Revises: billingappcheckout20261122
"""

import sqlalchemy as sa

from alembic import op

revision = "billingappstrial20261123"
down_revision = "billingappcheckout20261122"
branch_labels = None
depends_on = None

SCHEMA = "billing"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "app_subscription_trial",
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey(
                "org.organisation.id",
                name="app_subscription_trial_organisation_id_fkey",
            ),
            primary_key=True,
        ),
        sa.Column(
            "plan_key",
            sa.String(64),
            sa.ForeignKey(
                "billing.plan.key", name="app_subscription_trial_plan_key_fkey"
            ),
            primary_key=True,
        ),
        sa.Column("trial_days", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "trial_days BETWEEN 1 AND 365",
            name="app_subscription_trial_trial_days_range_check",
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("app_subscription_trial", schema=SCHEMA)
