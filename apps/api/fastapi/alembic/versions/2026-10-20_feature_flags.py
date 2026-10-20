"""Feature flags with success metrics and audience rules (ADR-0020, PF7).

Additive. Creates the ``flags`` schema and ``flags.feature_flag``. No seed rows:
an unknown flag evaluates to off.

Revision ID: featureflags20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "featureflags20261020"
down_revision = "orgsites20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS flags")
    op.create_table(
        "feature_flag",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("exposed", sa.Boolean(), nullable=False),
        sa.Column("audience", postgresql.JSONB(), nullable=False),
        sa.Column("success_metric", sa.Text()),
        sa.Column("owner", sa.String(255)),
        sa.Column("expires_at", sa.DateTime()),
        sa.Column("review_by", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("key", name=op.f("feature_flag_key_key")),
        sa.CheckConstraint(
            "key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
            name=op.f("feature_flag_key_format_check"),
        ),
        schema="flags",
    )


def downgrade() -> None:
    op.drop_table("feature_flag", schema="flags")
    op.execute("DROP SCHEMA IF EXISTS flags")
