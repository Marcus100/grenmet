"""Operations log: who gets a log's daily summary (#1875).

Additive: one new table, ``opslog.summary_subscriber``.

Revision ID: opslogsummary20261126
Revises: incidentweather20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "opslogsummary20261126"
down_revision = "incidentweather20261126"
branch_labels = None
depends_on = None

SCHEMA = "opslog"


def upgrade() -> None:
    op.create_table(
        "summary_subscriber",
        sa.Column("log_id", sa.String(100), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint(
            "log_id", "user_id", name=op.f("summary_subscriber_pkey")
        ),
        sa.ForeignKeyConstraint(
            ["log_id"],
            ["opslog.log.id"],
            name=op.f("summary_subscriber_log_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("summary_subscriber_organisation_id_fkey"),
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("opslog_summary_subscriber_organisation_id_idx"),
        "summary_subscriber",
        ["organisation_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("summary_subscriber", schema=SCHEMA)
