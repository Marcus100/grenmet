"""Connect tables (``payments`` schema, ADR-0027).

``connected_account`` holds the one Stripe account id per organisation and the
account's last known state. It holds no keys. ``dispute`` records a card dispute
the business must answer; it never moves money and is not a ledger entry.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class ConnectedAccount(Base):
    """A business's connected Stripe account (one per organisation)."""

    __tablename__ = "connected_account"
    __table_args__ = (
        sa.CheckConstraint(
            "platform_fee_bps BETWEEN 0 AND 10000", name="platform_fee_range"
        ),
        sa.CheckConstraint("country ~ '^[A-Z]{2}$'", name="country_format"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), unique=True
    )
    stripe_account_id: Mapped[str] = mapped_column(String(100), unique=True)
    country: Mapped[str] = mapped_column(String(2), default="NZ")
    charges_enabled: Mapped[bool] = mapped_column(default=False)
    payouts_enabled: Mapped[bool] = mapped_column(default=False)
    details_submitted: Mapped[bool] = mapped_column(default=False)
    #: Stripe's ``requirements.currently_due`` and ``past_due`` (field names only).
    requirements_due: Mapped[list[Any]] = mapped_column(
        JSONB, default=list, server_default=sa.text("'[]'::jsonb")
    )
    disabled_reason: Mapped[str | None] = mapped_column(String(100))
    #: The Barrels platform fee on each charge, in basis points (0 = none).
    platform_fee_bps: Mapped[int] = mapped_column(default=0, server_default="0")
    #: When the stored state was known to be current: a refresh or the event's time.
    #: A webhook older than this is ignored, so a late delivery cannot undo newer state.
    state_as_of: Mapped[datetime] = mapped_column(default=utc_now)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class Dispute(Base):
    """A card dispute (chargeback) on a business's connected account."""

    __tablename__ = "dispute"
    __table_args__ = (
        sa.CheckConstraint("amount_minor > 0", name="amount_positive"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        {"schema": "payments"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id"), index=True
    )
    #: The payment it disputes, when we can match it (NULL otherwise).
    intent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payments.intent.id"), index=True
    )
    provider_dispute_ref: Mapped[str] = mapped_column(String(200), unique=True)
    provider_payment_ref: Mapped[str | None] = mapped_column(String(200))
    amount_minor: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(40))
    reason: Mapped[str | None] = mapped_column(String(60))
    evidence_due_by: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
