"""Payments core (ADR-0027, PF4): intents, attempts, refunds and an append-only ledger.

Additive: a new ``payments`` schema. A trigger makes ``payments.ledger_entry``
append-only: no DELETE, and no UPDATE of any column except the audit pointer
``created_by_user_id`` (nulled when a user is removed). A correction is a new entry.

Revision ID: payments20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "payments20261020"
down_revision = "orgsites20261020"
branch_labels = None
depends_on = None

INTENT_STATUSES = "'requires_payment', 'processing', 'succeeded', 'failed', 'cancelled'"
PROVIDERS = "'manual', 'stripe'"


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS payments")
    op.create_table(
        "intent",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_ref", sa.String(length=200), nullable=True),
        sa.Column("provider_payment_ref", sa.String(length=200), nullable=True),
        sa.Column("source_type", sa.String(length=60), nullable=False),
        sa.Column("source_id", sa.String(length=120), nullable=True),
        sa.Column("checkout_url", sa.String(length=2000), nullable=True),
        sa.Column("customer_email_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            f"status IN ({INTENT_STATUSES})", name=op.f("intent_status_check")
        ),
        sa.CheckConstraint(
            f"provider IN ({PROVIDERS})", name=op.f("intent_provider_check")
        ),
        sa.CheckConstraint(
            "amount_minor > 0", name=op.f("intent_amount_positive_check")
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("intent_currency_format_check")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("intent_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["user.id"],
            name=op.f("intent_created_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("intent_pkey")),
        sa.UniqueConstraint(
            "organisation_id", "idempotency_key", name="intent_org_idempotency_key"
        ),
        schema="payments",
    )
    op.create_index(
        op.f("payments_intent_organisation_id_idx"),
        "intent",
        ["organisation_id"],
        schema="payments",
    )
    op.create_index(
        op.f("payments_intent_provider_payment_ref_idx"),
        "intent",
        ["provider_payment_ref"],
        schema="payments",
    )
    op.create_index(
        "ix_payments_intent_source",
        "intent",
        ["source_type", "source_id"],
        schema="payments",
    )

    op.create_table(
        "attempt",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("intent_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("provider_ref", sa.String(length=200), nullable=True),
        sa.Column("failure_code", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('started', 'succeeded', 'failed')",
            name=op.f("attempt_status_check"),
        ),
        sa.ForeignKeyConstraint(
            ["intent_id"],
            ["payments.intent.id"],
            name=op.f("attempt_intent_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("attempt_pkey")),
        schema="payments",
    )
    op.create_index(
        op.f("payments_attempt_intent_id_idx"), "attempt", ["intent_id"], schema="payments"
    )

    op.create_table(
        "refund",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("intent_id", sa.Uuid(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("provider_ref", sa.String(length=200), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed')",
            name=op.f("refund_status_check"),
        ),
        sa.CheckConstraint(
            "amount_minor > 0", name=op.f("refund_amount_positive_check")
        ),
        sa.ForeignKeyConstraint(
            ["intent_id"], ["payments.intent.id"], name=op.f("refund_intent_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["user.id"],
            name=op.f("refund_created_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("refund_pkey")),
        schema="payments",
    )
    op.create_index(
        op.f("payments_refund_intent_id_idx"), "refund", ["intent_id"], schema="payments"
    )

    op.create_table(
        "ledger_entry",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("intent_id", sa.Uuid(), nullable=True),
        sa.Column("refund_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_event_id", sa.String(length=200), nullable=True),
        sa.Column("reference", sa.String(length=200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('charge', 'refund', 'fee', 'adjustment', 'payout')",
            name=op.f("ledger_entry_kind_check"),
        ),
        sa.CheckConstraint(
            f"provider IN ({PROVIDERS})", name=op.f("ledger_entry_provider_check")
        ),
        sa.CheckConstraint(
            "amount_minor <> 0", name=op.f("ledger_entry_amount_nonzero_check")
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ledger_entry_currency_format_check")
        ),
        sa.CheckConstraint(
            "kind <> 'charge' OR amount_minor > 0",
            name=op.f("ledger_entry_charge_sign_check"),
        ),
        sa.CheckConstraint(
            "kind NOT IN ('refund', 'fee', 'payout') OR amount_minor < 0",
            name=op.f("ledger_entry_debit_sign_check"),
        ),
        sa.CheckConstraint(
            "kind IN ('payout', 'adjustment') OR intent_id IS NOT NULL",
            name=op.f("ledger_entry_intent_required_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("ledger_entry_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["intent_id"],
            ["payments.intent.id"],
            name=op.f("ledger_entry_intent_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["refund_id"],
            ["payments.refund.id"],
            name=op.f("ledger_entry_refund_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["user.id"],
            name=op.f("ledger_entry_created_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("ledger_entry_pkey")),
        sa.UniqueConstraint(
            "provider", "provider_event_id", name="ledger_entry_provider_event"
        ),
        schema="payments",
    )
    op.create_index(
        op.f("payments_ledger_entry_intent_id_idx"),
        "ledger_entry",
        ["intent_id"],
        schema="payments",
    )
    op.create_index(
        "ix_payments_ledger_org_created",
        "ledger_entry",
        ["organisation_id", "created_at"],
        schema="payments",
    )
    op.execute(
        """
        CREATE FUNCTION payments.ledger_entry_is_append_only() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'payments.ledger_entry is append-only';
          END IF;
          IF (to_jsonb(NEW) - 'created_by_user_id')
             IS DISTINCT FROM (to_jsonb(OLD) - 'created_by_user_id') THEN
            RAISE EXCEPTION 'payments.ledger_entry is append-only';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER ledger_entry_append_only
          BEFORE UPDATE OR DELETE ON payments.ledger_entry
          FOR EACH ROW EXECUTE FUNCTION payments.ledger_entry_is_append_only();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER ledger_entry_append_only ON payments.ledger_entry")
    op.execute("DROP FUNCTION payments.ledger_entry_is_append_only()")
    op.drop_table("ledger_entry", schema="payments")
    op.drop_table("refund", schema="payments")
    op.drop_table("attempt", schema="payments")
    op.drop_table("intent", schema="payments")
    op.execute("DROP SCHEMA payments")
