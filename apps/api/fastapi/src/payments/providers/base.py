"""The provider seam (ADR-0027): what the payments core needs from any rail.

Adapters translate to and from this vocabulary so the service, ledger and
reconciliation never see a provider's own payload shapes.
"""

import uuid
from collections.abc import Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from src.payments.models import Intent


class EventKind(str, Enum):
    PAYMENT_SUCCEEDED = "payment_succeeded"
    PAYMENT_FAILED = "payment_failed"
    REFUNDED = "refunded"
    #: A provider refund report (``refund.created|updated|failed``): one refund.
    REFUND_REPORTED = "refund_reported"
    #: A verified event the core has no use for; answered 2xx and dropped.
    IGNORED = "ignored"


@dataclass(frozen=True)
class PaymentStart:
    """What creating a payment produced: where to send the payer, if anywhere."""

    provider_ref: str | None = None
    #: Hosted checkout the payer is sent to; ``None`` for staff-recorded rails.
    checkout_url: str | None = None


@dataclass(frozen=True)
class ProviderRefund:
    """One refund listed on the provider's charge, in the core's vocabulary."""

    provider_ref: str | None
    amount_minor: int
    #: The provider's status: ``succeeded``, ``pending``, ``failed`` or ``canceled``.
    status: str
    #: Our refund id, echoed back in the provider's metadata when we made the refund.
    refund_id: uuid.UUID | None = None


@dataclass(frozen=True)
class RefundListing:
    """Every refund the provider holds for one payment, for reconciliation."""

    refunds: tuple[ProviderRefund, ...]
    #: False when the listing stopped early (more pages than the adapter will read).
    complete: bool = True


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
    #: For ``REFUNDED``: the refunds the provider listed on the payment.
    refunds: tuple[ProviderRefund, ...] = ()
    #: False when the provider listed only some of the refunds (more exist), or
    #: sent no list at all.
    refunds_complete: bool = True
    #: False when a ``charge.refunded`` carried no refund list (Stripe lists refunds
    #: only when expanded, and webhooks are not expanded).
    refunds_listed: bool = True
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

    async def list_refunds(self, intent: Intent, /) -> RefundListing: ...

    def batch(self) -> AbstractAsyncContextManager[None]:
        """Reuse one connection for every call made inside the block."""
        ...
