# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""WiPay adapter (ADR-0027 amendment, 21 Nov 2026): hash, signatures, request, return.

Pure cases need no database. The flow cases run the real routes against the test
database with WiPay's hosted checkout stubbed over httpx.MockTransport.
"""

import uuid
from datetime import UTC, datetime

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments.config import PaymentsConfig, payments_settings
from src.payments.exceptions import (
    InvalidCallbackError,
    ManualRefundRequiredError,
    PaymentsConflictError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from src.payments.models import Intent, IntentStatus, LedgerEntry, LedgerKind
from src.payments.providers import wipay
from src.payments.providers.base import EventKind
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.payments import wipay_support
from tests.payments.wipay_support import (
    WIPAY_ACCOUNT_NUMBER,
    WIPAY_API_KEY,
    WIPAY_RESPONSE_URL,
    WIPAY_WEBHOOK_SECRET,
    expected_hash,
    payment_webhook,
    return_query,
    signed_webhook,
    total_text,
)

# The fixtures live in wipay_support; bound here by name (as test_deposits does).
org_secret_keys = wipay_support.org_secret_keys
wipay_env = wipay_support.wipay_env

API = "/api/v1/payments"
NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC).timestamp()


def _intent(**overrides: object) -> Intent:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organisation_id": "org_salon",
        "amount_minor": 5000,
        "currency": "XCD",
        "status": "requires_payment",
        "provider": "wipay",
        "provider_environment": "sandbox",
        "source_type": "shop.sale",
        "provider_ref": "SB-12-1-order-20261121120000",
    }
    values.update(overrides)
    return Intent(**values)


def _provider(**overrides: object) -> wipay.WiPayProvider:
    values: dict[str, object] = {
        "environment": "sandbox",
        "account_number": WIPAY_ACCOUNT_NUMBER,
        "api_key": WIPAY_API_KEY,
        "webhook_secret": WIPAY_WEBHOOK_SECRET,
        "config": PaymentsConfig(WIPAY_RESPONSE_URL=WIPAY_RESPONSE_URL),
    }
    values.update(overrides)
    return wipay.WiPayProvider(**values)  # type: ignore[arg-type]


# --- amounts and the hash -----------------------------------------------------------


@pytest.mark.parametrize(
    ("minor", "text"),
    [(5000, "50.00"), (5, "0.05"), (12345, "123.45"), (7, "0.07"), (100000, "1000.00")],
)
def test_amounts_are_written_with_two_decimal_places(minor: int, text: str) -> None:
    assert wipay.total_text(minor) == text
    assert total_text(minor) == text


def test_the_hash_is_md5_of_transaction_total_and_key() -> None:
    # Reference value from the documented formula, computed independently.
    import hashlib

    reference = hashlib.md5(
        b"SB-12-1-abc-20261121120000" + b"50.00" + b"k", usedforsecurity=False
    ).hexdigest()
    assert wipay.response_hash("SB-12-1-abc-20261121120000", 5000, "k") == reference


def test_a_correct_hash_matches() -> None:
    received = expected_hash("SB-1", 5000)
    assert wipay.hash_matches(received, "SB-1", 5000, WIPAY_API_KEY)


@pytest.mark.parametrize(
    ("received", "transaction_id", "amount", "key"),
    [
        (None, "SB-1", 5000, WIPAY_API_KEY),  # no hash at all
        ("", "SB-1", 5000, WIPAY_API_KEY),  # empty hash
        (expected_hash("SB-1", 5000), "SB-2", 5000, WIPAY_API_KEY),  # tampered id
        (expected_hash("SB-1", 5000), "SB-1", 5001, WIPAY_API_KEY),  # tampered amount
        (expected_hash("SB-1", 5000), "SB-1", 5000, "another-key"),  # wrong key
        ("0" * 32, "SB-1", 5000, WIPAY_API_KEY),  # forged
    ],
)
def test_a_tampered_or_missing_hash_never_matches(
    received: str | None, transaction_id: str, amount: int, key: str
) -> None:
    assert not wipay.hash_matches(received, transaction_id, amount, key)


# --- the redirect back to us ---------------------------------------------------------


def _params(intent: Intent, **overrides: object) -> dict[str, str]:
    values: dict[str, str] = return_query(
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=intent.amount_minor,
    )
    values.update({k: str(v) for k, v in overrides.items()})
    return values


def test_a_verified_success_return_credits_our_amount() -> None:
    intent = _intent()
    event = wipay.return_event(intent, _params(intent), api_key=WIPAY_API_KEY)
    assert event.kind is EventKind.PAYMENT_SUCCEEDED
    assert event.event_id == intent.provider_ref
    assert event.amount_minor == 5000
    assert event.currency == "XCD"
    assert event.intent_id == intent.id


def test_a_tampered_total_in_the_query_does_not_change_what_is_credited() -> None:
    # The hash covers our own amount, so a changed query total cannot inflate it.
    intent = _intent()
    event = wipay.return_event(
        intent, _params(intent, total="1.00"), api_key=WIPAY_API_KEY
    )
    assert event.amount_minor == 5000


def test_a_replayed_return_carries_the_same_idempotency_key() -> None:
    intent = _intent()
    first = wipay.return_event(intent, _params(intent), api_key=WIPAY_API_KEY)
    again = wipay.return_event(intent, _params(intent), api_key=WIPAY_API_KEY)
    assert first.event_id == again.event_id == intent.provider_ref


def test_a_failed_return_changes_nothing() -> None:
    intent = _intent()
    params = return_query(
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
        status="failed",
    )
    event = wipay.return_event(intent, params, api_key=WIPAY_API_KEY)
    assert event.kind is EventKind.IGNORED


@pytest.mark.parametrize(
    "overrides",
    [
        {"hash": "f" * 32},  # forged hash
        {"hash": None},  # the hash removed
        {"transaction_id": "SB-99-1-x-20261121120000"},  # another transaction
        {"order_id": uuid.uuid4().hex},  # another order
        {"currency": "USD"},  # another currency
    ],
)
def test_a_return_that_does_not_verify_is_refused(overrides: dict) -> None:
    intent = _intent()
    params = _params(intent)
    for key, value in overrides.items():
        if value is None:
            params.pop(key, None)
        else:
            params[key] = value
    with pytest.raises(InvalidCallbackError):
        wipay.return_event(intent, params, api_key=WIPAY_API_KEY)


def test_a_return_for_an_intent_with_no_recorded_transaction_is_refused() -> None:
    intent = _intent(provider_ref=None)
    with pytest.raises(InvalidCallbackError):
        wipay.return_event(intent, _params(intent), api_key=WIPAY_API_KEY)


# --- webhook signatures --------------------------------------------------------------


def test_a_fresh_correctly_signed_webhook_passes() -> None:
    body, headers = signed_webhook({"id": "e1", "event": "x"}, timestamp=int(NOW))
    wipay.verify_webhook_signature(
        headers, body, WIPAY_WEBHOOK_SECRET, tolerance_seconds=300, now=NOW
    )


@pytest.mark.parametrize(
    "case",
    [
        "tampered_body",
        "wrong_secret",
        "stale",
        "future",
        "no_header",
        "no_prefix",
        "bad_stamp",
    ],
)
def test_an_unsigned_or_stale_webhook_is_refused(case: str) -> None:
    body, headers = signed_webhook({"id": "e1", "event": "x"}, timestamp=int(NOW))
    secret = WIPAY_WEBHOOK_SECRET
    now = NOW
    if case == "tampered_body":
        body = body.replace(b"e1", b"e2")
    elif case == "wrong_secret":
        secret = "not-the-secret"
    elif case == "stale":
        now = NOW + 301
    elif case == "future":
        now = NOW - 301
    elif case == "no_header":
        headers.pop("X-WiPay-Webhook-Signature")
    elif case == "no_prefix":
        headers["X-WiPay-Webhook-Signature"] = headers[
            "X-WiPay-Webhook-Signature"
        ].removeprefix("sha256=")
    elif case == "bad_stamp":
        headers["X-WiPay-Webhook-Timestamp"] = "2026-11-21"
    with pytest.raises(InvalidCallbackError):
        wipay.verify_webhook_signature(
            headers, body, secret, tolerance_seconds=300, now=now
        )


def test_a_signature_for_a_shorter_digest_is_refused() -> None:
    body, headers = signed_webhook({"id": "e1"}, timestamp=int(NOW))
    headers["X-WiPay-Webhook-Signature"] = "sha256=abcd"
    with pytest.raises(InvalidCallbackError):
        wipay.verify_webhook_signature(
            headers, body, WIPAY_WEBHOOK_SECRET, tolerance_seconds=300, now=NOW
        )


# --- webhook events ------------------------------------------------------------------


def test_a_verified_success_webhook_credits_our_amount_under_the_transaction_key() -> (
    None
):
    intent = _intent()
    envelope = payment_webhook(
        "payment.success",
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
    )
    event = wipay.webhook_event(intent, envelope, api_key=WIPAY_API_KEY)
    assert event.kind is EventKind.PAYMENT_SUCCEEDED
    assert event.event_id == intent.provider_ref
    assert event.amount_minor == 5000


def test_a_success_webhook_without_a_verifiable_hash_is_not_credited() -> None:
    intent = _intent()
    envelope = payment_webhook(
        "payment.success",
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
        with_hash=False,
    )
    assert (
        wipay.webhook_event(intent, envelope, api_key=WIPAY_API_KEY).kind
        is EventKind.IGNORED
    )


def test_a_success_webhook_with_a_forged_hash_is_not_credited() -> None:
    intent = _intent()
    envelope = payment_webhook(
        "payment.success",
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
        api_key="someone-else",
    )
    assert (
        wipay.webhook_event(intent, envelope, api_key=WIPAY_API_KEY).kind
        is EventKind.IGNORED
    )


@pytest.mark.parametrize("event", ["payment.failed", "payment.error"])
def test_failed_and_errored_payments_mark_the_attempt_failed(event: str) -> None:
    intent = _intent()
    envelope = payment_webhook(
        event,
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
        with_hash=False,
    )
    kind = wipay.webhook_event(intent, envelope, api_key=WIPAY_API_KEY).kind
    assert kind is EventKind.PAYMENT_FAILED


@pytest.mark.parametrize(
    "event",
    [
        "payment.created",
        "payment.refunded",
        "payment.refund_requested",
        "payment.chargeback_pending",
        "webhook.test",
    ],
)
def test_other_lifecycle_events_are_acknowledged_and_ignored(event: str) -> None:
    intent = _intent()
    envelope = payment_webhook(
        event,
        order_id=intent.id.hex,
        transaction_id=intent.provider_ref or "",
        amount_minor=5000,
    )
    assert (
        wipay.webhook_event(intent, envelope, api_key=WIPAY_API_KEY).kind
        is EventKind.IGNORED
    )


# --- environments and the request ----------------------------------------------------


def test_each_environment_has_its_grenada_host() -> None:
    assert wipay.base_url("sandbox") == "https://gdsb.wipayfinancial.com"
    assert wipay.base_url("live") == "https://gd.wipayfinancial.com"


async def test_create_payment_sends_the_documented_fields(wipay_env) -> None:
    intent = _intent(provider_ref=None, amount_minor=5000)
    start = await _provider().create_payment(intent, title="Deposit: Cut, Salon")

    assert start.provider_ref == f"SB-12-1-{intent.id.hex}-20261121120000"
    assert start.checkout_url is not None
    request = wipay_env.requests[-1]
    assert request.url.host == "gdsb.wipayfinancial.com"
    assert request.url.path == "/plugins/payments/request"
    assert request.headers["accept"] == "application/json"
    body = wipay_env.body()
    assert body == {
        "account_number": 1234567890,
        "country_code": "GD",
        "currency": "XCD",
        "environment": "sandbox",
        "fee_structure": "merchant_absorb",
        "method": "credit_card_co",
        "order_id": intent.id.hex,
        "origin": "BarrelsBookings",
        "response_url": WIPAY_RESPONSE_URL,
        "total": 50.0,
    }


async def test_the_live_environment_uses_the_live_host(wipay_env) -> None:
    intent = _intent(provider_ref=None)
    await _provider(environment="live").create_payment(intent)
    assert wipay_env.requests[-1].url.host == "gd.wipayfinancial.com"


async def test_a_rejected_request_is_a_502_not_a_checkout(wipay_env) -> None:
    wipay_env.fail = True
    with pytest.raises(ProviderRequestError):
        await _provider().create_payment(_intent(provider_ref=None))


async def test_a_missing_response_url_is_refused_before_any_request(wipay_env) -> None:
    provider = _provider(config=PaymentsConfig(WIPAY_RESPONSE_URL=None))
    with pytest.raises(ProviderUnavailableError):
        await provider.create_payment(_intent(provider_ref=None))
    assert wipay_env.requests == []


async def test_a_wipay_refund_is_refused_with_a_clear_conflict(wipay_env) -> None:
    with pytest.raises(ManualRefundRequiredError) as raised:
        await _provider().refund(_intent(), 1000, uuid.uuid4())
    assert isinstance(raised.value, PaymentsConflictError)
    assert raised.value.status_code == 409
    assert "WiPay dashboard" in raised.value.message
    assert wipay_env.requests == []


def test_the_synchronous_callback_path_is_not_used_for_wipay() -> None:
    with pytest.raises(InvalidCallbackError):
        _provider().verify_callback({}, b"{}")


def test_the_fee_structure_and_method_are_the_documented_values() -> None:
    assert payments_settings.WIPAY_FEE_STRUCTURE in {
        "customer_pay",
        "merchant_absorb",
        "split",
    }
    assert payments_settings.WIPAY_METHOD in {"credit_card_co", "3co_simple"}


# --- the flows through the routes -----------------------------------------------------


async def _org_with_wipay(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    environment: str = "sandbox",
    enabled: bool = True,
    webhook_secret: str | None = WIPAY_WEBHOOK_SECRET,
) -> tuple[object, object, dict[str, str]]:
    from src.organisations.models import MembershipRole

    admin = await make_user(db)
    org = await make_org(
        db,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("payments",),
    )
    headers = headers_for(admin, org.id)
    body: dict[str, object] = {
        "environment": environment,
        "enabled": enabled,
        "account_number": WIPAY_ACCOUNT_NUMBER,
        "api_key": WIPAY_API_KEY,
    }
    if webhook_secret is not None:
        body["webhook_secret"] = webhook_secret
    response = await client.put(
        f"{API}/org/merchant-accounts/wipay", headers=headers, json=body
    )
    assert response.status_code == 200, response.text
    return org, admin, headers


async def _checkout(
    client: httpx.AsyncClient, org: object, admin: object, headers: dict[str, str]
) -> tuple[str, str]:
    response = await client.post(
        f"{API}/org/intents",
        headers=headers,
        json={
            "amount_minor": 5000,
            "provider": "wipay",
            "source_type": "shop.sale",
            "source_id": "sale-1",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["intent"]["provider"] == "wipay"
    return body["intent"]["id"], body["checkout_url"]


async def _intent_row(db: AsyncSession, intent_id: str) -> Intent:
    row = await db.scalar(
        select(Intent)
        .where(Intent.id == uuid.UUID(intent_id))
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


async def _charges(db: AsyncSession, intent_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(LedgerEntry)
            .where(
                LedgerEntry.intent_id == uuid.UUID(intent_id),
                LedgerEntry.kind == LedgerKind.CHARGE.value,
            )
        )
        or 0
    )


async def test_a_wipay_checkout_returns_the_hosted_url_and_records_the_environment(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, url = await _checkout(async_client, org, admin, headers)
    assert url is not None
    assert url.startswith("https://gdsb.wipayfinancial.com/")
    row = await _intent_row(db_async, intent_id)
    assert row.provider_environment == "sandbox"
    assert row.provider_ref is not None
    assert row.checkout_url == url


async def test_the_return_credits_once_and_a_replay_is_a_no_op(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    params = return_query(
        order_id=row.id.hex, transaction_id=row.provider_ref or "", amount_minor=5000
    )

    first = await async_client.get(
        f"{API}/public/returns/wipay", params=params, follow_redirects=False
    )
    again = await async_client.get(
        f"{API}/public/returns/wipay", params=params, follow_redirects=False
    )
    assert first.status_code == again.status_code == 303
    assert first.headers["location"] == "https://example.test/paid"
    assert await _charges(db_async, intent_id) == 1
    assert (await _intent_row(db_async, intent_id)).status == "succeeded"


async def test_a_tampered_return_is_refused_and_credits_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    params = return_query(
        order_id=row.id.hex, transaction_id=row.provider_ref or "", amount_minor=5000
    )
    params["transaction_id"] = "SB-77-1-x-20261121120000"
    response = await async_client.get(
        f"{API}/public/returns/wipay", params=params, follow_redirects=False
    )
    assert response.status_code == 400
    assert await _charges(db_async, intent_id) == 0
    assert (await _intent_row(db_async, intent_id)).status == "processing"


async def test_a_cancelled_return_redirects_to_cancel_and_changes_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    params = return_query(
        order_id=row.id.hex,
        transaction_id=row.provider_ref or "",
        amount_minor=5000,
        status="failed",
    )
    response = await async_client.get(
        f"{API}/public/returns/wipay", params=params, follow_redirects=False
    )
    assert response.status_code == 303
    assert response.headers["location"] == "https://example.test/cancelled"
    assert (await _intent_row(db_async, intent_id)).status == "processing"


async def test_a_webhook_after_the_return_is_a_duplicate(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    tid = row.provider_ref or ""
    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(order_id=row.id.hex, transaction_id=tid, amount_minor=5000),
        follow_redirects=False,
    )
    envelope = payment_webhook(
        "payment.success", order_id=row.id.hex, transaction_id=tid, amount_minor=5000
    )
    body, webhook_headers = signed_webhook(envelope)
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=webhook_headers
    )
    assert response.status_code == 200, response.text
    assert await _charges(db_async, intent_id) == 1


async def test_a_webhook_credits_a_payment_whose_redirect_never_arrived(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    envelope = payment_webhook(
        "payment.success",
        order_id=row.id.hex,
        transaction_id=row.provider_ref or "",
        amount_minor=5000,
    )
    body, webhook_headers = signed_webhook(envelope)
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=webhook_headers
    )
    assert response.status_code == 200
    assert await _charges(db_async, intent_id) == 1


async def test_a_webhook_with_a_bad_signature_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    envelope = payment_webhook(
        "payment.success",
        order_id=row.id.hex,
        transaction_id=row.provider_ref or "",
        amount_minor=5000,
    )
    body, webhook_headers = signed_webhook(envelope, secret="attacker")
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=webhook_headers
    )
    assert response.status_code == 400
    assert await _charges(db_async, intent_id) == 0


async def test_a_webhook_for_an_unknown_order_is_acknowledged_and_ignored(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    envelope = payment_webhook(
        "payment.success",
        order_id=uuid.uuid4().hex,
        transaction_id="SB-1-x-20261121120000",
        amount_minor=5000,
    )
    body, webhook_headers = signed_webhook(envelope)
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=webhook_headers
    )
    assert response.status_code == 200


async def test_a_webhook_without_a_configured_secret_is_503_so_wipay_retries(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, webhook_secret=None
    )
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    envelope = payment_webhook(
        "payment.success",
        order_id=row.id.hex,
        transaction_id=row.provider_ref or "",
        amount_minor=5000,
    )
    body, webhook_headers = signed_webhook(envelope)
    response = await async_client.post(
        f"{API}/public/webhooks/wipay", content=body, headers=webhook_headers
    )
    assert response.status_code == 503


async def test_a_disabled_merchant_cannot_start_a_checkout(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client, enabled=False)
    response = await async_client.post(
        f"{API}/org/intents",
        headers=headers,
        json={
            "amount_minor": 5000,
            "provider": "wipay",
            "source_type": "shop.sale",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert response.status_code == 503
    assert wipay_env.requests == []


async def test_live_mode_cannot_start_a_checkout_until_the_owner_approves(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(
        db_async, async_client, environment="live"
    )
    response = await async_client.post(
        f"{API}/org/intents",
        headers=headers,
        json={
            "amount_minor": 5000,
            "provider": "wipay",
            "source_type": "shop.sale",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert response.status_code == 503
    assert "approved" in response.json()["detail"].lower()
    assert wipay_env.requests == []


async def test_a_wipay_refund_is_refused_and_records_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )
    response = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=headers,
        json={"reason": "Booking cancelled"},
    )
    assert response.status_code == 409
    assert "WiPay dashboard" in response.json()["detail"]
    assert (
        int(
            await db_async.scalar(
                select(func.count())
                .select_from(LedgerEntry)
                .where(LedgerEntry.kind == LedgerKind.REFUND.value)
            )
            or 0
        )
        == 0
    )


async def test_a_sandbox_capture_is_recorded_as_the_sandbox_test(
    db_async: AsyncSession, async_client: httpx.AsyncClient, wipay_env
) -> None:
    from src.payments.models import MerchantAccount

    org, admin, headers = await _org_with_wipay(db_async, async_client)
    intent_id, _ = await _checkout(async_client, org, admin, headers)
    row = await _intent_row(db_async, intent_id)
    await async_client.get(
        f"{API}/public/returns/wipay",
        params=return_query(
            order_id=row.id.hex,
            transaction_id=row.provider_ref or "",
            amount_minor=5000,
        ),
        follow_redirects=False,
    )
    account = await db_async.scalar(
        select(MerchantAccount).where(MerchantAccount.organisation_id == org.id)  # type: ignore[attr-defined]
    )
    assert account is not None
    assert account.sandbox_verified_at is not None
    assert (
        await _intent_row(db_async, intent_id)
    ).status == IntentStatus.SUCCEEDED.value
