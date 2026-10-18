"""Mailing-list subscriptions and website contact messages.

Revision ID: listsubcontact20261017
Revises: emailsuppress20261017
"""

import sqlalchemy as sa

from alembic import op

revision = "listsubcontact20261017"
down_revision = "emailsuppress20261017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "list_subscription",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("list_key", sa.String(40), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("last_confirmation_sent_at", sa.DateTime()),
        sa.Column("confirmed_at", sa.DateTime()),
        sa.Column("unsubscribed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "list_key", "email", name="list_subscription_list_key_email_key"
        ),
    )
    op.create_index("ix_list_subscription_email", "list_subscription", ["email"])
    op.create_table(
        "contact_message",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("site", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_contact_message_site", "contact_message", ["site", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_contact_message_site", table_name="contact_message")
    op.drop_table("contact_message")
    op.drop_index("ix_list_subscription_email", table_name="list_subscription")
    op.drop_table("list_subscription")
