"""HR employment end date (#797): a nullable last day of employment with a CHECK.

Additive: one nullable column on ``hr.employment_record`` and a CHECK that an end
date is not before the start date. Existing rows have no end date, so the CHECK
holds for them. Downgrade drops both.

Revision ID: employmentend20261030
Revises: contentdist20261029
"""

import sqlalchemy as sa

from alembic import op

revision = "employmentend20261030"
down_revision = "contentdist20261029"
branch_labels = None
depends_on = None

# The metadata naming convention renders the model's constraint name as this;
# op.f() keeps the migration and the model on the same database name.
CHECK_NAME = "employment_record_ck_hr_employment_end_not_before_start_check"


def upgrade() -> None:
    op.add_column(
        "employment_record",
        sa.Column("end_date", sa.Date(), nullable=True),
        schema="hr",
    )
    op.create_check_constraint(
        op.f(CHECK_NAME),
        "employment_record",
        "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
        schema="hr",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f(CHECK_NAME),
        "employment_record",
        schema="hr",
        type_="check",
    )
    op.drop_column("employment_record", "end_date", schema="hr")
