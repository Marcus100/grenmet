"""CAP job status SKIPPED.

Additive. Jobs whose handler deliberately did nothing (channel off, storage not
configured, MQTT/WIS2 handled elsewhere) are recorded as SKIPPED instead of
SUCCEEDED. Existing rows are untouched.

Revision ID: capjobskipped20261023
Revises: eventsactivitycapacity20261022
"""

from alembic import op

revision = "capjobskipped20261023"
down_revision = "eventsactivitycapacity20261022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE capjobstatus ADD VALUE IF NOT EXISTS 'SKIPPED'")


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value; leaving it in place is harmless.
    pass
