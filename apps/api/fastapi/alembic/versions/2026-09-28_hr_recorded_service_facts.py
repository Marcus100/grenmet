"""Record verified service and probation facts without deriving policy eligibility."""

import sqlalchemy as sa

from alembic import op

revision = "staff20260928"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in (
        "continuous_service_date",
        "probation_end_date",
        "probation_completed_date",
    ):
        op.add_column(
            "employment_record", sa.Column(name, sa.Date(), nullable=True), schema="hr"
        )
    op.add_column(
        "employment_record",
        sa.Column("service_details_source", sa.String(500), nullable=True),
        schema="hr",
    )


def downgrade() -> None:
    for name in (
        "service_details_source",
        "probation_completed_date",
        "probation_end_date",
        "continuous_service_date",
    ):
        op.drop_column("employment_record", name, schema="hr")
