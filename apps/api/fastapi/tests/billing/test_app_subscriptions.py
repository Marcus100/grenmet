"""Barrels app subscriptions (ADR-0065): checkout, Stripe reports, migration.

Test mode only. Checkout goes through a fake gateway or a recording Stripe client;
no test reaches Stripe. Webhooks use the real gateway so the signature is checked.
"""

import hashlib
import hmac
import json
import os
import time
import uuid
from collections.abc import AsyncGenerator, Generator
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import stripe
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import event, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.billing import app_subscription_transitions as transitions
from src.billing.config import BillingConfig, billing_settings
from src.billing.dependencies import get_stripe_gateway
from src.billing.gateway import (
    CheckoutSessionResult,
    CheckoutSessionState,
    StripeSdkGateway,
    WebhookEventResult,
)
from src.billing.models import (
    AppSubscription,
    AppSubscriptionStatus,
    Customer,
    Plan,
    PlanPrice,
    StripeEvent,
)
from src.config import settings
from src.database import async_engine, engine
from src.main import app
from src.organisations.models import MembershipRole
from tests.database_target import require_owned_database
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/billing/org/subscriptions"
WEBHOOK = "/api/v1/billing/webhooks/stripe"
PLAN = "bookings-monthly"
PRICE_ID = "price_test_bookings_monthly_xcd"
WEBHOOK_SECRET = "whsec_test_app_subscriptions"
TEST_KEY = "sk_test_app_subscriptions"
LIVE_KEY = "sk_live_must_never_be_used"


