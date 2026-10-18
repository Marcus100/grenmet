"""CAP dissemination: browser push subscriptions and outbox dedupe key.

Additive: a ``push_subscription`` table (Web Push endpoints per list) and a
nullable ``outbound_email.dedupe_key`` with a partial unique index, so the CAP
email fan-out is idempotent per (alert, subscriber).

Revision ID: cappush20261018
Revises: environment20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "cappush20261018"
down_revision = "environment20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscription",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("list_key", sa.String(40), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_success_at", sa.DateTime()),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "list_key", "endpoint", name="push_subscription_list_key_endpoint_key"
        ),
    )
    op.add_column(
        "outbound_email", sa.Column("dedupe_key", sa.String(200), nullable=True)
    )
    op.create_index(
        "uq_outbound_email_dedupe_key",
        "outbound_email",
        ["dedupe_key"],
        unique=True,
        postgresql_where=sa.text("dedupe_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_outbound_email_dedupe_key", table_name="outbound_email")
    op.drop_column("outbound_email", "dedupe_key")
    op.drop_table("push_subscription")
