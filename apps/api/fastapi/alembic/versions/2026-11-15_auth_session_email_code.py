"""auth session email-code sign-in time

Revision ID: authsessionemail20261115
Revises: bookingpayment20261115
Create Date: 2026-11-15

ADR-0059 rule 2 (one mailbox proof per visit). Additive: one nullable timestamp on
``session`` recording when an emailed code opened the session. Existing rows stay NULL,
which means "no emailed-code proof", so no old session gains anything. Downgrade drops
the column; no data outside it is touched.
"""

import sqlalchemy as sa

from alembic import op

revision = "authsessionemail20261115"
down_revision = "bookingpayment20261115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "session",
        sa.Column("email_code_verified_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session", "email_code_verified_at")
