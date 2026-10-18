"""Barrels invoicing: customers, invoices, lines, payments, reminders (P1-P3).

Additive: a new ``billing`` schema with six tables. Money columns are integer
minor units (XCD cents). ``invoice_counter`` holds one row per year and is
row-locked while an invoice is issued, which keeps numbers gapless.

Revision ID: billing20261018
Revises: feeddatareq20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "billing20261018"
down_revision = "feeddatareq20261018"
branch_labels = None
depends_on = None

SCHEMA = "billing"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    op.create_table(
        "customer",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("org.organisation.id", name="customer_organisation_id_fkey"),
            nullable=False,
        ),
        sa.Column("billing_email", sa.String(320), nullable=False),
        sa.Column("address", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("organisation_id", name="customer_organisation_id_key"),
        schema=SCHEMA,
    )
    op.create_table(
        "invoice_counter",
        sa.Column("year", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        schema=SCHEMA,
    )
    op.create_table(
        "invoice",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("number", sa.String(40)),
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("billing.customer.id", name="invoice_customer_id_fkey"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("issue_date", sa.Date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False),
        sa.Column("total_minor", sa.BigInteger(), nullable=False),
        sa.Column("paid_minor", sa.BigInteger(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("legal_entity_name", sa.String(200)),
        sa.Column("pdf_key", sa.String(300)),
        sa.Column("issued_at", sa.DateTime()),
        sa.Column("voided_at", sa.DateTime()),
        sa.Column("void_reason", sa.Text()),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey(
                "user.id",
                ondelete="SET NULL",
                name="invoice_created_by_user_id_fkey",
            ),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("number", name="invoice_number_key"),
        sa.CheckConstraint(
            "status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')",
            name="invoice_status_check",
        ),
        sa.CheckConstraint(
            "paid_minor >= 0 AND paid_minor <= total_minor",
            name="invoice_paid_range_check",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "billing_invoice_customer_id_idx", "invoice", ["customer_id"], schema=SCHEMA
    )
    op.create_index("billing_invoice_status_idx", "invoice", ["status"], schema=SCHEMA)
    op.create_index(
        "invoice_status_due_date_idx",
        "invoice",
        ["status", "due_date"],
        schema=SCHEMA,
    )
    op.create_table(
        "invoice_line",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invoice_id",
            sa.Uuid(),
            sa.ForeignKey(
                "billing.invoice.id",
                ondelete="CASCADE",
                name="invoice_line_invoice_id_fkey",
            ),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False),
        schema=SCHEMA,
    )
    op.create_index(
        "billing_invoice_line_invoice_id_idx",
        "invoice_line",
        ["invoice_id"],
        schema=SCHEMA,
    )
    op.create_table(
        "payment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invoice_id",
            sa.Uuid(),
            sa.ForeignKey("billing.invoice.id", name="payment_invoice_id_fkey"),
            nullable=False,
        ),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(200)),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("paid_date", sa.Date(), nullable=False),
        sa.Column(
            "recorded_by_user_id",
            sa.Uuid(),
            sa.ForeignKey(
                "user.id",
                ondelete="SET NULL",
                name="payment_recorded_by_user_id_fkey",
            ),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "method IN ('bank_transfer', 'cash', 'cheque')",
            name="payment_method_check",
        ),
        sa.CheckConstraint("amount_minor > 0", name="payment_amount_positive_check"),
        schema=SCHEMA,
    )
    op.create_index(
        "billing_payment_invoice_id_idx", "payment", ["invoice_id"], schema=SCHEMA
    )
    op.create_table(
        "invoice_reminder",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "invoice_id",
            sa.Uuid(),
            sa.ForeignKey(
                "billing.invoice.id",
                ondelete="CASCADE",
                name="invoice_reminder_invoice_id_fkey",
            ),
            nullable=False,
        ),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("invoice_id", "stage", name="uq_billing_reminder_stage"),
        schema=SCHEMA,
    )
    op.create_index(
        "billing_invoice_reminder_invoice_id_idx",
        "invoice_reminder",
        ["invoice_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("invoice_reminder", schema=SCHEMA)
    op.drop_table("payment", schema=SCHEMA)
    op.drop_table("invoice_line", schema=SCHEMA)
    op.drop_table("invoice", schema=SCHEMA)
    op.drop_table("invoice_counter", schema=SCHEMA)
    op.drop_table("customer", schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
