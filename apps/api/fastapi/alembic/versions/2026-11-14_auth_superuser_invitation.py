"""Superuser invitations (ADR-0059 rule 1).

A new table, so the migration is additive: nothing existing is altered. Only the
SHA-256 hash of each invitation token is stored.

Revision ID: superuserinvite20261114
Revises: profileimage20261113
"""

import sqlalchemy as sa

from alembic import op

revision = "superuserinvite20261114"
down_revision = "profileimage20261113"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "superuser_invitation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("superuser_invitation_email_idx", "superuser_invitation", ["email"])
    op.create_index(
        "superuser_invitation_invited_by_user_id_idx",
        "superuser_invitation",
        ["invited_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "superuser_invitation_invited_by_user_id_idx", table_name="superuser_invitation"
    )
    op.drop_index("superuser_invitation_email_idx", table_name="superuser_invitation")
    op.drop_table("superuser_invitation")
