"""Record who took the QC decision and when.

Additive: two nullable columns on ``register_observations``. The state column
and its ``register_state`` enum already carry the QC states.
"""

from alembic import op

revision = "eregister_0002"
down_revision = "eregister_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE register_observations ADD COLUMN qc_by text")
    op.execute("ALTER TABLE register_observations ADD COLUMN qc_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE register_observations DROP COLUMN qc_at")
    op.execute("ALTER TABLE register_observations DROP COLUMN qc_by")
