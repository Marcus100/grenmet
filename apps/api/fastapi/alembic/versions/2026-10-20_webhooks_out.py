"""Outbound webhooks (ADR-0029, PF6).

Additive. Creates the ``webhooks`` schema with ``endpoint`` (receiver URL,
subscribed events, encrypted signing secret, failure counter) and ``delivery``
(per event and endpoint audit trail, no payload).

Revision ID: webhooksout20261020
Revises: reliability20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "webhooksout20261020"
down_revision = "reliability20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS webhooks")
    op.create_table(
        "endpoint",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("event_types", postgresql.ARRAY(sa.String(60)), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False),
        sa.Column("disabled_reason", sa.String(200)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')", name=op.f("endpoint_status_check")
        ),
        schema="webhooks",
    )
    op.create_index(
        "endpoint_organisation_id_idx",
        "endpoint",
        ["organisation_id"],
        schema="webhooks",
    )
    op.create_table(
        "delivery",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column(
            "endpoint_id",
            sa.String(100),
            sa.ForeignKey("webhooks.endpoint.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_id", sa.String(60), nullable=False),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("response_status", sa.Integer()),
        sa.Column("last_error", sa.String(300)),
        sa.Column("next_attempt_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "endpoint_id", "event_id", name=op.f("delivery_endpoint_id_key")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'dead')",
            name=op.f("delivery_status_check"),
        ),
        schema="webhooks",
    )
    op.create_index(
        "delivery_endpoint_id_created_at_idx",
        "delivery",
        ["endpoint_id", "created_at"],
        schema="webhooks",
    )


def downgrade() -> None:
    op.drop_index(
        "delivery_endpoint_id_created_at_idx", table_name="delivery", schema="webhooks"
    )
    op.drop_table("delivery", schema="webhooks")
    op.drop_index(
        "endpoint_organisation_id_idx", table_name="endpoint", schema="webhooks"
    )
    op.drop_table("endpoint", schema="webhooks")
    op.execute("DROP SCHEMA IF EXISTS webhooks")
