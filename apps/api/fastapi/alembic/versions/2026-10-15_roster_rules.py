"""Optional roster rule limits on department policy.

Revision ID: rosterrules20261015
Revises: mfa20261007
"""

import sqlalchemy as sa

from alembic import op

revision = "rosterrules20261015"
down_revision = "mfa20261007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All nullable: NULL disables a rule and existing rows keep their behaviour.
    op.add_column(
        "department_policy",
        sa.Column("min_rest_hours", sa.Numeric(5, 2), nullable=True),
        schema="hr",
    )
    op.add_column(
        "department_policy",
        sa.Column("max_consecutive_days", sa.Integer(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "department_policy",
        sa.Column("max_weekly_hours", sa.Numeric(5, 2), nullable=True),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_column("department_policy", "max_weekly_hours", schema="hr")
    op.drop_column("department_policy", "max_consecutive_days", schema="hr")
    op.drop_column("department_policy", "min_rest_hours", schema="hr")
