"""Payments: Stripe Connect for New Zealand businesses (ADR-0027, test mode).

Additive only:

- ``payments.connected_account``: one Stripe connected-account id per organisation
  and that account's last known state (charges, payouts, requirements due). No keys.
  ``platform_fee_bps`` is the Barrels platform fee on the business's charges (0-10000,
  default 0).
- ``payments.dispute``: card disputes on a connected account, recorded for the
  business. Never a ledger entry.
- ``payments.intent``: two nullable columns, the connected account a direct charge
  runs on and the platform fee in minor units. Existing rows stay NULL (platform
  charges, as today).

Downgrade drops the new tables and columns. Nothing is backfilled.

Revision ID: paymentsconnect20261121
Revises: eventsrefundpolicy20261121
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "paymentsconnect20261121"
down_revision = "eventsrefundpolicy20261121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "intent",
        sa.Column("connected_account_id", sa.String(length=100), nullable=True),
        schema="payments",
    )
    op.add_column(
        "intent",
        sa.Column("application_fee_minor", sa.Integer(), nullable=True),
        schema="payments",
    )

    op.create_table(
        "connected_account",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("stripe_account_id", sa.String(length=100), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("charges_enabled", sa.Boolean(), nullable=False),
        sa.Column("payouts_enabled", sa.Boolean(), nullable=False),
        sa.Column("details_submitted", sa.Boolean(), nullable=False),
        sa.Column(
            "requirements_due",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("disabled_reason", sa.String(length=100), nullable=True),
        sa.Column("platform_fee_bps", sa.Integer(), server_default="0", nullable=False),
        sa.Column("state_as_of", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "platform_fee_bps BETWEEN 0 AND 10000",
            name=op.f("connected_account_platform_fee_range_check"),
        ),
        sa.CheckConstraint(
            "country ~ '^[A-Z]{2}$'",
            name=op.f("connected_account_country_format_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("connected_account_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("connected_account_pkey")),
        sa.UniqueConstraint(
            "organisation_id", name=op.f("connected_account_organisation_id_key")
        ),
        sa.UniqueConstraint(
            "stripe_account_id",
            name=op.f("connected_account_stripe_account_id_key"),
        ),
        schema="payments",
    )

    op.create_table(
        "dispute",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("intent_id", sa.Uuid(), nullable=True),
        sa.Column("provider_dispute_ref", sa.String(length=200), nullable=False),
        sa.Column("provider_payment_ref", sa.String(length=200), nullable=True),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.String(length=60), nullable=True),
        sa.Column("evidence_due_by", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "amount_minor > 0", name=op.f("dispute_amount_positive_check")
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("dispute_currency_format_check")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("dispute_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["intent_id"],
            ["payments.intent.id"],
            name=op.f("dispute_intent_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("dispute_pkey")),
        sa.UniqueConstraint(
            "provider_dispute_ref", name=op.f("dispute_provider_dispute_ref_key")
        ),
        schema="payments",
    )
    op.create_index(
        op.f("payments_dispute_organisation_id_idx"),
        "dispute",
        ["organisation_id"],
        schema="payments",
    )
    op.create_index(
        op.f("payments_dispute_intent_id_idx"),
        "dispute",
        ["intent_id"],
        schema="payments",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("payments_dispute_intent_id_idx"), table_name="dispute", schema="payments"
    )
    op.drop_index(
        op.f("payments_dispute_organisation_id_idx"),
        table_name="dispute",
        schema="payments",
    )
    op.drop_table("dispute", schema="payments")
    op.drop_table("connected_account", schema="payments")
    op.drop_column("intent", "application_fee_minor", schema="payments")
    op.drop_column("intent", "connected_account_id", schema="payments")
