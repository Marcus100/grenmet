"""Organisation API keys (ADR-0029, PF5).

Additive. Creates ``org.api_key``: hashed secrets, scopes, expiry, revocation and
rotation links. No data is seeded.

Revision ID: orgapikeys20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "orgapikeys20261020"
down_revision = "orgsites20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_key",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_prefix", sa.String(8), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("scopes", postgresql.ARRAY(sa.String(60)), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("expires_at", sa.DateTime()),
        sa.Column("last_used_at", sa.DateTime()),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column(
            "rotated_from_id",
            sa.String(100),
            sa.ForeignKey("org.api_key.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("key_hash", name=op.f("api_key_key_hash_key")),
        schema="org",
    )
    op.create_index(
        "api_key_organisation_id_idx", "api_key", ["organisation_id"], schema="org"
    )


def downgrade() -> None:
    op.drop_index("api_key_organisation_id_idx", table_name="api_key", schema="org")
    op.drop_table("api_key", schema="org")
