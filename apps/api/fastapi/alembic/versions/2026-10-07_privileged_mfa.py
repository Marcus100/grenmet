"""Encrypted TOTP storage and explicit session MFA evidence.

Revision ID: mfa20261007
Revises: delegation20261007
"""

import sqlalchemy as sa

from alembic import op

revision = "mfa20261007"
down_revision = "delegation20261007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "user", "totp_secret", type_=sa.String(512), existing_type=sa.String(64)
    )
    op.add_column(
        "session",
        sa.Column("mfa_verified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # Ciphertexts exceed the old column size: preserve data rather than truncate it.
    op.drop_column("session", "mfa_verified_at")
