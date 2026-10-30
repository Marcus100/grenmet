"""Fixtures for the payments tests: a Stripe test-mode stub over httpx.MockTransport."""

import json
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest

from src.payments.config import payments_settings
from src.payments.providers import stripe as stripe_module

WEBHOOK_SIGNING_KEY = "whsec_unit_test_secret"


@dataclass
class StripeStub:
    requests: list[httpx.Request] = field(default_factory=list)
    paid: bool = False
    fail_refund: bool = False
    fail_checkout: bool = False
    #: Status Stripe reports for the refunds it creates (``pending`` settles later).
    refund_status: str = "succeeded"

    def form(self, index: int = -1) -> dict[str, str]:
        parsed = parse_qs(self.requests[index].content.decode())
        return {key: values[0] for key, values in parsed.items()}


@pytest.fixture
def stripe_env(monkeypatch: pytest.MonkeyPatch) -> StripeStub:
    stub = StripeStub()

    def handler(request: httpx.Request) -> httpx.Response:
        stub.requests.append(request)
        if request.method == "POST" and request.url.path == "/v1/checkout/sessions":
            if stub.fail_checkout:
                return httpx.Response(500, json={"error": {"message": "down"}})
            return httpx.Response(
                200,
                json={
                    "id": "cs_test_1",
                    "url": "https://checkout.stripe.com/c/pay/cs_test_1",
                },
            )
        if request.method == "POST" and request.url.path == "/v1/refunds":
            if stub.fail_refund:
                return httpx.Response(402, json={"error": {"message": "nope"}})
            return httpx.Response(
                200, json={"id": "re_test_1", "status": stub.refund_status}
            )
        if request.method == "GET" and request.url.path.startswith(
            "/v1/checkout/sessions/"
        ):
            return httpx.Response(
                200,
                json={
                    "payment_status": "paid" if stub.paid else "unpaid",
                    "status": "complete" if stub.paid else "open",
                },
            )
        return httpx.Response(404, json={})

    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", "sk_test_unit")
    monkeypatch.setattr(payments_settings, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SIGNING_KEY)
    monkeypatch.setattr(
        payments_settings, "STRIPE_SUCCESS_URL", "https://example.test/paid"
    )
    monkeypatch.setattr(
        payments_settings, "STRIPE_CANCEL_URL", "https://example.test/cancelled"
    )
    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(handler))
    return stub


def signed(
    event: dict[str, Any],
    *,
    secret: str = WEBHOOK_SIGNING_KEY,
    timestamp: int | None = None,
) -> tuple[bytes, dict[str, str]]:
    """A Stripe-style signed body and its headers."""
    body = json.dumps(event).encode()
    stamp = int(time.time()) if timestamp is None else timestamp
    signature = stripe_module.sign_payload(secret, stamp, body)
    return body, {
        "Stripe-Signature": f"t={stamp},v1={signature}",
        "Content-Type": "application/json",
    }


def checkout_completed(
    intent_id: object,
    *,
    event_id: str = "evt_paid_1",
    amount: int = 5000,
    currency: str = "xcd",
    payment_intent: str = "pi_test_1",
) -> dict[str, Any]:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "payment_status": "paid",
                "payment_intent": payment_intent,
                "amount_total": amount,
                "currency": currency,
                "client_reference_id": str(intent_id),
                "metadata": {"intent_id": str(intent_id)},
            }
        },
    }


def provider_refund(
    provider_ref: str,
    amount: int,
    *,
    refund_id: object | None = None,
    intent_id: object | None = None,
    status: str = "succeeded",
) -> dict[str, Any]:
    """A Stripe Refund object as it appears in a charge's ``refunds`` list. Refunds
    the payments core made carry our ids in ``metadata``; dashboard refunds do not."""
    metadata: dict[str, str] = {}
    if refund_id is not None:
        metadata["refund_id"] = str(refund_id)
    if intent_id is not None:
        metadata["intent_id"] = str(intent_id)
    return {
        "id": provider_ref,
        "object": "refund",
        "amount": amount,
        "currency": "xcd",
        "status": status,
        "metadata": metadata,
    }


def charge_refunded(
    event_id: str,
    *,
    amount_refunded: int,
    refunds: list[dict[str, Any]] | None = None,
    has_more: bool = False,
    payment_intent: str = "pi_test_1",
    amount: int = 5000,
) -> dict[str, Any]:
    """A ``charge.refunded`` event. ``refunds`` is the charge's refund list (omit it
    for a payload without one, as older callers sent)."""
    charge: dict[str, Any] = {
        "id": "ch_test_1",
        "object": "charge",
        "payment_intent": payment_intent,
        "amount": amount,
        "currency": "xcd",
        "amount_refunded": amount_refunded,
    }
    if refunds is not None:
        charge["refunds"] = {"object": "list", "has_more": has_more, "data": refunds}
    return {"id": event_id, "type": "charge.refunded", "data": {"object": charge}}
