"""Record mailbox readiness separately from account activation.

Revision ID: mailbox20261007
Revises: cmsaccess20261007
"""

import sqlalchemy as sa

from alembic import op

revision = "mailbox20261007"
down_revision = "cmsaccess20261007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Do not infer inbox provisioning from existing account activity.
    op.add_column(
        "staff_credential",
        sa.Column(
            "mailbox_ready", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("staff_credential", "mailbox_ready")
