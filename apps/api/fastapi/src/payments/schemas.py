import uuid
from datetime import date
from enum import Enum
from typing import Annotated

from pydantic import Field, field_validator

from src.models import BaseModel, UtcDateTime

from .models import (
    DEFAULT_CURRENCY,
    AttemptStatus,
    IntentStatus,
    LedgerKind,
    ProviderKey,
    RefundStatus,
)

Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$", examples=["XCD"])]
Amount = Annotated[int, Field(ge=1, le=1_000_000_000)]
Reason = Annotated[str, Field(min_length=3, max_length=500)]


class ManualMethod(str, Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"


class PaymentIntentCreate(BaseModel):
    amount_minor: Amount
    currency: Currency = DEFAULT_CURRENCY
    provider: ProviderKey = ProviderKey.MANUAL
    source_type: Annotated[
        str,
        Field(
            min_length=3,
            max_length=60,
            pattern=r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$",
            examples=["bookings.deposit"],
        ),
    ]
    source_id: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    customer_email: Annotated[str, Field(max_length=254)] | None = Field(
        default=None,
        description="Hashed on receipt and never stored or sent to the provider.",
    )
    metadata: dict[str, str | int | bool] = Field(
        default_factory=dict,
        description="Small labels about the sale. Must not contain personal data.",
    )
    idempotency_key: Annotated[str, Field(min_length=8, max_length=120)]

    @field_validator("metadata")
    @classmethod
    def _small_metadata(
        cls, value: dict[str, str | int | bool]
    ) -> dict[str, str | int | bool]:
        if len(value) > 20 or any(len(key) > 40 for key in value):
            raise ValueError("metadata allows at most 20 keys of 40 characters")
        if any(isinstance(item, str) and len(item) > 200 for item in value.values()):
            raise ValueError("metadata values are limited to 200 characters")
        return value


class PaymentIntentPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    amount_minor: int
    currency: str
    status: IntentStatus
    provider: ProviderKey
    source_type: str
    source_id: str | None
    metadata: dict[str, str | int | bool]
    captured_minor: int = Field(description="Money collected so far.")
    refunded_minor: int = Field(description="Money handed back or being handed back.")
    created_at: UtcDateTime
    updated_at: UtcDateTime


class PaymentCheckoutPublic(BaseModel):
    """A new intent and, for an online rail, where to send the payer."""

    intent: PaymentIntentPublic
    checkout_url: str | None = Field(
        description="Hosted checkout for the payer; null for staff-recorded rails."
    )


class PaymentIntentListPublic(BaseModel):
    data: list[PaymentIntentPublic]
    count: int
    page: int
    size: int


class PaymentAttemptPublic(BaseModel):
    id: uuid.UUID
    provider: ProviderKey
    status: AttemptStatus
    failure_code: str | None
    created_at: UtcDateTime


class PaymentRefundPublic(BaseModel):
    id: uuid.UUID
    intent_id: uuid.UUID
    amount_minor: int
    reason: str
    status: RefundStatus
    created_at: UtcDateTime


class PaymentIntentDetailPublic(BaseModel):
    intent: PaymentIntentPublic
    attempts: list[PaymentAttemptPublic]
    refunds: list[PaymentRefundPublic]


class ManualPaymentCreate(BaseModel):
    method: ManualMethod
    reference: Annotated[str, Field(max_length=200)] | None = Field(
        default=None, description="Receipt, cheque or transfer number."
    )


class PaymentRefundCreate(BaseModel):
    amount_minor: Amount | None = Field(
        default=None, description="Defaults to everything still refundable."
    )
    reason: Reason


class PaymentBalancePublic(BaseModel):
    organisation_id: str
    currency: str
    owed_minor: int = Field(description="What Barrels holds for the organisation.")


class PaymentBalanceListPublic(BaseModel):
    data: list[PaymentBalancePublic]


class PaymentLedgerEntryPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    intent_id: uuid.UUID | None
    kind: LedgerKind
    amount_minor: int
    currency: str
    provider: ProviderKey
    reference: str | None
    note: str | None
    created_at: UtcDateTime


class PaymentLedgerListPublic(BaseModel):
    data: list[PaymentLedgerEntryPublic]
    count: int
    page: int
    size: int


class PaymentPayoutCreate(BaseModel):
    organisation_id: Annotated[str, Field(min_length=1, max_length=100)]
    amount_minor: Amount
    currency: Currency = DEFAULT_CURRENCY
    reference: Annotated[str, Field(min_length=1, max_length=200)]
    note: Annotated[str, Field(max_length=500)] | None = None


class PaymentReconciliationRowPublic(BaseModel):
    organisation_id: str
    currency: str
    opening_minor: int
    charges_minor: int
    refunds_minor: int
    fees_minor: int
    adjustments_minor: int
    payouts_minor: int
    closing_minor: int
    intents_succeeded: int
    unmatched_intents: int = Field(
        description="Succeeded intents in the period with no charge in the ledger."
    )


class PaymentCallbackAck(BaseModel):
    received: bool = True


class PaymentReconciliationPublic(BaseModel):
    start_date: date
    end_date: date
    generated_at: UtcDateTime
    rows: list[PaymentReconciliationRowPublic]