class FakeAppGateway:
    """Records checkout calls; never reaches Stripe. Each created session gets a new
    id; a session is ``open`` unless a test sets its status in ``session_status``."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.retrieved: list[str] = []
        self.session_status: dict[str, str] = {}

    def create_app_subscription_checkout(self, **kwargs: Any) -> CheckoutSessionResult:
        self.calls.append(kwargs)
        session_id = f"cs_test_app_fake_{len(self.calls)}"
        return CheckoutSessionResult(
            id=session_id,
            url=f"https://checkout.stripe.com/c/pay/{session_id}",
        )

    def get_app_subscription_checkout(self, *, session_id: str) -> CheckoutSessionState:
        self.retrieved.append(session_id)
        status = self.session_status.get(session_id, "open")
        url = (
            f"https://checkout.stripe.com/c/pay/{session_id}"
            if status == "open"
            else None
        )
        return CheckoutSessionState(id=session_id, status=status, url=url)

    def create_subscription_checkout(self, **kwargs: Any) -> CheckoutSessionResult:
        raise AssertionError("the invoicing-era checkout is not used here")

    def construct_webhook_event(self, **kwargs: Any) -> WebhookEventResult:
        raise AssertionError("webhooks use the real gateway in these tests")


@pytest.fixture
def fake_gateway() -> Generator[FakeAppGateway]:
    gateway = FakeAppGateway()
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


def _real_gateway(**overrides: Any) -> StripeSdkGateway:
    values: dict[str, Any] = {
        "_env_file": None,
        "STRIPE_SECRET_KEY": TEST_KEY,
        "STRIPE_WEBHOOK_SECRET": WEBHOOK_SECRET,
    }
    values.update(overrides)
    gateway = StripeSdkGateway(BillingConfig(**values))
    app.dependency_overrides[get_stripe_gateway] = lambda: gateway
    return gateway


@pytest.fixture
def real_gateway() -> Generator[StripeSdkGateway]:
    gateway = _real_gateway()
    yield gateway
    app.dependency_overrides.pop(get_stripe_gateway, None)


@pytest.fixture(autouse=True)
def _price_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(billing_settings, "STRIPE_PRICES", {f"{PLAN}:XCD": PRICE_ID})
    monkeypatch.setattr(billing_settings, "APP_TRIAL_DAYS", {})


@pytest.fixture
async def plan_seed(db_async: AsyncSession) -> AsyncGenerator[None]:
    """The migration seeds the plan; the test database is cleared per test, so seed here."""
    db_async.add(
        Plan(
            key=PLAN,
            app_key="bookings",
            interval="month",
            active=True,
            name="Bookings monthly",
        )
    )
    db_async.add(PlanPrice(plan_key=PLAN, currency="XCD", amount_minor=3000))
    await db_async.commit()
    yield


async def _org(
    db: AsyncSession, role: MembershipRole, *, superuser: bool = True
) -> tuple[Any, Any]:
    """A caller and an organisation. The routes are gated by the organisation role
    (``OrgAdmin``), so ``superuser`` does not change a member's access; it shows that
    a superuser gets no bypass."""
    user = await make_user(db, superuser=superuser)
    org = await make_org(db, "Subscriber Co", members=((user, role),))
    return user, org


async def _row(
    db: AsyncSession,
    organisation_id: str,
    *,
    row_id: uuid.UUID | None = None,
    status: str = "incomplete",
    stripe_subscription_id: str | None = None,
    checkout_session_id: str | None = None,
    last_event_at: Any = None,
) -> uuid.UUID:
    row = AppSubscription(
        id=row_id or uuid.uuid4(),
        organisation_id=organisation_id,
        plan_key=PLAN,
        app_key="bookings",
        channel="stripe",
        currency="XCD",
        status=status,
        stripe_subscription_id=stripe_subscription_id,
        checkout_session_id=checkout_session_id,
        cancel_at_period_end=False,
        last_event_at=last_event_at,
    )
    db.add(row)
    await db.commit()
    return row.id


async def _fresh(db: AsyncSession, row_id: uuid.UUID) -> AppSubscription:
    row = await db.scalar(
        select(AppSubscription)
        .where(AppSubscription.id == row_id)
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


def _signed(payload: str) -> str:
    timestamp = int(time.time())
    signed = f"{timestamp}.{payload}".encode()
    signature = hmac.new(WEBHOOK_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={signature}"


async def _post_event(
    client: httpx.AsyncClient, event: dict[str, Any]
) -> httpx.Response:
    payload = json.dumps(event, separators=(",", ":"))
    return await client.post(
        WEBHOOK,
        content=payload,
        headers={
            "content-type": "application/json",
            "stripe-signature": _signed(payload),
        },
    )


def _event(
    event_id: str,
    event_type: str,
    obj: dict[str, Any],
    *,
    created: int | None = None,
    livemode: bool = False,
) -> dict[str, Any]:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "created": created if created is not None else int(time.time()),
        "livemode": livemode,
        "data": {"object": obj},
    }


async def _recorded(db: AsyncSession, event_id: str) -> list[StripeEvent]:
    rows = await db.scalars(
        select(StripeEvent)
        .where(StripeEvent.event_id == event_id)
        .execution_options(populate_existing=True)
    )
    return list(rows.all())


def _subscription(
    row_id: uuid.UUID, *, sub_id: str, status: str, **extra: Any
) -> dict[str, Any]:
    obj: dict[str, Any] = {
        "id": sub_id,
        "object": "subscription",
        "status": status,
        "metadata": {"app_subscription_id": str(row_id)},
        "cancel_at_period_end": False,
        "current_period_end": int(time.time()) + 30 * 86400,
    }
    obj.update(extra)
    return obj


@pytest.fixture
def recorded_stripe(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Replace the Stripe client; every checkout create is recorded, none is sent."""
    calls: list[dict[str, Any]] = []

    class Sessions:
        # Same shape as the SDK: create(params, options).
        def create(
            self, params: dict[str, Any], options: dict[str, Any] | None = None
        ) -> SimpleNamespace:
            calls.append({**params, "_options": options})
            return SimpleNamespace(
                id="cs_test_app_recorded",
                url="https://checkout.stripe.com/c/pay/cs_test_app_recorded",
            )

    def client(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            v1=SimpleNamespace(checkout=SimpleNamespace(sessions=Sessions()))
        )

    monkeypatch.setattr(stripe, "StripeClient", client)
    return calls


# --- Listing and checkout ----------------------------------------------------------


