"""The provider seam (ADR-0027): what the payments core needs from any rail.

Adapters translate to and from this vocabulary so the service, ledger and
reconciliation never see a provider's own payload shapes.
"""

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from src.payments.models import Intent


class EventKind(str, Enum):
    PAYMENT_SUCCEEDED = "payment_succeeded"
    PAYMENT_FAILED = "payment_failed"
    REFUNDED = "refunded"
    #: A verified event the core has no use for; answered 2xx and dropped.
    IGNORED = "ignored"


@dataclass(frozen=True)
class PaymentStart:
    """What creating a payment produced: where to send the payer, if anywhere."""

    provider_ref: str | None = None
    #: Hosted checkout the payer is sent to; ``None`` for staff-recorded rails.
    checkout_url: str | None = None


@dataclass(frozen=True)
class ProviderEvent:
    """A verified provider callback in the core's vocabulary."""

    provider: str
    #: The provider's unique event id; with ``provider`` it is the ledger's
    #: idempotency key.
    event_id: str
    kind: EventKind
    #: Our intent id when the provider echoed it back (metadata).
    intent_id: uuid.UUID | None = None
    provider_ref: str | None = None
    payment_ref: str | None = None
    amount_minor: int | None = None
    currency: str | None = None
    #: For ``REFUNDED``: the provider's running total refunded on the payment.
    refunded_total_minor: int | None = None
    failure_code: str | None = None


@dataclass(frozen=True)
class RefundResult:
    provider_ref: str | None
    #: ``succeeded`` or ``pending`` (the provider settles it later).
    status: str


@dataclass(frozen=True)
class ProviderStatus:
    """The provider's view of a payment, as an ``IntentStatus`` value."""

    status: str


class PaymentProvider(Protocol):
    key: str

    async def create_payment(
        self, intent: Intent, /, *, title: str | None = None
    ) -> PaymentStart: ...

    def verify_callback(
        self, headers: Mapping[str, str], body: bytes, /
    ) -> ProviderEvent: ...

    async def refund(
        self, intent: Intent, amount_minor: int, refund_id: uuid.UUID, /
    ) -> RefundResult: ...

    async def fetch_status(self, intent: Intent, /) -> ProviderStatus: ...
