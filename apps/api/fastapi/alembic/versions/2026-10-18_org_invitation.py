"""Organisation invitations (ADR-0022, F4).

Additive: one new table in the ``org`` schema. Only the SHA-256 of an
invitation token is stored.

Revision ID: orginvite20261018
Revises: stores20261017
"""

import sqlalchemy as sa

from alembic import op

revision = "orginvite20261018"
down_revision = "stores20261017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitation",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "invited_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("accepted_at", sa.DateTime()),
        sa.Column(
            "accepted_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'member')",
            name=op.f("invitation_role_check"),
        ),
        schema="org",
    )
    op.create_index(
        "ix_org_invitation_org_email",
        "invitation",
        ["organisation_id", "email"],
        schema="org",
    )


def downgrade() -> None:
    op.drop_index("ix_org_invitation_org_email", table_name="invitation", schema="org")
    op.drop_table("invitation", schema="org")