@pytest.mark.usefixtures("plan_seed")
async def test_org_admin_checkout_sends_price_and_metadata_to_stripe(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    recorded_stripe: list[dict[str, Any]],
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    user, org = await _org(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        f"{API}/checkout",
        json={"plan_key": PLAN, "currency": "XCD"},
        headers=headers_for(user, org.id),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["url"] == "https://checkout.stripe.com/c/pay/cs_test_app_recorded"
    params = recorded_stripe[0]
    assert params["mode"] == "subscription"
    assert params["line_items"] == [{"price": PRICE_ID, "quantity": 1}]
    assert params["client_reference_id"] == body["id"]
    assert params["customer_email"] == str(user.email).lower()
    assert params["_options"] == {
        "idempotency_key": f"app-subscription-checkout-{body['id']}"
    }
    expected_metadata = {
        "organisation_id": org.id,
        "app_subscription_id": body["id"],
        "plan_key": PLAN,
        "app_key": "bookings",
    }
    assert params["metadata"] == expected_metadata
    assert params["subscription_data"] == {"metadata": expected_metadata}
    assert "trial_period_days" not in params["subscription_data"]

    row = await _fresh(db_async, uuid.UUID(body["id"]))
    assert row.status == "incomplete"
    assert row.channel == "stripe"
    assert row.stripe_subscription_id is None


@pytest.mark.usefixtures("plan_seed")
async def test_checkout_passes_plan_and_organisation_to_the_gateway(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.OWNER)

    response = await async_client.post(
        f"{API}/checkout",
        json={"plan_key": PLAN},
        headers=headers_for(user, org.id),
    )

    assert response.status_code == 201
    call = fake_gateway.calls[0]
    assert call["price_id"] == PRICE_ID
    assert call["plan_key"] == PLAN
    assert call["app_key"] == "bookings"
    assert call["organisation_id"] == org.id
    assert call["subscription_id"] == response.json()["id"]
    assert call["trial_period_days"] is None


@pytest.mark.usefixtures("plan_seed")
async def test_optional_trial_days_reach_the_gateway(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "APP_TRIAL_DAYS", {PLAN: 30})
    user, org = await _org(db_async, MembershipRole.ADMIN)

    await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert fake_gateway.calls[0]["trial_period_days"] == 30


@pytest.mark.usefixtures("plan_seed")
async def test_member_is_refused_with_403(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.MEMBER)

    listing = await async_client.get(API, headers=headers_for(user, org.id))
    checkout = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert listing.status_code == 403
    assert checkout.status_code == 403
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
@pytest.mark.parametrize("role", [MembershipRole.ADMIN, MembershipRole.OWNER])
async def test_business_admin_and_owner_without_superuser_can_list_and_checkout(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    role: MembershipRole,
) -> None:
    """Issue #1723 item 1: the organisation role is the gate, not a global key."""
    user, org = await _org(db_async, role, superuser=False)

    listing = await async_client.get(API, headers=headers_for(user, org.id))
    checkout = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert listing.status_code == 200
    assert listing.json() == {"data": []}
    assert checkout.status_code == 201
    assert len(fake_gateway.calls) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_superuser_who_is_not_a_member_gets_404_not_a_bypass(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    """No superuser bypass: a superuser outside the organisation sees nothing."""
    _, org = await _org(db_async, MembershipRole.OWNER)
    outsider = await make_user(db_async, superuser=True)

    response = await async_client.post(
        f"{API}/checkout",
        json={"plan_key": PLAN},
        headers=headers_for(outsider, org.id),
    )

    assert response.status_code == 404
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
async def test_other_organisation_is_404_for_an_outsider(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    owner, org = await _org(db_async, MembershipRole.OWNER)
    outsider = await make_user(db_async, superuser=True)

    listing = await async_client.get(API, headers=headers_for(outsider, org.id))
    checkout = await async_client.post(
        f"{API}/checkout",
        json={"plan_key": PLAN},
        headers=headers_for(outsider, org.id),
    )

    assert listing.status_code == 404
    assert checkout.status_code == 404
    assert fake_gateway.calls == []
    _ = owner


@pytest.mark.usefixtures("plan_seed")
async def test_live_key_is_refused_before_anything_is_sent(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    _real_gateway(STRIPE_SECRET_KEY=LIVE_KEY)
    constructed: list[object] = []

    def must_not_be_called(*args: object, **kwargs: object) -> None:
        constructed.append((args, kwargs))
        raise AssertionError("a live key reached the Stripe client")

    monkeypatch.setattr(stripe, "StripeClient", must_not_be_called)

    response = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Only Stripe test mode is permitted"}
    assert constructed == []
    rows = await db_async.scalars(
        select(AppSubscription).where(AppSubscription.organisation_id == org.id)
    )
    assert rows.all() == []
    app.dependency_overrides.pop(get_stripe_gateway, None)


@pytest.mark.usefixtures("plan_seed")
async def test_repeat_checkout_while_the_session_is_open_resumes_it(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    """Issue #1723 item 2: an abandoned Checkout must not block a new one for 24 hours."""
    user, org = await _org(db_async, MembershipRole.ADMIN)
    headers = headers_for(user, org.id)
    first = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers
    )
    second = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json() == first.json()
    assert len(fake_gateway.calls) == 1
    assert fake_gateway.retrieved == ["cs_test_app_fake_1"]
    rows = await db_async.scalars(
        select(AppSubscription).where(AppSubscription.organisation_id == org.id)
    )
    assert len(rows.all()) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_repeat_checkout_after_the_session_expired_replaces_the_pending_row(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    headers = headers_for(user, org.id)
    first = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers
    )
    fake_gateway.session_status["cs_test_app_fake_1"] = "expired"

    second = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers
    )

    assert second.status_code == 201
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["url"].endswith("cs_test_app_fake_2")
    old = await _fresh(db_async, uuid.UUID(first.json()["id"]))
    new = await _fresh(db_async, uuid.UUID(second.json()["id"]))
    assert old.status == "canceled"
    assert new.status == "incomplete"
    assert new.checkout_session_id == "cs_test_app_fake_2"


@pytest.mark.usefixtures("plan_seed")
async def test_repeat_checkout_after_payment_is_refused_until_stripe_reports_it(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    """A paid session whose webhook has not arrived yet is not replaced."""
    user, org = await _org(db_async, MembershipRole.ADMIN)
    headers = headers_for(user, org.id)
    await async_client.post(f"{API}/checkout", json={"plan_key": PLAN}, headers=headers)
    fake_gateway.session_status["cs_test_app_fake_1"] = "complete"

    response = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers
    )

    assert response.status_code == 409
    assert len(fake_gateway.calls) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_an_active_subscription_still_blocks_a_new_checkout(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    await _row(
        db_async, org.id, status="active", stripe_subscription_id="sub_already_live"
    )

    response = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 409
    assert fake_gateway.calls == []
    assert fake_gateway.retrieved == []


@pytest.mark.usefixtures("plan_seed")
async def test_a_pending_row_without_a_session_id_is_not_resumed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    """Rows written before the session id was stored cannot be resumed; Stripe's
    expiry event cancels them."""
    user, org = await _org(db_async, MembershipRole.ADMIN)
    await _row(db_async, org.id)

    response = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 409
    assert fake_gateway.calls == []
    assert fake_gateway.retrieved == []


@pytest.mark.usefixtures("plan_seed")
async def test_checkout_without_a_configured_stripe_price_is_503(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(billing_settings, "STRIPE_PRICES", {})
    user, org = await _org(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 503
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
async def test_unknown_plan_and_other_currency_are_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    headers = headers_for(user, org.id)

    unknown = await async_client.post(
        f"{API}/checkout", json={"plan_key": "no-such-plan"}, headers=headers
    )
    usd = await async_client.post(
        f"{API}/checkout", json={"plan_key": PLAN, "currency": "USD"}, headers=headers
    )

    assert unknown.status_code == 404
    assert usd.status_code == 422
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
async def test_listing_shows_the_plan_amount_and_status(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    await _row(db_async, org.id, status="active", stripe_subscription_id="sub_list")

    response = await async_client.get(API, headers=headers_for(user, org.id))

    assert response.status_code == 200
    (item,) = response.json()["data"]
    assert item["app_key"] == "bookings"
    assert item["plan_key"] == PLAN
    assert item["status"] == "active"
    assert item["channel"] == "stripe"
    assert item["currency"] == "XCD"
    assert item["amount_minor"] == 3000


# --- Stripe reports ----------------------------------------------------------------


@pytest.mark.usefixtures("plan_seed")
async def test_subscription_created_active_activates_the_row(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    period_end = int(time.time()) + 30 * 86400
    event = _event(
        "evt_active_1",
        "customer.subscription.created",
        _subscription(
            row_id,
            sub_id="sub_active_1",
            status="active",
            current_period_end=period_end,
        ),
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert response.json() == {"received": True}
    row = await _fresh(db_async, row_id)
    assert row.status == "active"
    assert row.stripe_subscription_id == "sub_active_1"
    assert row.current_period_end is not None
    assert row.last_event_at is not None


@pytest.mark.usefixtures("plan_seed")
async def test_checkout_completed_links_the_stripe_customer_and_subscription(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    db_async.add(Customer(organisation_id=org.id, billing_email="billing@example.com"))
    await db_async.commit()
    row_id = await _row(db_async, org.id)
    event = _event(
        "evt_checkout_link",
        "checkout.session.completed",
        {
            "id": "cs_test_link",
            "object": "checkout.session",
            "client_reference_id": str(row_id),
            "metadata": {"app_subscription_id": str(row_id)},
            "customer": "cus_test_link",
            "subscription": "sub_link_1",
        },
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    row = await _fresh(db_async, row_id)
    assert row.stripe_subscription_id == "sub_link_1"
    assert row.status == "incomplete"
    customer = await db_async.scalar(
        select(Customer)
        .where(Customer.organisation_id == org.id)
        .execution_options(populate_existing=True)
    )
    assert customer is not None
    assert customer.stripe_customer_id == "cus_test_link"


@pytest.mark.usefixtures("plan_seed")
async def test_repeat_delivery_of_an_event_changes_nothing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    now = int(time.time())
    first = _event(
        "evt_repeat_1",
        "customer.subscription.created",
        _subscription(row_id, sub_id="sub_repeat_1", status="active"),
        created=now,
    )
    assert (await _post_event(async_client, first)).status_code == 200

    # Same event id again, now claiming past_due: a replay must not apply it.
    replay = _event(
        "evt_repeat_1",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_repeat_1", status="past_due"),
        created=now + 10,
    )
    response = await _post_event(async_client, replay)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "active"
    recorded = await db_async.scalars(
        select(StripeEvent).where(StripeEvent.event_id == "evt_repeat_1")
    )
    assert len(recorded.all()) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_older_event_than_the_last_applied_one_is_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    newer = int(time.time())
    older = newer - 120

    newest_first = _event(
        "evt_newer",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_order_1", status="active"),
        created=newer,
    )
    stale = _event(
        "evt_older",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_order_1", status="past_due"),
        created=older,
    )
    assert (await _post_event(async_client, newest_first)).status_code == 200
    response = await _post_event(async_client, stale)

    assert response.status_code == 200
    row = await _fresh(db_async, row_id)
    assert row.status == "active"
    assert row.last_event_at == datetime.fromtimestamp(newer, UTC).replace(tzinfo=None)


@pytest.mark.usefixtures("plan_seed")
async def test_deleted_subscription_is_canceled(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(
        db_async, org.id, status="active", stripe_subscription_id="sub_del_1"
    )
    event = _event(
        "evt_deleted_1",
        "customer.subscription.deleted",
        _subscription(row_id, sub_id="sub_del_1", status="canceled"),
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "canceled"


@pytest.mark.usefixtures("plan_seed")
async def test_canceled_subscription_does_not_come_back(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(
        db_async, org.id, status="canceled", stripe_subscription_id="sub_back_1"
    )
    event = _event(
        "evt_back_1",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_back_1", status="active"),
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "canceled"


@pytest.mark.usefixtures("plan_seed")
async def test_failed_invoice_marks_an_active_subscription_past_due(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(
        db_async, org.id, status="active", stripe_subscription_id="sub_fail_1"
    )
    event = _event(
        "evt_invoice_failed",
        "invoice.payment_failed",
        {"id": "in_test_1", "object": "invoice", "subscription": "sub_fail_1"},
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "past_due"


@pytest.mark.usefixtures("plan_seed")
async def test_expired_checkout_cancels_an_unpaid_row(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    event = _event(
        "evt_expired_1",
        "checkout.session.expired",
        {
            "id": "cs_test_expired",
            "object": "checkout.session",
            "client_reference_id": str(row_id),
            "metadata": {"app_subscription_id": str(row_id)},
        },
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "canceled"


@pytest.mark.usefixtures("plan_seed")
async def test_unrelated_event_is_recorded_and_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    event = _event(
        "evt_unrelated_1", "charge.succeeded", {"id": "ch_1", "object": "charge"}
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    recorded = await db_async.scalars(
        select(StripeEvent).where(StripeEvent.event_id == "evt_unrelated_1")
    )
    assert len(recorded.all()) == 1


def test_legacy_checkout_refuses_a_live_key_before_any_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The invoicing-era checkout route had no test-key guard; it now has one."""
    from src.billing.exceptions import BillingLiveModeRefusedError

    def must_not_be_called(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("a live key reached the Stripe client")

    monkeypatch.setattr(stripe, "StripeClient", must_not_be_called)
    gateway = StripeSdkGateway(
        BillingConfig(
            _env_file=None,
            STRIPE_SECRET_KEY=LIVE_KEY,
            STRIPE_PRICE_ID="price_legacy",
        )
    )

    with pytest.raises(BillingLiveModeRefusedError):
        gateway.create_subscription_checkout(
            customer_email="x@example.com", client_reference_id="u1"
        )


@pytest.mark.usefixtures("plan_seed")
async def test_same_second_created_then_active_applies_the_active_status(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Issue #1723 review: a subscription's created (incomplete) and updated (active)
    events often share one Stripe second. The later one must still apply, or a paid
    subscription stays incomplete."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    now = int(time.time())
    created = _event(
        "evt_tie_incomplete",
        "customer.subscription.created",
        _subscription(row_id, sub_id="sub_tie_1", status="incomplete"),
        created=now,
    )
    updated = _event(
        "evt_tie_active",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_tie_1", status="active"),
        created=now,
    )
    assert (await _post_event(async_client, created)).status_code == 200

    response = await _post_event(async_client, updated)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "active"
    assert len(await _recorded(db_async, "evt_tie_active")) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_same_second_active_after_canceled_is_refused_by_the_state_machine(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """A canceled row has no way out, so a same-second active event cannot revive it."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(
        db_async, org.id, status="active", stripe_subscription_id="sub_tie_2"
    )
    now = int(time.time())
    deleted = _event(
        "evt_tie_deleted",
        "customer.subscription.deleted",
        _subscription(row_id, sub_id="sub_tie_2", status="canceled"),
        created=now,
    )
    revived = _event(
        "evt_tie_revive",
        "customer.subscription.updated",
        _subscription(row_id, sub_id="sub_tie_2", status="active"),
        created=now,
    )
    assert (await _post_event(async_client, deleted)).status_code == 200

    response = await _post_event(async_client, revived)

    assert response.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "canceled"


@pytest.mark.usefixtures("plan_seed")
async def test_event_older_than_the_retry_window_is_recorded_and_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Issue #1723 review: an event that names a row which does not exist and is more
    than two hours old (for example, another environment's row) is not retried for
    days. It is recorded and answered 200."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = uuid.uuid4()
    old = int(time.time()) - 3 * 3600
    event = _event(
        "evt_too_old_1",
        "customer.subscription.created",
        _subscription(row_id, sub_id="sub_too_old_1", status="active"),
        created=old,
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert len(await _recorded(db_async, "evt_too_old_1")) == 1
    assert await db_async.get(AppSubscription, row_id) is None
    _ = org


@pytest.mark.usefixtures("plan_seed")
async def test_live_mode_event_is_refused_and_not_recorded(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Issue #1723 item 4: while the product is test-only, a livemode event changes
    nothing and its id is not recorded, so a later retry can still be applied."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id)
    event = _event(
        "evt_live_refused",
        "customer.subscription.created",
        _subscription(row_id, sub_id="sub_live_refused", status="active"),
        livemode=True,
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 503
    assert response.json() == {"detail": "Only Stripe test mode is permitted"}
    row = await _fresh(db_async, row_id)
    assert row.status == "incomplete"
    assert row.stripe_subscription_id is None
    assert await _recorded(db_async, "evt_live_refused") == []


@pytest.mark.usefixtures("plan_seed")
async def test_event_for_a_row_not_written_yet_is_retried_and_not_recorded(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Issue #1723 item 5: when the row is not there yet, the id is not recorded and
    Stripe gets a non-2xx answer, so the same event is applied on the retry."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = uuid.uuid4()
    event = _event(
        "evt_not_yet",
        "customer.subscription.created",
        _subscription(row_id, sub_id="sub_not_yet", status="active"),
    )

    first = await _post_event(async_client, event)

    assert first.status_code == 503
    assert await _recorded(db_async, "evt_not_yet") == []

    await _row(db_async, org.id, row_id=row_id)
    retry = await _post_event(async_client, event)

    assert retry.status_code == 200
    assert (await _fresh(db_async, row_id)).status == "active"
    assert len(await _recorded(db_async, "evt_not_yet")) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_checkout_completed_for_a_row_not_written_yet_is_retried(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    _ = real_gateway
    row_id = uuid.uuid4()
    event = _event(
        "evt_checkout_not_yet",
        "checkout.session.completed",
        {
            "id": "cs_test_not_yet",
            "object": "checkout.session",
            "client_reference_id": str(row_id),
            "metadata": {"app_subscription_id": str(row_id)},
            "subscription": "sub_not_yet_2",
        },
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 503
    assert await _recorded(db_async, "evt_checkout_not_yet") == []


@pytest.mark.usefixtures("plan_seed")
async def test_event_for_an_unknown_subscription_without_our_metadata_is_recorded(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Another product's subscription on the same Stripe account is not ours to retry."""
    _ = real_gateway
    event = _event(
        "evt_foreign_sub",
        "customer.subscription.created",
        {"id": "sub_foreign_1", "object": "subscription", "status": "active"},
    )

    response = await _post_event(async_client, event)

    assert response.status_code == 200
    assert len(await _recorded(db_async, "evt_foreign_sub")) == 1


@pytest.mark.usefixtures("plan_seed")
async def test_webhook_locks_the_subscription_row_it_applies(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    real_gateway: StripeSdkGateway,
) -> None:
    """Issue #1723 item 3: every subscription lookup in the webhook takes a row lock,
    so a concurrent pair for one subscription waits instead of hitting a unique
    violation."""
    _ = real_gateway
    _, org = await _org(db_async, MembershipRole.ADMIN)
    row_id = await _row(db_async, org.id, stripe_subscription_id="sub_lock_1")
    statements: list[str] = []

    def record(
        _conn: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        if "billing.app_subscription" in statement:
            statements.append(statement)

    event.listen(async_engine.sync_engine, "before_cursor_execute", record)
    try:
        response = await _post_event(
            async_client,
            _event(
                "evt_lock_1",
                "customer.subscription.updated",
                _subscription(row_id, sub_id="sub_lock_1", status="active"),
            ),
        )
    finally:
        event.remove(async_engine.sync_engine, "before_cursor_execute", record)

    assert response.status_code == 200
    selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
    assert selects
    assert all("FOR UPDATE" in s.upper() for s in selects)


def _retrieving_client(
    monkeypatch: pytest.MonkeyPatch, status: str, seen: list[str]
) -> None:
    class Sessions:
        # Same shape as the SDK: retrieve(session, params, options).
        def retrieve(
            self,
            session_id: str,
            params: object = None,
            options: object = None,
        ) -> SimpleNamespace:
            seen.append(session_id)
            return SimpleNamespace(
                id=session_id,
                status=status,
                url=f"https://checkout.stripe.com/c/pay/{session_id}",
            )

    def client(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            v1=SimpleNamespace(checkout=SimpleNamespace(sessions=Sessions()))
        )

    monkeypatch.setattr(stripe, "StripeClient", client)


def test_retrieve_returns_the_url_of_an_open_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str] = []
    _retrieving_client(monkeypatch, "open", seen)
    gateway = StripeSdkGateway(
        BillingConfig(_env_file=None, STRIPE_SECRET_KEY=TEST_KEY)
    )

    state = gateway.get_app_subscription_checkout(session_id="cs_open_1")

    assert state == CheckoutSessionState(
        id="cs_open_1",
        status="open",
        url="https://checkout.stripe.com/c/pay/cs_open_1",
    )
    assert seen == ["cs_open_1"]


@pytest.mark.parametrize("status", ["expired", "complete"])
def test_retrieve_hides_the_url_once_the_session_is_not_open(
    monkeypatch: pytest.MonkeyPatch, status: str
) -> None:
    _retrieving_client(monkeypatch, status, [])
    gateway = StripeSdkGateway(
        BillingConfig(_env_file=None, STRIPE_SECRET_KEY=TEST_KEY)
    )

    state = gateway.get_app_subscription_checkout(session_id="cs_done_1")

    assert state.status == status
    assert state.url is None


def test_retrieve_refuses_a_live_key_before_any_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.billing.exceptions import BillingLiveModeRefusedError

    def must_not_be_called(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("a live key reached the Stripe client")

    monkeypatch.setattr(stripe, "StripeClient", must_not_be_called)
    gateway = StripeSdkGateway(
        BillingConfig(_env_file=None, STRIPE_SECRET_KEY=LIVE_KEY)
    )

    with pytest.raises(BillingLiveModeRefusedError):
        gateway.get_app_subscription_checkout(session_id="cs_live_1")


# --- Transition table (no database) ------------------------------------------------


#: Every move the table declares (state, target), with state != target.
_DECLARED_MOVES = {
    (AppSubscriptionStatus.INCOMPLETE, AppSubscriptionStatus.ACTIVE),
    (AppSubscriptionStatus.PAST_DUE, AppSubscriptionStatus.ACTIVE),
    (AppSubscriptionStatus.UNPAID, AppSubscriptionStatus.ACTIVE),
    (AppSubscriptionStatus.ACTIVE, AppSubscriptionStatus.PAST_DUE),
    (AppSubscriptionStatus.UNPAID, AppSubscriptionStatus.PAST_DUE),
    (AppSubscriptionStatus.ACTIVE, AppSubscriptionStatus.UNPAID),
    (AppSubscriptionStatus.PAST_DUE, AppSubscriptionStatus.UNPAID),
    (AppSubscriptionStatus.INCOMPLETE, AppSubscriptionStatus.CANCELED),
    (AppSubscriptionStatus.ACTIVE, AppSubscriptionStatus.CANCELED),
    (AppSubscriptionStatus.PAST_DUE, AppSubscriptionStatus.CANCELED),
    (AppSubscriptionStatus.UNPAID, AppSubscriptionStatus.CANCELED),
}


@pytest.mark.parametrize("state", list(AppSubscriptionStatus))
@pytest.mark.parametrize("target", list(AppSubscriptionStatus))
def test_transition_table_allows_only_the_declared_moves(
    state: AppSubscriptionStatus, target: AppSubscriptionStatus
) -> None:
    if state is target:
        # Staying put is a no-op for the writer, never a refused move.
        assert transitions.can_move(state, target)
    else:
        assert transitions.can_move(state, target) is (
            (state, target) in _DECLARED_MOVES
        )


def test_a_canceled_subscription_has_no_way_out() -> None:
    for target in AppSubscriptionStatus:
        if target is AppSubscriptionStatus.CANCELED:
            continue
        assert not transitions.can_move(AppSubscriptionStatus.CANCELED, target)


# --- Migration rehearsal (inside a rolled-back transaction) -------------------------

REVISION = "billingappsubs20261122"


@pytest.fixture
async def before_migration(db_async: AsyncSession) -> AsyncGenerator[Any]:
    await db_async.rollback()
    require_owned_database(settings.POSTGRES_DB, os.environ)
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    target = scripts.get_revision(REVISION)
    assert target is not None
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SET LOCAL statement_timeout = '30s'"))
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                for revision in scripts.iterate_revisions(
                    context.get_current_heads(), target.down_revision
                ):
                    revision.module.downgrade()
                yield connection, target.module
        finally:
            transaction.rollback()


def _exists(connection: Any, name: str) -> bool:
    return bool(
        connection.execute(text("SELECT to_regclass(:n)"), {"n": name}).scalar()
    )


def test_upgrade_creates_the_tables_and_seeds_the_bookings_price(
    before_migration: Any,
) -> None:
    connection, migration = before_migration
    assert not _exists(connection, "billing.app_subscription")

    migration.upgrade()

    for table in ("plan", "plan_price", "app_subscription", "stripe_event"):
        assert _exists(connection, f"billing.{table}")
    amount = connection.execute(
        text(
            "SELECT amount_minor FROM billing.plan_price "
            "WHERE plan_key = 'bookings-monthly' AND currency = 'XCD'"
        )
    ).scalar()
    assert amount == 3000
    column = connection.execute(
        text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = 'billing' "
            "AND table_name = 'customer' AND column_name = 'stripe_customer_id'"
        )
    ).scalar()
    assert column == 1


def test_partial_unique_index_allows_one_live_row_per_organisation_and_app(
    before_migration: Any,
) -> None:
    connection, migration = before_migration
    migration.upgrade()
    connection.execute(
        text(
            "INSERT INTO org.organisation (id, slug, name, kind, status, created_at, "
            "updated_at) VALUES ('org_appsub', 'appsub', 'App Sub', 'business', "
            "'active', now(), now())"
        )
    )

    def insert(status: str) -> None:
        connection.execute(
            text(
                "INSERT INTO billing.app_subscription (id, organisation_id, plan_key, "
                "app_key, channel, currency, status, cancel_at_period_end, created_at, "
                "updated_at) VALUES (gen_random_uuid(), 'org_appsub', 'bookings-monthly', "
                "'bookings', 'stripe', 'XCD', :status, false, now(), now())"
            ),
            {"status": status},
        )

    insert("active")
    savepoint = connection.begin_nested()
    with pytest.raises(DBAPIError):
        insert("incomplete")
    savepoint.rollback()
    insert("canceled")  # a canceled row does not count as live


def test_downgrade_drops_what_the_revision_added(before_migration: Any) -> None:
    connection, migration = before_migration
    migration.upgrade()
    migration.downgrade()

    assert not _exists(connection, "billing.app_subscription")
    assert not _exists(connection, "billing.plan")
    assert _exists(connection, "billing.customer")
    column = connection.execute(
        text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = 'billing' "
            "AND table_name = 'customer' AND column_name = 'stripe_customer_id'"
        )
    ).scalar()
    assert column is None


CHECKOUT_REVISION = "billingappcheckout20261122"


def test_checkout_session_column_is_added_and_removed(
    before_migration: Any,
) -> None:
    """Issue #1723 item 2: the pending row remembers its Checkout Session (additive)."""
    connection, migration = before_migration
    migration.upgrade()
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    checkout = scripts.get_revision(CHECKOUT_REVISION)
    assert checkout is not None
    assert checkout.down_revision == REVISION

    def has_column() -> bool:
        return bool(
            connection.execute(
                text(
                    "SELECT 1 FROM information_schema.columns WHERE table_schema = "
                    "'billing' AND table_name = 'app_subscription' AND column_name = "
                    "'checkout_session_id'"
                )
            ).scalar()
        )

    checkout.module.upgrade()
    assert has_column()
    checkout.module.downgrade()
    assert not has_column()
