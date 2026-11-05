"""Social live posting: two more stored statuses and two nullable columns.

Additive for existing rows. ``posted`` (published to the platform) and ``skipped``
(not sent, with a reason) join the status CHECK. ``reason`` says why a dry run or a
skip happened; ``publish_started_at`` marks a live publish request in flight, so a
retry never sends a post twice. Downgrade maps posted and skipped rows back to dead
(the nearest stored status) before restoring the old CHECK, so no row is lost.

The CHECK is replaced under the name the database already gives it. Alembic's naming
convention (``src/orm.py``) decides that name, adding a prefix and truncating long
names with a hash, so the name is read from the catalog rather than written here.

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
NEW_STATUSES = "'pending', 'scheduled', 'dry_run_sent', 'posted', 'skipped', 'dead'"
OLD_STATUSES = "'pending', 'scheduled', 'dry_run_sent', 'dead'"


def _status_check_name() -> str:
    """The name of the table's one CHECK constraint, as the database stores it."""
    names = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = CAST(:table AS regclass) AND contype = 'c'"
            ),
            {"table": TABLE},
        )
        .scalars()
        .all()
    )
    if len(names) != 1:
        raise RuntimeError(f"expected one CHECK on {TABLE}, found {len(names)}")
    return str(names[0])


def _replace_status_check(statuses: str) -> None:
    name = _status_check_name()
    quoted = '"' + name.replace('"', '""') + '"'
    op.execute(f"ALTER TABLE {TABLE} DROP CONSTRAINT {quoted}")
    op.execute(
        f"ALTER TABLE {TABLE} ADD CONSTRAINT {quoted} CHECK (status IN ({statuses}))"
    )


def upgrade() -> None:
    _replace_status_check(NEW_STATUSES)
    op.add_column(TABLE, sa.Column("reason", sa.String(300), nullable=True))
    op.add_column(TABLE, sa.Column("publish_started_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.execute(
        "UPDATE content_distribution_delivery SET status = 'dead' "
        "WHERE status IN ('posted', 'skipped')"
    )
    op.drop_column(TABLE, "publish_started_at")
    op.drop_column(TABLE, "reason")
    _replace_status_check(OLD_STATUSES)
