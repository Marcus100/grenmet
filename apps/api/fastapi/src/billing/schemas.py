import uuid
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import EmailStr, Field, HttpUrl, RootModel, field_validator

from src.models import BaseModel, UtcDateTime

from .models import (
    AppSubscriptionChannel,
    AppSubscriptionStatus,
    InvoiceStatus,
    PaymentMethod,
)


class CheckoutSessionPublic(BaseModel):
    id: str
    url: HttpUrl


class WebhookReceivedPublic(BaseModel):
    received: bool


# --- App subscriptions (ADR-0065) -----------------------------------------------------


class AppSubscriptionCheckoutCreate(BaseModel):
    plan_key: str = Field(min_length=1, max_length=64)
    #: Owner decision 2026-11-22: XCD only (USD is shown as a converted note, not charged).
    currency: Literal["XCD"] = "XCD"


class AppSubscriptionPublic(BaseModel):
    id: uuid.UUID
    app_key: str
    plan_key: str
    channel: AppSubscriptionChannel
    status: AppSubscriptionStatus
    currency: str
    #: The plan's price in ``currency``, in minor units (XCD cents).
    amount_minor: int
    current_period_end: UtcDateTime | None
    cancel_at_period_end: bool
    trial_end: UtcDateTime | None
    created_at: UtcDateTime


class AppSubscriptionListPublic(BaseModel):
    data: list[AppSubscriptionPublic]
    #: Plans that can be bought now, as ``plan_key:currency``: Stripe is configured
    #: and the plan has a Stripe price. Empty until billing is set up, so a plan
    #: screen can say paid plans open soon instead of offering a checkout that fails.
    purchasable: list[str] = Field(
        default_factory=list,
        description=(
            "Plans that can be bought now, as `plan_key:currency` (for example "
            "`bookings-monthly:XCD`). Empty while billing is not set up."
        ),
    )


class AppSubscriptionCheckoutPublic(BaseModel):
    id: uuid.UUID
    url: HttpUrl


# --- Invoicing -------------------------------------------------------------------
# Money is always an integer in minor units (XCD cents).


class AgeingBucket(str, Enum):
    CURRENT = "current"
    DAYS_1_30 = "days_1_30"
    DAYS_31_60 = "days_31_60"
    DAYS_61_90 = "days_61_90"
    OVER_90 = "over_90"


def _max_places(value: float, places: int, label: str) -> float:
    exponent = Decimal(str(value)).as_tuple().exponent
    if isinstance(exponent, int) and exponent < -places:
        raise ValueError(f"{label} allows at most {places} decimal places")
    return value


class CustomerCreate(BaseModel):
    organisation_id: str = Field(min_length=1, max_length=100)
    billing_email: EmailStr
    address: str | None = Field(default=None, max_length=1000)


class CustomerUpdate(BaseModel):
    billing_email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=1000)


class CustomerPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    organisation_name: str
    billing_email: str
    address: str | None
    created_at: UtcDateTime


class CustomerListPublic(BaseModel):
    data: list[CustomerPublic]
    count: int
    page: int
    size: int


class InvoiceLineInput(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: float = Field(gt=0, le=1_000_000_000)
    unit_price_minor: int = Field(ge=0, le=1_000_000_000_000)
    tax_rate: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="VAT percent; the configured default when omitted",
    )

    @field_validator("quantity")
    @classmethod
    def _quantity_places(cls, value: float) -> float:
        return _max_places(value, 3, "quantity")

    @field_validator("tax_rate")
    @classmethod
    def _rate_places(cls, value: float | None) -> float | None:
        return None if value is None else _max_places(value, 2, "tax_rate")


class InvoiceDraftWrite(BaseModel):
    customer_id: uuid.UUID
    notes: str | None = Field(default=None, max_length=2000)
    lines: list[InvoiceLineInput] = Field(default_factory=list, max_length=100)


class InvoiceLinePublic(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    quantity: float
    unit_price_minor: int
    tax_rate: float
    subtotal_minor: int
    tax_minor: int


class PaymentCreate(BaseModel):
    method: PaymentMethod
    reference: str | None = Field(default=None, max_length=200)
    amount_minor: int = Field(gt=0, le=1_000_000_000_000)
    paid_date: date


class PaymentPublic(BaseModel):
    id: uuid.UUID
    method: PaymentMethod
    reference: str | None
    amount_minor: int
    paid_date: date
    created_at: UtcDateTime


class InvoiceIssue(BaseModel):
    issue_date: date | None = Field(
        default=None, description="Defaults to today in Grenada (UTC-4)"
    )


class InvoiceVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class InvoiceSummaryPublic(BaseModel):
    id: uuid.UUID
    number: str | None
    status: InvoiceStatus
    customer_id: uuid.UUID
    organisation_id: str
    customer_name: str
    issue_date: date | None
    due_date: date | None
    currency: str
    total_minor: int
    paid_minor: int
    outstanding_minor: int
    created_at: UtcDateTime


class InvoiceListPublic(BaseModel):
    data: list[InvoiceSummaryPublic]
    count: int
    page: int
    size: int


class InvoiceDetailPublic(InvoiceSummaryPublic):
    billing_email: str
    address: str | None
    legal_entity_name: str | None
    subtotal_minor: int
    tax_minor: int
    notes: str | None
    void_reason: str | None
    voided_at: UtcDateTime | None
    issued_at: UtcDateTime | None
    pdf_stored: bool
    lines: list[InvoiceLinePublic]
    payments: list[PaymentPublic]


class AgeingBucketPublic(BaseModel):
    bucket: AgeingBucket
    invoice_count: int
    outstanding_minor: int


class ReceivableRowPublic(BaseModel):
    invoice_id: uuid.UUID
    number: str
    customer_name: str
    due_date: date
    days_overdue: int
    bucket: AgeingBucket
    total_minor: int
    outstanding_minor: int


class ReceivablesPublic(BaseModel):
    as_of: date
    currency: str
    total_outstanding_minor: int
    buckets: list[AgeingBucketPublic]
    data: list[ReceivableRowPublic]
    count: int
    page: int
    size: int


class InvoiceIssueBody(RootModel[InvoiceIssue | None]):
    """Optional issue request. An absent body and null are both accepted."""
