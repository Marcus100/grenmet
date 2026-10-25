"""Add the Returned status to HR forms and timesheets.

An approver sends a submitted form back to its author with a reason; the author
edits and resubmits it. Returned is not final, unlike Rejected.

Revision ID: hrreturned20261023
Revises: capjobskipped20261023
"""

from alembic import op

revision = "hrreturned20261023"
down_revision = "capjobskipped20261023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE requeststatus ADD VALUE IF NOT EXISTS 'RETURNED'")
    op.execute("ALTER TYPE timesheetstatus ADD VALUE IF NOT EXISTS 'RETURNED'")


def downgrade() -> None:
    # PostgreSQL cannot safely remove a value while records may reference it.
    # Retain the additive values and all form evidence during rollback.
    pass
