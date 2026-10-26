"""Snapshot the NHC storm id on each tropical system entry.

Public routes show the identity as published, so a staff edit of the live
system cannot change them before an outlook is published. Each existing entry
is stamped once with its system's current storm id, so no unpublished id edit
should be pending when this runs.
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


def downgrade() -> None:
    op.drop_column("tropical_system_entries", "nhc_storm_id")
