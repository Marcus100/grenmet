import hashlib
import hmac
import json
import time
from collections.abc import Generator
from types import SimpleNamespace

import httpx
import pytest
import stripe

from src.auth.models import User
from src.billing.config import BillingConfig
from src.billing.dependencies import get_stripe_gateway
from src.billing.gateway import (
    CheckoutSessionResult,
    StripeSdkGateway,
    WebhookEventResult,
)
from src.dependencies import get_current_user
from src.main import app


class FakeStripeGateway:
    def __init__(self) -> None:
        self.webhook_payload: bytes | None = None
        self.webhook_signature: str | None = None

    def create_subscription_checkout(
        self, *, customer_email: str, client_reference_id: str
    ) -> CheckoutSessionResult:
        return CheckoutSessionResult(
            id="cs_test_checkout",
            url="https://checkout.stripe.com/c/pay/cs_test_checkout",
        )

    def construct_webhook_event(
        self, *, payload: bytes, signature: str
    ) -> WebhookEventResult:
        self.webhook_payload = payload
        self.webhook_signature = signature
        return WebhookEventResult(
            id="evt_test_webhook",
            type="checkout.session.completed",
            object_id="cs_test_checkout",
        )


@pytest.fixture
def current_user() -> Generator[User, None, None]:
    user = User(
        email="subscriber@example.com",
        username="subscriber",
        first_name="Test",
        last_name="Subscriber",
        hashed_password="not-used",
    )
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def fake_stripe_gateway() -> Generator[FakeStripeGateway, None, None]:
    gateway = FakeStripeGateway()
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


@pytest.fixture
def stripe_webhook_secret() -> str:
    return "whsec_test_billing_secret"


@pytest.fixture
def configured_stripe_gateway(
    stripe_webhook_secret: str,
) -> Generator[StripeSdkGateway, None, None]:
    gateway = StripeSdkGateway(
        BillingConfig(
            _env_file=None,
            STRIPE_WEBHOOK_SECRET=stripe_webhook_secret,
        )
    )
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


@pytest.fixture
def unconfigured_stripe_gateway() -> Generator[StripeSdkGateway, None, None]:
    gateway = StripeSdkGateway(BillingConfig(_env_file=None))
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


@pytest.fixture
def configured_checkout_gateway() -> Generator[StripeSdkGateway, None, None]:
    gateway = StripeSdkGateway(
        BillingConfig(
            _env_file=None,
            STRIPE_SECRET_KEY="sk_test_billing",
            STRIPE_PRICE_ID="price_test_monthly_xcd",
        )
    )
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


def stripe_signature(*, payload: str, secret: str, timestamp: int) -> str:
    signed_payload = f"{timestamp}.{payload}".encode()
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={signature}"


async def test_authenticated_user_can_create_subscription_checkout(
    async_client: httpx.AsyncClient,
    current_user: User,
    fake_stripe_gateway: FakeStripeGateway,
) -> None:
    _ = current_user
    _ = fake_stripe_gateway

    response = await async_client.post("/api/v1/billing/checkout-sessions")

    assert response.status_code == 201
    assert response.json() == {
        "id": "cs_test_checkout",
        "url": "https://checkout.stripe.com/c/pay/cs_test_checkout",
    }


