"""Snapshot the NHC storm id on each tropical system entry.

Public routes show the identity as published, so a staff edit of the live
system cannot change them before an outlook is published. Existing entries
are backfilled from the live system. Objects created here are named explicitly.
"""

import sqlalchemy as sa

from alembic import op

revision = "wxproducts_0005"
down_revision = "wxproducts_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tropical_system_entries", sa.Column("nhc_storm_id", sa.Text(), nullable=True)
    )
    op.execute(
        "UPDATE tropical_system_entries AS e SET nhc_storm_id = s.nhc_storm_id "
        "FROM tropical_systems AS s WHERE s.id = e.system_id"
    )
    op.create_check_constraint(
        "tropical_system_entries_action_check",
        "tropical_system_entries",
        "action IN ('draft', 'publish')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "tropical_system_entries_action_check",
        "tropical_system_entries",
        type_="check",
    )
    op.drop_column("tropical_system_entries", "nhc_storm_id")
