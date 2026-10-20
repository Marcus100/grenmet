"""Platform reliability primitives (ADR-0026, PF2).

Additive. Creates the ``platform`` schema with ``idempotency_key`` (stored
responses for ``Idempotency-Key`` replay) and ``outbox`` (transactional side
effects drained by the worker).

Revision ID: reliability20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "reliability20261020"
down_revision = "payments20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")
    op.create_table(
        "idempotency_key",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status_code", sa.Integer()),
        sa.Column("response", postgresql.JSONB()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "scope",
            "organisation_id",
            "key",
            name=op.f("idempotency_key_scope_organisation_id_key_key"),
        ),
        schema="platform",
    )
    op.create_index(
        "idempotency_key_expires_at_idx",
        "idempotency_key",
        ["expires_at"],
        schema="platform",
    )
    op.create_table(
        "outbox",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", ondelete="SET NULL"),
        ),
        sa.Column("topic", sa.String(80), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("dedupe_key", sa.String(200), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("last_error", sa.String(300)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "topic", "dedupe_key", name=op.f("outbox_topic_dedupe_key_key")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'done', 'dead')", name=op.f("outbox_status_check")
        ),
        schema="platform",
    )
    op.create_index(
        "outbox_due_idx", "outbox", ["status", "next_attempt_at"], schema="platform"
    )


def downgrade() -> None:
    op.drop_index("outbox_due_idx", table_name="outbox", schema="platform")
    op.drop_table("outbox", schema="platform")
    op.drop_index(
        "idempotency_key_expires_at_idx",
        table_name="idempotency_key",
        schema="platform",
    )
    op.drop_table("idempotency_key", schema="platform")
    op.execute("DROP SCHEMA IF EXISTS platform")