async def test_checkout_requires_authentication(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.post("/api/v1/billing/checkout-sessions")

    assert response.status_code == 401


async def test_checkout_fails_closed_when_stripe_is_not_configured(
    async_client: httpx.AsyncClient,
    current_user: User,
    unconfigured_stripe_gateway: StripeSdkGateway,
) -> None:
    _ = current_user
    _ = unconfigured_stripe_gateway

    response = await async_client.post("/api/v1/billing/checkout-sessions")

    assert response.status_code == 503
    assert response.json() == {"detail": "Billing is not configured"}


async def test_checkout_returns_bad_gateway_when_stripe_is_unavailable(
    async_client: httpx.AsyncClient,
    current_user: User,
    configured_checkout_gateway: StripeSdkGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = current_user
    _ = configured_checkout_gateway

    class FailingSessions:
        def create(self, params: object) -> None:
            _ = params
            raise stripe.StripeError("Stripe unavailable")

    def failing_client(*args: object, **kwargs: object) -> SimpleNamespace:
        _ = args
        _ = kwargs
        return SimpleNamespace(
            v1=SimpleNamespace(
                checkout=SimpleNamespace(sessions=FailingSessions()),
            )
        )

    monkeypatch.setattr(stripe, "StripeClient", failing_client)

    response = await async_client.post("/api/v1/billing/checkout-sessions")

    assert response.status_code == 502
    assert response.json() == {"detail": "Stripe Checkout request failed"}


async def test_checkout_sends_subscription_and_user_context_to_stripe(
    async_client: httpx.AsyncClient,
    current_user: User,
    configured_checkout_gateway: StripeSdkGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = configured_checkout_gateway
    recorded_params: dict[str, object] = {}

    class RecordingSessions:
        def create(self, params: dict[str, object]) -> SimpleNamespace:
            recorded_params.update(params)
            return SimpleNamespace(
                id="cs_test_recorded",
                url="https://checkout.stripe.com/c/pay/cs_test_recorded",
            )

    def recording_client(*args: object, **kwargs: object) -> SimpleNamespace:
        _ = args
        _ = kwargs
        return SimpleNamespace(
            v1=SimpleNamespace(
                checkout=SimpleNamespace(sessions=RecordingSessions()),
            )
        )

    monkeypatch.setattr(stripe, "StripeClient", recording_client)

    response = await async_client.post("/api/v1/billing/checkout-sessions")

    assert response.status_code == 201
    assert recorded_params["mode"] == "subscription"
    assert recorded_params["line_items"] == [
        {"price": "price_test_monthly_xcd", "quantity": 1}
    ]
    assert recorded_params["customer_email"] == "subscriber@example.com"
    assert recorded_params["client_reference_id"] == str(current_user.id)
    assert recorded_params["metadata"] == {"user_id": str(current_user.id)}
    assert recorded_params["subscription_data"] == {
        "metadata": {"user_id": str(current_user.id)}
    }


async def test_webhook_uses_injected_gateway(
    async_client: httpx.AsyncClient,
    fake_stripe_gateway: FakeStripeGateway,
) -> None:
    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content=b'{"test":true}',
        headers={"stripe-signature": "test-signature"},
    )

    assert response.status_code == 200
    assert response.json() == {"received": True}
    assert fake_stripe_gateway.webhook_payload == b'{"test":true}'
    assert fake_stripe_gateway.webhook_signature == "test-signature"


async def test_valid_stripe_webhook_is_accepted(
    async_client: httpx.AsyncClient,
    configured_stripe_gateway: StripeSdkGateway,
    stripe_webhook_secret: str,
) -> None:
    _ = configured_stripe_gateway
    payload = json.dumps(
        {
            "id": "evt_test_checkout_completed",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_test_checkout"}},
        },
        separators=(",", ":"),
    )
    signature = stripe_signature(
        payload=payload,
        secret=stripe_webhook_secret,
        timestamp=int(time.time()),
    )

    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content=payload,
        headers={
            "content-type": "application/json",
            "stripe-signature": signature,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"received": True}


async def test_tampered_stripe_webhook_is_rejected(
    async_client: httpx.AsyncClient,
    configured_stripe_gateway: StripeSdkGateway,
) -> None:
    _ = configured_stripe_gateway
    payload = json.dumps(
        {
            "id": "evt_test_tampered",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_test_tampered"}},
        },
        separators=(",", ":"),
    )

    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content=payload,
        headers={
            "content-type": "application/json",
            "stripe-signature": f"t={int(time.time())},v1=not-a-valid-signature",
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid Stripe webhook signature"}


async def test_unsigned_stripe_webhook_is_rejected(
    async_client: httpx.AsyncClient,
    configured_stripe_gateway: StripeSdkGateway,
) -> None:
    _ = configured_stripe_gateway

    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content="{}",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid Stripe webhook signature"}


async def test_stale_stripe_webhook_is_rejected(
    async_client: httpx.AsyncClient,
    configured_stripe_gateway: StripeSdkGateway,
    stripe_webhook_secret: str,
) -> None:
    _ = configured_stripe_gateway
    payload = "{}"
    signature = stripe_signature(
        payload=payload,
        secret=stripe_webhook_secret,
        timestamp=int(time.time()) - 10_000,
    )

    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content=payload,
        headers={
            "content-type": "application/json",
            "stripe-signature": signature,
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid Stripe webhook signature"}


async def test_webhook_fails_closed_when_signing_is_not_configured(
    async_client: httpx.AsyncClient,
    unconfigured_stripe_gateway: StripeSdkGateway,
) -> None:
    _ = unconfigured_stripe_gateway

    response = await async_client.post(
        "/api/v1/billing/webhooks/stripe",
        content="{}",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Billing is not configured"}
