"""Invoicing tables (main database, ``billing`` schema).

Barrels invoices its own service-line clients; a customer is a platform
organisation. Money is stored in minor units (XCD cents) as integers. The number
counter is a row per year, locked while an invoice is issued, so numbers are
gapless: a rolled-back issue rolls the counter back with it.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.orm import Base
from src.utils.datetime import utc_now


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    VOID = "void"


class PaymentMethod(str, Enum):
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    CHEQUE = "cheque"


class ReminderStage(str, Enum):
    BEFORE_DUE_7 = "before_due_7"
    DUE_TODAY = "due_today"
    OVERDUE_7 = "overdue_7"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


class Customer(Base):
    """The billing details of one platform organisation (at most one customer each)."""

    __tablename__ = "customer"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), unique=True
    )
    billing_email: Mapped[str] = mapped_column(String(320))
    address: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class InvoiceCounter(Base):
    """Last number issued in a calendar year (row-locked while issuing)."""

    __tablename__ = "invoice_counter"
    __table_args__ = {"schema": "billing"}

    year: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    last_number: Mapped[int] = mapped_column(default=0)


class Invoice(Base):
    __tablename__ = "invoice"
    __table_args__ = (
        sa.CheckConstraint(f"status IN ({_values(InvoiceStatus)})", name="status"),
        sa.CheckConstraint(
            "paid_minor >= 0 AND paid_minor <= total_minor", name="paid_range"
        ),
        sa.Index("invoice_status_due_date_idx", "status", "due_date"),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    number: Mapped[str | None] = mapped_column(String(40), unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("billing.customer.id"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default=InvoiceStatus.DRAFT.value, index=True
    )
    issue_date: Mapped[date | None]
    due_date: Mapped[date | None]
    currency: Mapped[str] = mapped_column(String(3), default="XCD")
    subtotal_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    tax_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    total_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    paid_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    notes: Mapped[str | None] = mapped_column(sa.Text)
    legal_entity_name: Mapped[str | None] = mapped_column(String(200))
    pdf_key: Mapped[str | None] = mapped_column(String(300))
    issued_at: Mapped[datetime | None]
    voided_at: Mapped[datetime | None]
    void_reason: Mapped[str | None] = mapped_column(sa.Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

    customer: Mapped[Customer] = relationship(lazy="raise")
    lines: Mapped[list[InvoiceLine]] = relationship(
        order_by="InvoiceLine.position",
        cascade="all, delete-orphan",
        lazy="raise",
    )
    payments: Mapped[list[Payment]] = relationship(
        order_by="Payment.created_at", lazy="raise"
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_line"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("billing.invoice.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(default=0)
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3))
    unit_price_minor: Mapped[int] = mapped_column(sa.BigInteger)
    tax_rate: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2))
    subtotal_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)
    tax_minor: Mapped[int] = mapped_column(sa.BigInteger, default=0)


class Payment(Base):
    """A manual payment (bank transfer, cash or cheque) against an invoice."""

    __tablename__ = "payment"
    __table_args__ = (
        sa.CheckConstraint(f"method IN ({_values(PaymentMethod)})", name="method"),
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("billing.invoice.id"), index=True
    )
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str | None] = mapped_column(String(200))
    amount_minor: Mapped[int] = mapped_column(sa.BigInteger)
    paid_date: Mapped[date]
    recorded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class InvoiceReminder(Base):
    """One row per reminder stage sent; the unique key makes sending idempotent."""

    __tablename__ = "invoice_reminder"
    __table_args__ = (
        sa.UniqueConstraint("invoice_id", "stage", name="uq_billing_reminder_stage"),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("billing.invoice.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(20))
    sent_at: Mapped[datetime] = mapped_column(default=utc_now)
