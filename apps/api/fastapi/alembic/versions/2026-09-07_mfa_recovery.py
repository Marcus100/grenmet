"""Store hashes of single-use MFA recovery codes."""

import sqlalchemy as sa

from alembic import op

revision = "c3d5e7f9a1b2"
down_revision = "b2c4d6e8f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "mfa_recovery_hashes",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "mfa_recovery_hashes")
