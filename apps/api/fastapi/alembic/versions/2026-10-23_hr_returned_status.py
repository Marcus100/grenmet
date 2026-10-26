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
    # PostgreSQL cannot safely remove an enum value while old code could still read
    # it, so the values stay; rows already RETURNED go back to what the previous
    # code showed (forms: DRAFT, timesheets: SUBMITTED) so old code can load them.
    op.execute(
        "UPDATE hr.leave_request SET status = 'DRAFT' WHERE status::text = 'RETURNED'"
    )
    op.execute(
        "UPDATE hr.absentee_report SET status = 'DRAFT' WHERE status::text = 'RETURNED'"
    )
    op.execute(
        "UPDATE hr.shift_swap_request SET status = 'DRAFT' WHERE status::text = 'RETURNED'"
    )
    op.execute(
        "UPDATE hr.status_report SET status = 'DRAFT' WHERE status::text = 'RETURNED'"
    )
    op.execute(
        "UPDATE hr.parking_permit SET status = 'DRAFT' WHERE status::text = 'RETURNED'"
    )
    op.execute(
        "UPDATE hr.timesheet SET status = 'SUBMITTED' WHERE status::text = 'RETURNED'"
    )
