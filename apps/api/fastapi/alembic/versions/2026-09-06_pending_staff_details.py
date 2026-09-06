"""Allow confirmed staff membership before personnel details are verified.

Revision ID: a1b3c5d7e9f0
Revises: f9b2c4d6e8a0
"""

import sqlalchemy as sa

from alembic import op

revision = "a1b3c5d7e9f0"
down_revision = "f9b2c4d6e8a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("employment_record", "employee_number", nullable=True, schema="hr")
    op.alter_column("employment_record", "employment_type", nullable=True, schema="hr")


def downgrade() -> None:
    # Refuse rather than fill unknown personnel details with fabricated values.
    connection = op.get_bind()
    pending = connection.execute(
        sa.text(
            "SELECT count(*) FROM hr.employment_record WHERE employee_number IS NULL OR employment_type IS NULL"
        )
    ).scalar()
    if pending:
        raise RuntimeError("Complete pending employment details before downgrading")
    op.alter_column("employment_record", "employee_number", nullable=False, schema="hr")
    op.alter_column("employment_record", "employment_type", nullable=False, schema="hr")
