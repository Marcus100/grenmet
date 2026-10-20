# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""Provider adapters: the live-key refusal, signatures and the Stripe test-mode client."""

import json
import uuid

import httpx
import pytest

from src.exceptions import AppException
from src.payments.config import PaymentsConfig, payments_settings
from src.payments.exceptions import (
    InvalidCallbackError,
    ProviderRequestError,
    ProviderUnavailableError,
)
from src.payments.models import Intent
from src.payments.providers import registry
from src.payments.providers import stripe as stripe_module
from src.payments.providers.base import EventKind
from src.payments.providers.manual import ManualProvider
from src.payments.providers.stripe import StripeProvider, verify_signature
from tests.payments.conftest import (
    WEBHOOK_SIGNING_KEY,
    StripeStub,
    checkout_completed,
    signed,
)


def _intent(**overrides: object) -> Intent:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organisation_id": "org_x",
        "amount_minor": 5000,
        "currency": "XCD",
        "status": "requires_payment",
        "provider": "stripe",
        "source_type": "bookings.deposit",
        "provider_ref": "cs_test_1",
        "provider_payment_ref": "pi_test_1",
    }
    values.update(overrides)
    return Intent(**values)


# --- a live card rail must be impossible -------------------------------------------------


@pytest.mark.parametrize(
    "key",
    [
        "sk_live_abc123",
        "rk_live_abc123",
        "rk_test_abc123",
        "pk_test_abc",
        "test",
        " sk_test_x",
    ],
)
def test_a_non_test_stripe_key_is_refused_with_503(key: str) -> None:
    config = PaymentsConfig(STRIPE_SECRET_KEY=key)
    with pytest.raises(ProviderUnavailableError) as raised:
        StripeProvider(config)
    assert raised.value.status_code == 503


def test_a_test_key_is_accepted_and_unset_is_disabled() -> None:
    assert StripeProvider(PaymentsConfig(STRIPE_SECRET_KEY="sk_test_ok"))
    with pytest.raises(ProviderUnavailableError):
        StripeProvider(PaymentsConfig(STRIPE_SECRET_KEY=None))


async def test_a_live_key_never_sends_a_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={})

    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", "sk_live_realmoney")
    with pytest.raises(AppException) as raised:
        registry.get_provider("stripe")
    assert raised.value.status_code == 503
    assert sent == []


def test_unknown_provider_is_a_404() -> None:
    with pytest.raises(AppException) as raised:
        registry.get_provider("paypal")
    assert raised.value.status_code == 404


# --- signatures ----------------------------------------------------------------------------


def _header(body: bytes, stamp: int, secret: str = WEBHOOK_SIGNING_KEY) -> str:
    return f"t={stamp},v1={stripe_module.sign_payload(secret, stamp, body)}"


def test_signature_valid_invalid_and_stale() -> None:
    body = b'{"id":"evt_1"}'
    now = 1_800_000_000.0
    kwargs = {"tolerance_seconds": 300, "now": now}

    verify_signature(_header(body, int(now)), body, WEBHOOK_SIGNING_KEY, **kwargs)
    # Still inside the window on both sides.
    verify_signature(_header(body, int(now) - 299), body, WEBHOOK_SIGNING_KEY, **kwargs)
    verify_signature(_header(body, int(now) + 299), body, WEBHOOK_SIGNING_KEY, **kwargs)

    bad_headers = [
        _header(body, int(now), secret="whsec_wrong"),
        _header(b"other", int(now)),
        _header(body, int(now) - 301),
        _header(body, int(now) + 301),
        f"t={int(now)}",
        f"v1={'0' * 64}",
        f"t=abc,v1={'0' * 64}",
        "",
        None,
    ]
    for header in bad_headers:
        with pytest.raises(InvalidCallbackError):
            verify_signature(header, body, WEBHOOK_SIGNING_KEY, **kwargs)


def test_signature_accepts_any_matching_v1_for_a_rotated_secret() -> None:
    body = b"{}"
    now = 1_800_000_000
    good = stripe_module.sign_payload(WEBHOOK_SIGNING_KEY, now, body)
    header = f"t={now},v1={'1' * 64},v1={good}"
    verify_signature(
        header, body, WEBHOOK_SIGNING_KEY, tolerance_seconds=300, now=float(now)
    )


