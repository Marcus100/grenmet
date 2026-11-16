"""auth session original sign-in time

Revision ID: authsessionsignedin20261116
Revises: printixorganisation20261116

ADR-0061 (per-app session cap). Additive: one nullable timestamp on ``session``
holding the original sign-in, carried through every refresh so a capped app's
session can be bounded from its first sign-in. Existing rows stay NULL and the code
reads ``created_at`` for them, so no backfill rewrites the table and no uncapped
app's session changes. Downgrade drops the column only.
"""

import sqlalchemy as sa

from alembic import op

revision = "authsessionsignedin20261116"
down_revision = "printixorganisation20261116"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session",
        sa.Column("signed_in_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session", "signed_in_at")
