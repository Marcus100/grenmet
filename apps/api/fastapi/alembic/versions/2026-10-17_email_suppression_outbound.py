"""Email suppression list and public-flow email outbox.

Revision ID: emailsuppress20261017
Revises: notifsnooze20261017
"""

import sqlalchemy as sa

from alembic import op

revision = "emailsuppress20261017"
down_revision = "notifsnooze20261017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_suppression",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("source_event_id", sa.String(200)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("email", name="email_suppression_email_key"),
    )
    op.create_table(
        "outbound_email",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("to_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("template", sa.String(60)),
        sa.Column("props", sa.JSON(), nullable=False),
        sa.Column("html", sa.Text()),
        sa.Column("transactional", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.DateTime()),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("sent_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_outbound_email_due", "outbound_email", ["status", "next_retry_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_outbound_email_due", table_name="outbound_email")
    op.drop_table("outbound_email")
    op.drop_table("email_suppression")
