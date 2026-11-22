"""WiPay test support (ADR-0027 amendment, 21 Nov 2026).

A hosted-checkout stub over ``httpx.MockTransport`` (no live call is ever made), signed
webhook helpers, and return-URL hashes computed here from the documented formula
``md5(transaction_id + total(2 dp) + api_key)``, independently of the code under test.
"""

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet

from src.organisations.config import organisations_settings
from src.payments.config import payments_settings
from src.payments.providers import wipay as wipay_module

#: Test credentials. Not WiPay's public sandbox key (123): these stand for a merchant's.
WIPAY_API_KEY = "wipay-test-api-key-01"
WIPAY_WEBHOOK_SECRET = "wipay-test-webhook-secret-01"
WIPAY_ACCOUNT_NUMBER = "1234567890"
WIPAY_RESPONSE_URL = "https://api.example.test/api/v1/payments/public/returns/wipay"
WIPAY_SANDBOX_HOST = "gdsb.wipayfinancial.com"


@dataclass
class WiPayStub:
    requests: list[httpx.Request] = field(default_factory=list)
    #: Make the next requests fail the way WiPay rejects a bad request (HTTP 400).
    fail: bool = False
    checkouts: int = 0

    def body(self, index: int = -1) -> dict[str, Any]:
        return json.loads(self.requests[index].content)


@pytest.fixture
def org_secret_keys(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Organisation secret keys set, so merchant credentials can be stored."""
    keys = [Fernet.generate_key().decode()]
    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", keys)
    return keys


@pytest.fixture
def wipay_env(
    monkeypatch: pytest.MonkeyPatch,
    org_secret_keys: list[str],  # noqa: ARG001  (set up for its side effect)
) -> WiPayStub:
    stub = WiPayStub()

    def handler(request: httpx.Request) -> httpx.Response:
        stub.requests.append(request)
        if request.method == "POST" and request.url.path == "/plugins/payments/request":
            if stub.fail:
                return httpx.Response(
                    400,
                    json={
                        "url": "https://example.test/callback?status=error",
                        "message": "The country code field is required.",
                        "transaction_id": "",
                    },
                )
            body = json.loads(request.content)
            stub.checkouts += 1
            transaction_id = f"SB-12-{stub.checkouts}-{body['order_id']}-20261121120000"
            return httpx.Response(
                200,
                json={
                    "url": f"https://{WIPAY_SANDBOX_HOST}/checkout/payment?t={transaction_id}",
                    "message": "OK",
                    "transaction_id": transaction_id,
                },
            )
        return httpx.Response(404, json={})

    monkeypatch.setattr(wipay_module, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(payments_settings, "WIPAY_RESPONSE_URL", WIPAY_RESPONSE_URL)
    monkeypatch.setattr(
        payments_settings, "STRIPE_SUCCESS_URL", "https://example.test/paid"
    )
    monkeypatch.setattr(
        payments_settings, "STRIPE_CANCEL_URL", "https://example.test/cancelled"
    )
    return stub


def total_text(amount_minor: int) -> str:
    """The amount as WiPay writes it: major units with exactly two decimal places."""
    return f"{amount_minor // 100}.{amount_minor % 100:02d}"


def expected_hash(
    transaction_id: str, amount_minor: int, api_key: str = WIPAY_API_KEY
) -> str:
    text = f"{transaction_id}{total_text(amount_minor)}{api_key}"
    return hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()


def return_query(
    *,
    order_id: str,
    transaction_id: str,
    amount_minor: int,
    status: str = "success",
    currency: str = "XCD",
    api_key: str = WIPAY_API_KEY,
) -> dict[str, str]:
    """The query string WiPay appends when it sends the customer back."""
    params = {
        "status": status,
        "transaction_id": transaction_id,
        "order_id": order_id,
        "total": total_text(amount_minor),
        "currency": currency,
        "message": "[1-R00]: Approved or completed successfully.",
        "data": "",
    }
    if status == "success":
        params["hash"] = expected_hash(transaction_id, amount_minor, api_key)
    return params


def payment_webhook(
    event: str,
    *,
    order_id: str,
    transaction_id: str,
    amount_minor: int,
    with_hash: bool = True,
    api_key: str = WIPAY_API_KEY,
    envelope_id: str | None = None,
) -> dict[str, Any]:
    """A Payments API webhook envelope (WiPay's documented shape, trimmed)."""
    data: dict[str, Any] = {
        "currency": "XCD",
        "currency_credited": "XCD",
        "data": None,
        "date": "2026-11-21T12:00:00+00:00",
        "fee_structure": "Merchant Absorb",
        "hash": expected_hash(transaction_id, amount_minor, api_key)
        if with_hash
        else None,
        "message": "Approved or completed successfully",
        "order_id": order_id,
        "origin": "barrels",
        "status": "success" if event == "payment.success" else "failed",
        "status_desc": "Normal",
        "total": total_text(amount_minor),
        "total_credited": total_text(amount_minor),
        "transaction_id": transaction_id,
    }
    return {
        "id": envelope_id or str(uuid.uuid4()),
        "api_family": "payments_api",
        "event": event,
        "occurred_at": "2026-11-21T12:00:00+00:00",
        "data": data,
        "meta": {"transaction_id": transaction_id},
    }


def signed_webhook(
    envelope: dict[str, Any],
    *,
    secret: str = WIPAY_WEBHOOK_SECRET,
    timestamp: int | None = None,
) -> tuple[bytes, dict[str, str]]:
    """The raw body and the headers WiPay sends: ``sha256=`` HMAC of ``timestamp.body``."""
    body = json.dumps(envelope, separators=(",", ":")).encode()
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    digest = hmac.new(
        secret.encode(), f"{stamp}.".encode() + body, hashlib.sha256
    ).hexdigest()
    return body, {
        "Content-Type": "application/json",
        "X-WiPay-Webhook-Event": str(envelope.get("event")),
        "X-WiPay-Webhook-Id": str(envelope.get("id")),
        "X-WiPay-Webhook-Signature": f"sha256={digest}",
        "X-WiPay-Webhook-Timestamp": stamp,
        "X-WiPay-Webhook-Version": "v1",
    }
