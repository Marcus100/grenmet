"""Payments: WiPay per business and the Bookings payment link (ADR-0027 amendment, 21 Nov 2026).

Additive, with a downgrade:

- ``payments.intent.provider`` and ``payments.ledger_entry.provider`` also allow
  ``wipay``. The checks are dropped and re-added under the same names (a small table,
  short lock timeout).
- ``payments.intent.provider_environment`` (nullable; ``sandbox`` or ``live``).
- ``payments.merchant_account``: one online-payment account per business and provider,
  with one encrypted credentials blob, the business's enable switch, the sandbox proof
  and the owner's live approval. No credential is stored in a plain column.
- ``bookings.profile.deposit_payment_link`` (nullable; https, validated in the API):
  the business's own payment link, used when no online provider is ready.

Downgrade removes the new objects. Restoring the provider checks fails while a
``wipay`` row exists, by design: that money must be reconciled first.

The provider checks are the only drop in this file. It widens the list the expand
``payments20261020`` created (no row is removed, and the previous release never writes
``wipay``), so it is declared as the contract step for that expand, dated after it.

Revision ID: paymentswipay20261121
Revises: billingappstrial20261123
"""

import sqlalchemy as sa

from alembic import op

revision = "paymentswipay20261121"
down_revision = "billingappstrial20261123"
branch_labels = None
depends_on = None
CONTRACT = {"expand_revision": "payments20261020", "contract_after": "2026-11-21"}

PROVIDERS_BEFORE = "'manual', 'stripe'"
PROVIDERS_AFTER = "'manual', 'stripe', 'wipay'"
PROVIDER_CHECKS = (
    ("intent", "intent_provider_check"),
    ("ledger_entry", "ledger_entry_provider_check"),
)


def _add_provider_check(table: str, name: str, providers: str) -> None:
    """Add the provider check NOT VALID: new rows are checked at once, and the existing
    rows are checked by ``_validate_provider_checks`` (a lock that lets reads and writes
    continue). Splitting them keeps the long check out of the transaction."""
    op.execute(
        f"ALTER TABLE payments.{table} ADD CONSTRAINT {name} "
        f"CHECK (provider IN ({providers})) NOT VALID"
    )


def _validate_provider_checks() -> None:
    """Check the existing rows against the wider provider list. VALIDATE CONSTRAINT takes
    a share-update-exclusive lock: reads and writes continue, so it runs in this same
    transaction (no autocommit block is needed)."""
    for table, name in PROVIDER_CHECKS:
        op.execute(f"ALTER TABLE payments.{table} VALIDATE CONSTRAINT {name}")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    for table, name in PROVIDER_CHECKS:
        op.drop_constraint(op.f(name), table, schema="payments", type_="check")
        _add_provider_check(table, name, PROVIDERS_AFTER)

    op.add_column(
        "intent",
        sa.Column("provider_environment", sa.String(length=10), nullable=True),
        schema="payments",
    )
    op.create_check_constraint(
        op.f("intent_provider_environment_check"),
        "intent",
        "provider_environment IS NULL OR provider_environment IN ('sandbox', 'live')",
        schema="payments",
    )

    op.create_table(
        "merchant_account",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("environment", sa.String(length=10), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("credentials_encrypted", sa.Text(), nullable=False),
        sa.Column("sandbox_verified_at", sa.DateTime(), nullable=True),
        sa.Column("live_approved_at", sa.DateTime(), nullable=True),
        sa.Column("live_approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "provider IN ('wipay')", name=op.f("merchant_account_provider_check")
        ),
        sa.CheckConstraint(
            "environment IN ('sandbox', 'live')",
            name=op.f("merchant_account_environment_check"),
        ),
        sa.ForeignKeyConstraint(
            ["live_approved_by_user_id"],
            ["user.id"],
            name=op.f("merchant_account_live_approved_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("merchant_account_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("merchant_account_pkey")),
        sa.UniqueConstraint(
            "organisation_id", "provider", name="merchant_account_org_provider"
        ),
        schema="payments",
    )
    op.create_index(
        op.f("payments_merchant_account_organisation_id_idx"),
        "merchant_account",
        ["organisation_id"],
        unique=False,
        schema="payments",
    )

    op.add_column(
        "profile",
        sa.Column("deposit_payment_link", sa.String(length=2000), nullable=True),
        schema="bookings",
    )
    _validate_provider_checks()


def downgrade() -> None:
    op.drop_column("profile", "deposit_payment_link", schema="bookings")
    op.drop_index(
        op.f("payments_merchant_account_organisation_id_idx"),
        table_name="merchant_account",
        schema="payments",
    )
    op.drop_table("merchant_account", schema="payments")
    op.drop_constraint(
        op.f("intent_provider_environment_check"),
        "intent",
        schema="payments",
        type_="check",
    )
    op.drop_column("intent", "provider_environment", schema="payments")
    for table, name in PROVIDER_CHECKS:
        op.drop_constraint(op.f(name), table, schema="payments", type_="check")
        _add_provider_check(table, name, PROVIDERS_BEFORE)
    _validate_provider_checks()