def test_verify_callback_uses_a_case_insensitive_header_and_normalises(
    stripe_env: StripeStub,
) -> None:
    provider = StripeProvider()
    intent_id = uuid.uuid4()
    body, headers = signed(checkout_completed(intent_id))
    event = provider.verify_callback(
        {"stripe-signature": headers["Stripe-Signature"]}, body
    )
    assert event.kind is EventKind.PAYMENT_SUCCEEDED
    assert event.intent_id == intent_id
    assert event.event_id == "evt_paid_1"
    assert event.amount_minor == 5000
    assert event.currency == "XCD"
    assert event.payment_ref == "pi_test_1"


def test_unpaid_or_unknown_events_are_ignored(stripe_env: StripeStub) -> None:
    provider = StripeProvider()
    unpaid = checkout_completed(uuid.uuid4())
    unpaid["data"]["object"]["payment_status"] = "unpaid"
    for event in (
        unpaid,
        {"id": "evt_2", "type": "customer.created", "data": {"object": {}}},
    ):
        body, headers = signed(event)
        assert provider.verify_callback(headers, body).kind is EventKind.IGNORED

    body, headers = signed({"type": "x"})
    with pytest.raises(InvalidCallbackError):
        provider.verify_callback(headers, body)
    garbage = b"not json"
    stamp = 1
    with pytest.raises(InvalidCallbackError):
        provider.verify_callback({"Stripe-Signature": _header(garbage, stamp)}, garbage)


# --- the Stripe client against a mocked transport ---------------------------------------


async def test_create_payment_posts_a_checkout_session(stripe_env: StripeStub) -> None:
    intent = _intent(provider_ref=None)
    start = await StripeProvider().create_payment(intent)
    assert start.provider_ref == "cs_test_1"
    assert start.checkout_url == "https://checkout.stripe.com/c/pay/cs_test_1"
    request = stripe_env.requests[0]
    assert request.url.host == "api.stripe.com"
    assert request.headers["idempotency-key"] == f"intent-{intent.id}"
    form = stripe_env.form()
    assert form["metadata[intent_id]"] == str(intent.id)
    assert form["payment_intent_data[metadata][intent_id]"] == str(intent.id)
    assert form["success_url"] == "https://example.test/paid"


async def test_create_payment_needs_return_urls(
    stripe_env: StripeStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(payments_settings, "STRIPE_SUCCESS_URL", None)
    with pytest.raises(ProviderUnavailableError):
        await StripeProvider().create_payment(_intent())
    assert stripe_env.requests == []


async def test_provider_errors_become_502_without_leaking_detail(
    monkeypatch: pytest.MonkeyPatch, stripe_env: StripeStub
) -> None:
    def explode(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(explode))
    with pytest.raises(ProviderRequestError):
        await StripeProvider().create_payment(_intent())

    def reject(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "secret detail"}})

    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(reject))
    with pytest.raises(ProviderRequestError) as raised:
        await StripeProvider().create_payment(_intent())
    assert "secret detail" not in raised.value.message


async def test_refund_and_status(stripe_env: StripeStub) -> None:
    provider = StripeProvider()
    refund_id = uuid.uuid4()
    result = await provider.refund(_intent(), 1200, refund_id)
    assert (result.provider_ref, result.status) == ("re_test_1", "succeeded")
    form = stripe_env.form()
    assert form["payment_intent"] == "pi_test_1"
    assert form["amount"] == "1200"
    assert stripe_env.requests[-1].headers["idempotency-key"] == f"refund-{refund_id}"

    with pytest.raises(ProviderRequestError):
        await provider.refund(_intent(provider_payment_ref=None), 1, refund_id)

    assert (await provider.fetch_status(_intent())).status == "requires_payment"
    stripe_env.paid = True
    assert (await provider.fetch_status(_intent())).status == "succeeded"


# --- manual ---------------------------------------------------------------------------------


async def test_manual_provider_has_no_online_step() -> None:
    provider = ManualProvider()
    intent = _intent(provider="manual", status="succeeded")
    start = await provider.create_payment(intent)
    assert start.checkout_url is None
    assert (await provider.refund(intent, 1, uuid.uuid4())).status == "succeeded"
    assert (await provider.fetch_status(intent)).status == "succeeded"
    with pytest.raises(InvalidCallbackError):
        provider.verify_callback({}, json.dumps({}).encode())
