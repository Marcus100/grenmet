"""Add independent authored-product grade policies."""

import sqlalchemy as sa

from alembic import op

revision = "d4e6f8a0b2c3"
down_revision = "c3d5e7f9a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_access_policy",
        sa.Column("kind", sa.String(50), primary_key=True),
        sa.Column("grade_ids", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("product_access_policy")
