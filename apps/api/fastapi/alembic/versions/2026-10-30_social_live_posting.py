"""Social live posting: two more stored statuses and two nullable columns.

Additive for existing rows. ``posted`` (published to the platform) and ``skipped``
(not sent, with a reason) join the status CHECK. ``reason`` says why a dry run or a
skip happened; ``publish_started_at`` marks a live publish request in flight, so a
retry never sends a post twice. Downgrade maps posted and skipped rows back to dead
(the nearest stored status) before restoring the old CHECK, so no row is lost.

Revision ID: sociallive20261030
Revises: auditactorsession20261030
"""

import sqlalchemy as sa

from alembic import op

revision = "sociallive20261030"
down_revision = "auditactorsession20261030"
branch_labels = None
depends_on = None

TABLE = "content_distribution_delivery"
STATUS_CONSTRAINT = "content_distribution_delivery_status"


def upgrade() -> None:
    op.drop_constraint(STATUS_CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(
        STATUS_CONSTRAINT,
        TABLE,
        "status IN ('pending', 'scheduled', 'dry_run_sent', 'posted', 'skipped', 'dead')",
    )
    op.add_column(TABLE, sa.Column("reason", sa.String(300), nullable=True))
    op.add_column(TABLE, sa.Column("publish_started_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.execute(
        "UPDATE content_distribution_delivery SET status = 'dead' "
        "WHERE status IN ('posted', 'skipped')"
    )
    op.drop_column(TABLE, "publish_started_at")
    op.drop_column(TABLE, "reason")
    op.drop_constraint(STATUS_CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(
        STATUS_CONSTRAINT,
        TABLE,
        "status IN ('pending', 'scheduled', 'dry_run_sent', 'dead')",
    )
