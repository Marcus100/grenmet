"""Remember what a superseded observation was, so a rejected correction can restore it.

Additive on the eRegister chain only. ``superseded_from`` is the state the row had
before a correction replaced it; ``superseded_qc_notes`` its ``qc_notes`` (the
correction reason overwrites them while it is superseded). Both are cleared when
the row is restored. Rows superseded before this revision keep NULL and are not
restored automatically.
"""

from alembic import op

revision = "eregister_0005"
down_revision = "eregister_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE register_observations ADD COLUMN superseded_from register_state"
    )
    op.execute("ALTER TABLE register_observations ADD COLUMN superseded_qc_notes text")


def downgrade() -> None:
    op.execute("ALTER TABLE register_observations DROP COLUMN superseded_qc_notes")
    op.execute("ALTER TABLE register_observations DROP COLUMN superseded_from")
