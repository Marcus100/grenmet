"""Content distribution: one row per post and platform for social posting.

Additive: one new table in the application database. Rows are created by the
CMS through the internal route and drained by the worker's platform outbox.

Revision ID: contentdist20261029
Revises: eventstaxonomy20261022
"""

import sqlalchemy as sa

from alembic import op

revision = "contentdist20261029"
down_revision = "eventstaxonomy20261022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_distribution_delivery",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("dedupe_key", sa.String(300), nullable=False, unique=True),
        sa.Column("collection", sa.String(60), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(200)),
        sa.Column("error", sa.String(300)),
        sa.Column("publish_at", sa.DateTime(), nullable=False),
        sa.Column("processed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'scheduled', 'dry_run_sent', 'dead')",
            name="content_distribution_delivery_status",
        ),
    )
    op.create_index(
        "ix_content_distribution_delivery_due",
        "content_distribution_delivery",
        ["status", "publish_at"],
    )
    op.create_index(
        "ix_content_distribution_delivery_post",
        "content_distribution_delivery",
        ["collection", "slug"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_content_distribution_delivery_post",
        table_name="content_distribution_delivery",
    )
    op.drop_index(
        "ix_content_distribution_delivery_due",
        table_name="content_distribution_delivery",
    )
    op.drop_table("content_distribution_delivery")
