"""Page feedback and GMS climate data requests.

Additive: two new tables in the application database.

Revision ID: feeddatareq20261018
Revises: eregsend20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "feeddatareq20261018"
down_revision = "eregsend20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "page_feedback",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("site", sa.String(40), nullable=False),
        sa.Column("page_path", sa.String(300), nullable=False),
        sa.Column("helpful", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_page_feedback_site", "page_feedback", ["site", "created_at"])
    op.create_table(
        "contact_data_request",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("site", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("organisation", sa.String(200), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("stations", sa.String(500), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("data_format", sa.String(20), nullable=False),
        sa.Column("intended_use", sa.String(20), nullable=False),
        sa.Column("consent_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_contact_data_request_site",
        "contact_data_request",
        ["site", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_contact_data_request_site", table_name="contact_data_request")
    op.drop_table("contact_data_request")
    op.drop_index("ix_page_feedback_site", table_name="page_feedback")
    op.drop_table("page_feedback")
