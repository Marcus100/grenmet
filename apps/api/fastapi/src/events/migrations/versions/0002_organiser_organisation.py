"""Back organisers with platform organisations (F5, ADR-0022).

``organisation_id`` holds an ``org.organisation.id`` from the main database
(no cross-database foreign key). NULL means a legacy organiser still governed by
``organiser_members``.
"""

from alembic import op

revision = "events_0002"
down_revision = "events_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE organisers ADD COLUMN organisation_id TEXT NULL UNIQUE")


def downgrade() -> None:
    op.execute("ALTER TABLE organisers DROP COLUMN organisation_id")
