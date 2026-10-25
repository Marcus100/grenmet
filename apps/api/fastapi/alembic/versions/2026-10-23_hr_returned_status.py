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
    for table in (
        "leave_request",
        "absentee_report",
        "shift_swap_request",
        "status_report",
        "parking_permit",
    ):
        # Fixed table names from the tuple above, never user input.
        op.execute(
            f"UPDATE {table} SET status = 'DRAFT' WHERE status::text = 'RETURNED'"  # noqa: S608
        )
    op.execute(
        "UPDATE timesheet SET status = 'SUBMITTED' WHERE status::text = 'RETURNED'"
    )
