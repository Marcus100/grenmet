"""Payments tables (main database, ``payments`` schema; ADR-0027).

Amounts are integer minor units with the currency on every row. The ledger is
append-only: a trigger refuses DELETE and any UPDATE of a ledger row (only the
audit pointer ``created_by_user_id`` may be nulled when a user is removed), so a
correction is a new entry. Balances are SUMs in SQL, never stored.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

DEFAULT_CURRENCY = "XCD"


class IntentStatus(str, Enum):
    REQUIRES_PAYMENT = "requires_payment"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProviderKey(str, Enum):
    MANUAL = "manual"
    STRIPE = "stripe"


class AttemptStatus(str, Enum):
    STARTED = "started"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class LedgerKind(str, Enum):
    CHARGE = "charge"
    REFUND = "refund"
    FEE = "fee"
    ADJUSTMENT = "adjustment"
    PAYOUT = "payout"


class RefundStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


def _values(enum: type[Enum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


class Intent(Base):
    """A request to collect money for something an organisation sells."""

    __tablename__ = "intent"
    __table_args__ = (
        sa.CheckConstraint(f"status IN ({_values(IntentStatus)})", name="status"),
        sa.CheckConstraint(f"provider IN ({_values(ProviderKey)})", name="provider"),
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        sa.UniqueConstraint(
            "organisation_id", "idempotency_key", name="intent_org_idempotency_key"
        ),
        sa.Index("ix_payments_intent_source", "source_type", "source_id"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    amount_minor: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3), default=DEFAULT_CURRENCY)
    status: Mapped[str] = mapped_column(
        String(20), default=IntentStatus.REQUIRES_PAYMENT.value
    )
    provider: Mapped[str] = mapped_column(String(20))
    #: The provider's id for the checkout (a Stripe Checkout Session id).
    provider_ref: Mapped[str | None] = mapped_column(String(200))
    #: The provider's id for the money movement (a Stripe PaymentIntent id).
    provider_payment_ref: Mapped[str | None] = mapped_column(String(200), index=True)
    #: What is being paid for, e.g. ``bookings.deposit``, ``events.order``.
    source_type: Mapped[str] = mapped_column(String(60))
    source_id: Mapped[str | None] = mapped_column(String(120))
    #: The hosted checkout page, kept so a retried request can return it.
    checkout_url: Mapped[str | None] = mapped_column(String(2000))
    #: SHA-256 hex of the normalised payer email, never the address itself.
    customer_email_hash: Mapped[str | None] = mapped_column(String(64))
    #: Free-form labels from the consumer. Must not hold personal data.
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    idempotency_key: Mapped[str] = mapped_column(String(120))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    #: When the refund reconciliation job last compared this payment's refunds with
    #: the provider; the job takes the oldest (never checked first).
    refunds_checked_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Attempt(Base):
    """One try at paying an intent with a provider."""

    __tablename__ = "attempt"
    __table_args__ = (
        sa.CheckConstraint(f"status IN ({_values(AttemptStatus)})", name="status"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    intent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.intent.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default=AttemptStatus.STARTED.value)
    provider_ref: Mapped[str | None] = mapped_column(String(200))
    #: A short provider code on failure; never a card detail.
    failure_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Refund(Base):
    __tablename__ = "refund"
    __table_args__ = (
        sa.CheckConstraint(f"status IN ({_values(RefundStatus)})", name="status"),
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    intent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.intent.id"), index=True
    )
    amount_minor: Mapped[int]
    reason: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[str] = mapped_column(String(10), default=RefundStatus.PENDING.value)
    provider_ref: Mapped[str | None] = mapped_column(String(200))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class LedgerEntry(Base):
    """One signed money movement owed to (+) or by (-) an organisation.

    charge +, refund -, fee -, payout -, adjustment either sign. Unique
    ``(provider, provider_event_id)`` makes provider callbacks idempotent.
    """

    __tablename__ = "ledger_entry"
    __table_args__ = (
        sa.CheckConstraint(f"kind IN ({_values(LedgerKind)})", name="kind"),
        sa.CheckConstraint(f"provider IN ({_values(ProviderKey)})", name="provider"),
        sa.CheckConstraint("amount_minor <> 0", name="amount_nonzero"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        sa.CheckConstraint("kind <> 'charge' OR amount_minor > 0", name="charge_sign"),
        sa.CheckConstraint(
            "kind NOT IN ('refund', 'fee', 'payout') OR amount_minor < 0",
            name="debit_sign",
        ),
        sa.CheckConstraint(
            "kind IN ('payout', 'adjustment') OR intent_id IS NOT NULL",
            name="intent_required",
        ),
        sa.UniqueConstraint(
            "provider", "provider_event_id", name="ledger_entry_provider_event"
        ),
        sa.Index("ix_payments_ledger_org_created", "organisation_id", "created_at"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id")
    )
    intent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payments.intent.id"), index=True
    )
    refund_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payments.refund.id")
    )
    kind: Mapped[str] = mapped_column(String(12))
    amount_minor: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3))
    provider: Mapped[str] = mapped_column(String(20))
    provider_event_id: Mapped[str | None] = mapped_column(String(200))
    reference: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(sa.Text)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
