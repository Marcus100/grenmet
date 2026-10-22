"""Organisation membership grants (ADR-0044, S1).

Additive. Creates ``org.membership_grant``: extra product roles a member holds in
one organisation, with expiry and revocation, and a partial unique index so a
member holds each role once while it is live. No data is seeded.

Revision ID: membershipgrant20261022
Revises: clockpunch20261021
"""

import sqlalchemy as sa

from alembic import op

revision = "membershipgrant20261022"
down_revision = "clockpunch20261021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "membership_grant",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "membership_id",
            sa.String(100),
            sa.ForeignKey("org.membership.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role_key", sa.String(60), nullable=False),
        sa.Column(
            "granted_by",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("granted_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime()),
        sa.Column("revoked_at", sa.DateTime()),
        schema="org",
    )
    op.create_index(
        "uq_membership_grant_live",
        "membership_grant",
        ["membership_id", "role_key"],
        unique=True,
        schema="org",
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index(
        "membership_grant_organisation_id_idx",
        "membership_grant",
        ["organisation_id"],
        schema="org",
    )


def downgrade() -> None:
    op.drop_index(
        "membership_grant_organisation_id_idx",
        table_name="membership_grant",
        schema="org",
    )
    op.drop_index(
        "uq_membership_grant_live", table_name="membership_grant", schema="org"
    )
    op.drop_table("membership_grant", schema="org")
