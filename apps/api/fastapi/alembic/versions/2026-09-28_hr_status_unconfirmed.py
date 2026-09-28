"""Distinguish planned staffing from confirmed attendance.

Revision ID: ds20260928
Revises: c9d0e1f2a3b4
"""

from alembic import op

revision = "ds20260928"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE personnelstatus ADD VALUE IF NOT EXISTS 'UNCONFIRMED'")


def downgrade() -> None:
    # PostgreSQL cannot safely remove a value while reports may reference it.
    # Retain the additive value and all report evidence during rollback.
    pass
