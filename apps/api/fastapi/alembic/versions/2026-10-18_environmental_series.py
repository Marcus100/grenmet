"""Environmental forecast series (Copernicus Marine and CAMS).

Additive: a new ``environment`` schema with one table holding the latest
fetched series per kind and point.

Revision ID: environment20261018
Revises: juryduty20261018
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "environment20261018"
down_revision = "juryduty20261018"
branch_labels = None
depends_on = None

SCHEMA = "environment"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "series",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("point_id", sa.String(60), nullable=False),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.Column("products", sa.String(300), nullable=False),
        sa.Column("rows", JSONB(), nullable=False),
        sa.UniqueConstraint("kind", "point_id", name="uq_environment_series_point"),
        sa.CheckConstraint("kind IN ('marine', 'air')", name=op.f("series_kind_check")),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("series", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
