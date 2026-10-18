"""Organisation-scoped uploads (F8).

Additive: one new table in the ``org`` schema recording presigned uploads
(pending until the client confirms, then complete). Object bytes live in the
storage bucket under ``org/{organisation_id}/{app}/{purpose}/{uuid}.{ext}``.

Revision ID: orgupload20261018
Revises: feeddatareq20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "orgupload20261018"
down_revision = "feeddatareq20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "upload",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("app", sa.String(60), nullable=False),
        sa.Column("purpose", sa.String(60), nullable=False),
        sa.Column("object_key", sa.String(300), nullable=False, unique=True),
        sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime()),
        sa.CheckConstraint(
            "status IN ('pending', 'complete')", name=op.f("upload_status_check")
        ),
        sa.CheckConstraint("size_bytes > 0", name=op.f("upload_size_check")),
        schema="org",
    )
    op.create_index(
        "ix_org_upload_organisation", "upload", ["organisation_id"], schema="org"
    )


def downgrade() -> None:
    op.drop_index("ix_org_upload_organisation", table_name="upload", schema="org")
    op.drop_table("upload", schema="org")
