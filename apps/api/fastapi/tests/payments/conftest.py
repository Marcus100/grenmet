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

WEBHOOK_SECRET = "whsec_unit_test_secret"  # noqa: S105


@dataclass
class StripeStub:
    requests: list[httpx.Request] = field(default_factory=list)
    paid: bool = False
    fail_refund: bool = False

    def form(self, index: int = -1) -> dict[str, str]:
        parsed = parse_qs(self.requests[index].content.decode())
        return {key: values[0] for key, values in parsed.items()}


@pytest.fixture
def stripe_env(monkeypatch: pytest.MonkeyPatch) -> StripeStub:
    stub = StripeStub()

    def handler(request: httpx.Request) -> httpx.Response:
        stub.requests.append(request)
        if request.method == "POST" and request.url.path == "/v1/checkout/sessions":
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
            return httpx.Response(200, json={"id": "re_test_1", "status": "succeeded"})
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
    monkeypatch.setattr(payments_settings, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
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
    secret: str = WEBHOOK_SECRET,
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
