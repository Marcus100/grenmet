"""Stripe adapter, TEST MODE ONLY (ADR-0027), over httpx.

No live card rail can ship through this module:

- the secret key must start with ``sk_test_``; anything else (including a live
  ``sk_live_`` or restricted ``rk_live_`` key) is refused with 503 before any
  request is made;
- the webhook secret must be a ``whsec_`` value or the callback is refused (503);
- the adapter is disabled (503) while ``PAYMENTS_STRIPE_SECRET_KEY`` is unset.

Webhook signatures are verified here (HMAC-SHA256 over ``t.payload``, a tolerance
window, constant-time compare). Card data never reaches Barrels: the payer enters
it on Stripe's hosted Checkout page. Nothing personal is sent to Stripe.
"""

import hashlib
import hmac
import json
import logging
import time
import uuid
from collections.abc import Callable, Mapping
from typing import Any

import httpx

from src.payments import return_urls
from src.payments.config import PaymentsConfig, payments_settings
from src.payments.exceptions import (
    InvalidCallbackError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from src.payments.models import Intent, IntentStatus, ProviderKey

from .base import (
    EventKind,
    PaymentStart,
    ProviderEvent,
    ProviderRefund,
    ProviderStatus,
    RefundResult,
)

logger = logging.getLogger(__name__)

TEST_KEY_PREFIX = "sk_test_"
WHSEC_PREFIX = "whsec_"  # prefix of a Stripe webhook signing key

# Test seam: an httpx transport (e.g. MockTransport) used instead of the network.
_transport: httpx.AsyncBaseTransport | None = None
#: Longest checkout line-item name we send.
_TITLE_MAX = 120
# Test seam: the clock used for the webhook tolerance window.
_now: Callable[[], float] = time.time


def require_test_key(secret_key: str | None) -> str:
    """Return the key if it is a Stripe TEST secret key, else refuse with 503."""
    if not secret_key:
        raise ProviderUnavailableError("Stripe is not configured")
    if not secret_key.startswith(TEST_KEY_PREFIX):
        logger.error("Refusing a non-test Stripe key: live payments are disabled")
        raise ProviderUnavailableError("Only Stripe test mode is permitted")
    return secret_key


def sign_payload(secret: str, timestamp: int, body: bytes) -> str:
    """The ``v1`` signature Stripe computes: HMAC-SHA256 of ``t.payload``."""
    signed = f"{timestamp}.".encode() + body
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def _header(headers: Mapping[str, str], name: str) -> str | None:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def verify_signature(
    header: str | None,
    body: bytes,
    secret: str,
    *,
    tolerance_seconds: int,
    now: float,
) -> None:
    """Raise ``InvalidCallbackError`` unless ``header`` is a fresh, valid signature."""
    if not header:
        raise InvalidCallbackError()
    timestamp: int | None = None
    candidates: list[str] = []
    for part in header.split(","):
        name, _, value = part.strip().partition("=")
        if name == "t":
            try:
                timestamp = int(value)
            except ValueError:
                raise InvalidCallbackError() from None
        elif name == "v1":
            candidates.append(value)
    if timestamp is None or not candidates:
        raise InvalidCallbackError()
    if abs(now - timestamp) > tolerance_seconds:
        raise InvalidCallbackError()
    expected = sign_payload(secret, timestamp, body)
    if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
        raise InvalidCallbackError()


def _intent_uuid(value: object) -> uuid.UUID | None:
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _currency(value: object) -> str | None:
    return value.upper() if isinstance(value, str) and len(value) == 3 else None


def _listed_refunds(listing: object) -> tuple[tuple[ProviderRefund, ...], bool]:
    """The refunds on a charge, and whether the list is complete (Stripe sets
    ``has_more`` when the event carries only some of them)."""
    if not isinstance(listing, dict):
        return (), True
    items = listing.get("data")
    refunds: list[ProviderRefund] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        amount = _int(item.get("amount"))
        status = _str(item.get("status"))
        if amount is None or status is None:
            continue
        metadata = item.get("metadata")
        metadata = metadata if isinstance(metadata, dict) else {}
        refunds.append(
            ProviderRefund(
                provider_ref=_str(item.get("id")),
                amount_minor=amount,
                status=status,
                refund_id=_intent_uuid(metadata.get("refund_id")),
            )
        )
    return tuple(refunds), listing.get("has_more") is not True


def normalise_event(event: dict[str, Any]) -> ProviderEvent:
    """Map a verified Stripe event to the core's vocabulary."""
    event_id = _str(event.get("id"))
    event_type = _str(event.get("type"))
    data = event.get("data")
    obj = data.get("object") if isinstance(data, dict) else None
    if event_id is None or event_type is None or not isinstance(obj, dict):
        raise InvalidCallbackError()
    metadata = obj.get("metadata")
    metadata = metadata if isinstance(metadata, dict) else {}
    key = ProviderKey.STRIPE.value

    if event_type == "checkout.session.completed":
        if obj.get("payment_status") != "paid":
            return ProviderEvent(
                provider=key, event_id=event_id, kind=EventKind.IGNORED
            )
        return ProviderEvent(
            provider=key,
            event_id=event_id,
            kind=EventKind.PAYMENT_SUCCEEDED,
            intent_id=_intent_uuid(
                metadata.get("intent_id") or obj.get("client_reference_id")
            ),
            provider_ref=_str(obj.get("id")),
            payment_ref=_str(obj.get("payment_intent")),
            amount_minor=_int(obj.get("amount_total")),
            currency=_currency(obj.get("currency")),
        )
    if event_type == "payment_intent.payment_failed":
        error = obj.get("last_payment_error")
        code = _str(error.get("code")) if isinstance(error, dict) else None
        return ProviderEvent(
            provider=key,
            event_id=event_id,
            kind=EventKind.PAYMENT_FAILED,
            intent_id=_intent_uuid(metadata.get("intent_id")),
            payment_ref=_str(obj.get("id")),
            failure_code=code,
        )
    if event_type == "charge.refunded":
        refunds, complete = _listed_refunds(obj.get("refunds"))
        return ProviderEvent(
            provider=key,
            event_id=event_id,
            kind=EventKind.REFUNDED,
            intent_id=_intent_uuid(metadata.get("intent_id")),
            payment_ref=_str(obj.get("payment_intent")),
            amount_minor=_int(obj.get("amount")),
            currency=_currency(obj.get("currency")),
            refunded_total_minor=_int(obj.get("amount_refunded")),
            refunds=refunds,
            refunds_complete=complete,
        )
    return ProviderEvent(provider=key, event_id=event_id, kind=EventKind.IGNORED)


class StripeProvider:
    key = ProviderKey.STRIPE.value

    def __init__(self, config: PaymentsConfig | None = None) -> None:
        self._config = config or payments_settings
        # Refuses a missing or non-test key before anything can be sent.
        self._secret_key = require_test_key(self._config.STRIPE_SECRET_KEY)

    # --- HTTP ------------------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._secret_key}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            async with httpx.AsyncClient(
                base_url=self._config.STRIPE_API_BASE,
                timeout=self._config.REQUEST_TIMEOUT_SECONDS,
                transport=_transport,
            ) as client:
                response = await client.request(
                    method, path, data=data, headers=headers
                )
        except httpx.HTTPError:
            logger.warning("Stripe request failed", extra={"path": path})
            raise ProviderRequestError() from None
        if response.status_code >= 400:
            logger.warning(
                "Stripe rejected a request",
                extra={"path": path, "status_code": response.status_code},
            )
            raise ProviderRequestError()
        try:
            body = response.json()
        except ValueError:
            raise ProviderRequestError() from None
        if not isinstance(body, dict):
            raise ProviderRequestError()
        return body

    # --- PaymentProvider -------------------------------------------------------

    async def create_payment(
        self, intent: Intent, /, *, title: str | None = None
    ) -> PaymentStart:
        address = return_urls.resolve(
            intent.source_type, intent.source_id, self._config
        )
        if address is None:
            raise ProviderUnavailableError("Stripe return URLs are not configured")
        intent_id = str(intent.id)
        data = {
            "mode": "payment",
            "client_reference_id": intent_id,
            "success_url": address.success_url,
            "cancel_url": address.cancel_url,
            "metadata[intent_id]": intent_id,
            "payment_intent_data[metadata][intent_id]": intent_id,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": intent.currency.lower(),
            "line_items[0][price_data][unit_amount]": str(intent.amount_minor),
            "line_items[0][price_data][product_data][name]": (title or "").strip()[
                :_TITLE_MAX
            ]
            or intent.source_type,
        }
        body = await self._request(
            "POST",
            "/v1/checkout/sessions",
            data=data,
            idempotency_key=f"intent-{intent_id}",
        )
        session_id = _str(body.get("id"))
        url = _str(body.get("url"))
        if session_id is None or url is None:
            raise ProviderRequestError()
        return PaymentStart(provider_ref=session_id, checkout_url=url)

    def verify_callback(self, headers: Mapping[str, str], body: bytes) -> ProviderEvent:
        secret = self._config.STRIPE_WEBHOOK_SECRET
        if not secret or not secret.startswith(WHSEC_PREFIX):
            logger.error("Stripe webhook secret is missing or malformed")
            raise ProviderUnavailableError("Stripe webhooks are not configured")
        verify_signature(
            _header(headers, "stripe-signature"),
            body,
            secret,
            tolerance_seconds=self._config.WEBHOOK_TOLERANCE_SECONDS,
            now=_now(),
        )
        try:
            event = json.loads(body)
        except ValueError:
            raise InvalidCallbackError() from None
        if not isinstance(event, dict):
            raise InvalidCallbackError()
        return normalise_event(event)

    async def refund(
        self, intent: Intent, amount_minor: int, refund_id: uuid.UUID
    ) -> RefundResult:
        if not intent.provider_payment_ref:
            raise ProviderRequestError("The payment has not been captured")
        body = await self._request(
            "POST",
            "/v1/refunds",
            data={
                "payment_intent": intent.provider_payment_ref,
                "amount": str(amount_minor),
                "metadata[refund_id]": str(refund_id),
                "metadata[intent_id]": str(intent.id),
            },
            idempotency_key=f"refund-{refund_id}",
        )
        status = _str(body.get("status"))
        if status in {"failed", "canceled"}:
            raise ProviderRequestError("The provider could not refund this payment")
        return RefundResult(
            provider_ref=_str(body.get("id")),
            status="succeeded" if status == "succeeded" else "pending",
        )

    async def fetch_status(self, intent: Intent) -> ProviderStatus:
        if not intent.provider_ref:
            return ProviderStatus(status=intent.status)
        body = await self._request(
            "GET", f"/v1/checkout/sessions/{intent.provider_ref}"
        )
        if body.get("payment_status") == "paid":
            return ProviderStatus(status=IntentStatus.SUCCEEDED.value)
        if body.get("status") == "expired":
            return ProviderStatus(status=IntentStatus.CANCELLED.value)
        return ProviderStatus(status=IntentStatus.REQUIRES_PAYMENT.value)
