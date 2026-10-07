"""Staff access requests: public accounts ask for staff access (ADR-0017).

Additive. Everyone who signs up gets an ordinary Barrels account; only accounts
that press "Request staff access" join the staff approval queue. Existing
pending sign-ups (excluding self-service Events members) are treated as having
asked, so nobody already waiting drops out of the queue.

Revision ID: staffreq20261007
Revises: appscope20261003
"""

import sqlalchemy as sa

from alembic import op

revision = "staffreq20261007"
down_revision = "appscope20261003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("staff_access_requested_at", sa.DateTime(), nullable=True),
    )
    op.execute(
        """
        UPDATE "user"
        SET staff_access_requested_at = created_at
        WHERE registration_pending
          AND id NOT IN (
            SELECT user_role.user_id
            FROM user_role
            JOIN role ON role.id = user_role.role_id
            WHERE role.name = 'events-member'
          )
        """
    )


def downgrade() -> None:
    op.drop_column("user", "staff_access_requested_at")
