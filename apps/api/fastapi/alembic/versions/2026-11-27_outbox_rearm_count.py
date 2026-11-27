"""Platform outbox: count the operator re-arms of a dead row.

Additive. ``outbox.rearm`` sends a dead row back to pending (a refund re-cancel
retries it) and counts it here, capped at ``outbox.MAX_REARMS``. The column is NOT
NULL with a server default, so the release still running against the old schema
keeps inserting rows and the existing rows read as zero re-arms. Downgrade drops it.

Revision ID: outboxrearm20261127
Revises: outboundemailorg20261127
"""

import sqlalchemy as sa

from alembic import op

revision = "outboxrearm20261127"
down_revision = "outboundemailorg20261127"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "outbox",
        sa.Column("rearms", sa.Integer(), server_default="0", nullable=False),
        schema="platform",
    )


def downgrade() -> None:
    op.drop_column("outbox", "rearms", schema="platform")
