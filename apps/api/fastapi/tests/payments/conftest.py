"""Fixtures for the payments tests: a Stripe test-mode stub over httpx.MockTransport."""

import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.feature_flags import service as flag_service
from src.feature_flags.models import FeatureFlag
from src.payments.config import payments_settings
from src.payments.providers import stripe as stripe_module

WEBHOOK_SIGNING_KEY = "whsec_unit_test_secret"


async def set_flag(
    db: AsyncSession,
    key: str,
    *,
    enabled: bool,
    organisation_ids: list[str] | None = None,
) -> None:
    """Create or update a runtime flag row, as the owner does in admin. Tests use the
    audience ``everyone`` unless organisations are named. Clears the 30 s snapshot so
    the change is seen at once (the snapshot is process-wide)."""
    audience: dict[str, object] = (
        {"organisation_ids": organisation_ids}
        if organisation_ids is not None
        else {"everyone": True}
    )
    row = (
        await db.scalars(select(FeatureFlag).where(FeatureFlag.key == key))
    ).one_or_none()
    if row is None:
        db.add(FeatureFlag(key=key, enabled=enabled, audience=audience))
    else:
        row.enabled = enabled
        row.audience = audience
    await db.commit()
    flag_service.clear_cache()


@dataclass
class StripeStub:
    requests: list[httpx.Request] = field(default_factory=list)
    paid: bool = False
    fail_refund: bool = False
    fail_checkout: bool = False
    #: When True a checkout whose ``expires_at`` is under 30 minutes away is refused
    #: with 400, as Stripe does.
    enforce_checkout_expiry: bool = False
    #: Status Stripe reports for the refunds it creates (``pending`` settles later).
    refund_status: str = "succeeded"
    checkout_id: str = "cs_test_1"
    #: Refunds Stripe actually created, by Idempotency-Key. A repeated key gets the
    #: stored answer back, as Stripe replays it, and creates no second refund.
    refunds_by_key: dict[str, dict[str, Any]] = field(default_factory=dict)
    #: The request parameters each key was first used with. Stripe answers 400
    #: ``idempotency_error`` when a key comes back with different parameters.
    key_params: dict[str, dict[str, str]] = field(default_factory=dict)
    #: Every refund Stripe holds, by id (listed by ``GET /v1/refunds``). Unlike the
    #: idempotency memory this is never forgotten.
    refunds: dict[str, dict[str, Any]] = field(default_factory=dict)
    #: When True the refund listing says it has more pages but gives no cursor.
    list_incomplete: bool = False
    #: When True the refund listing also carries a refund of this payment with no
    #: amount (one the core cannot read).
    unreadable_listed: bool = False

    @property
    def refunds_created(self) -> int:
        return len(self.refunds)

    def forget_keys(self) -> None:
        """Stripe forgets idempotency keys after about 24 hours: the refunds stay, the
        memory of the request that made them does not."""
        self.refunds_by_key.clear()
        self.key_params.clear()

    def refund_keys(self) -> list[str | None]:
        return [
            request.headers.get("Idempotency-Key")
            for request in self.requests
            if request.method == "POST" and request.url.path == "/v1/refunds"
        ]

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
            if stub.enforce_checkout_expiry:
                params = parse_qs(request.content.decode())
                expires = params.get("expires_at")
                if expires and int(expires[0]) < datetime.now(UTC).timestamp() + 1800:
                    return httpx.Response(
                        400,
                        json={"error": {"message": "expires_at too soon"}},
                    )
            return httpx.Response(
                200,
                json={
                    "id": stub.checkout_id,
                    "url": f"https://checkout.stripe.com/c/pay/{stub.checkout_id}",
                },
            )
        if request.method == "POST" and request.url.path == "/v1/refunds":
            if stub.fail_refund:
                return httpx.Response(402, json={"error": {"message": "nope"}})
            key = request.headers.get("Idempotency-Key")
            params = {
                name: values[0]
                for name, values in parse_qs(request.content.decode()).items()
            }
            if key is not None and key in stub.key_params:
                if stub.key_params[key] != params:
                    return httpx.Response(
                        400,
                        json={
                            "error": {
                                "type": "idempotency_error",
                                "message": "Keys for idempotent requests can only be "
                                "used with the same parameters they were first used with.",
                            }
                        },
                    )
                # Stripe replays the stored answer for a key it has seen.
                return httpx.Response(200, json=stub.refunds_by_key[key])
            intent_ref = params.get("payment_intent", "pi_test_1")
            refund = {
                "id": f"re_test_{stub.refunds_created + 1}",
                "object": "refund",
                "amount": int(params["amount"]),
                "currency": "xcd",
                "status": stub.refund_status,
                "payment_intent": intent_ref,
                "charge": "ch_test_1",
                "metadata": {
                    name.removeprefix("metadata[").removesuffix("]"): value
                    for name, value in params.items()
                    if name.startswith("metadata[")
                },
            }
            stub.refunds[refund["id"]] = refund
            if key is not None:
                stub.refunds_by_key[key] = refund
                stub.key_params[key] = params
            return httpx.Response(200, json=refund)
        if request.method == "GET" and request.url.path == "/v1/refunds":
            if stub.list_incomplete:
                return httpx.Response(
                    200, json={"object": "list", "has_more": True, "data": []}
                )
            wanted = request.url.params.get("payment_intent")
            listed = [
                refund
                for refund in reversed(list(stub.refunds.values()))
                if wanted is None or refund["payment_intent"] == wanted
            ]
            if stub.unreadable_listed:
                listed.append(
                    {
                        "id": "re_unreadable",
                        "object": "refund",
                        "currency": "xcd",
                        "status": "succeeded",
                        "payment_intent": wanted or "pi_test_1",
                        "metadata": {},
                    }
                )
            return httpx.Response(
                200, json={"object": "list", "has_more": False, "data": listed}
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


def refund_object(
    provider_ref: str,
    amount: int,
    *,
    status: str = "succeeded",
    refund_id: object | None = None,
    intent_id: object | None = None,
    payment_intent: str = "pi_test_1",
) -> dict[str, Any]:
    """A Stripe Refund object as ``refund.created|updated|failed`` carries it."""
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
        "charge": "ch_test_1",
        "payment_intent": payment_intent,
        "status": status,
        "metadata": metadata,
    }


def refund_event(
    event_id: str, event_type: str, refund: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "data": {"object": refund},
    }
