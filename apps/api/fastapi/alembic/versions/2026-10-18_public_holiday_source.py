"""Public holiday source and verification flag.

Lets HR see which holidays are provisional and still need confirming.

Revision ID: holidaysrc20261018
Revises: notifsnooze20261017
"""

import sqlalchemy as sa

from alembic import op

revision = "holidaysrc20261018"
down_revision = "notifsnooze20261017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "public_holiday",
        sa.Column("source", sa.String(200), nullable=True),
        schema="hr",
    )
    op.add_column(
        "public_holiday",
        sa.Column(
            "needs_verification",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )


def downgrade() -> None:
    op.drop_column("public_holiday", "needs_verification", schema="hr")
    op.drop_column("public_holiday", "source", schema="hr")
