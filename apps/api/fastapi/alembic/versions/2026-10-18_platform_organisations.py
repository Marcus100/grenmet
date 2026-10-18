"""Platform organisations, memberships and app entitlements (ADR-0022, F1).

Additive: creates the ``org`` schema and backfills one platform organisation per
``hr.organisation`` (same id). HR tables and foreign keys are untouched.

Revision ID: platformorgs20261018
Revises: holidaysrc20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "platformorgs20261018"
down_revision = "holidaysrc20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS org")
    op.create_table(
        "organisation",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("verified_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('barrels', 'client', 'business')",
            name=op.f("organisation_kind_check"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended')",
            name=op.f("organisation_status_check"),
        ),
        schema="org",
    )
    op.create_table(
        "membership",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "invited_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "organisation_id", "user_id", name="uq_org_membership_org_user"
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'member')",
            name=op.f("membership_role_check"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'invited', 'removed')",
            name=op.f("membership_status_check"),
        ),
        schema="org",
    )
    op.create_index("membership_user_id_idx", "membership", ["user_id"], schema="org")
    op.create_table(
        "organisation_app",
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("app_key", sa.String(60), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        schema="org",
    )
    # Bridge A: one platform row per HR employer, same id. "barrels" (if ever
    # created) is the company itself; every other existing row is a client.
    op.execute(
        """
        INSERT INTO org.organisation
            (id, slug, name, kind, status, created_at, updated_at)
        SELECT
            id,
            lower(regexp_replace(id, '[^a-zA-Z0-9]+', '-', 'g')),
            name,
            CASE WHEN id = 'barrels' THEN 'barrels' ELSE 'client' END,
            'active',
            now() AT TIME ZONE 'utc',
            now() AT TIME ZONE 'utc'
        FROM hr.organisation
        """
    )


def downgrade() -> None:
    op.drop_table("organisation_app", schema="org")
    op.drop_index("membership_user_id_idx", table_name="membership", schema="org")
    op.drop_table("membership", schema="org")
    op.drop_table("organisation", schema="org")
    op.execute("DROP SCHEMA IF EXISTS org")
