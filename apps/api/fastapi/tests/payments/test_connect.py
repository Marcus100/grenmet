"""Stripe Connect for New Zealand businesses (business is the seller), TEST MODE.

Direct charges on the business's connected account, an optional Barrels platform
fee, a Connect webhook endpoint with its own secret, disputes recorded (never
ledgered) and refunds on the connected account. Stripe is stubbed over httpx.
"""

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.models import MembershipRole, PlatformOrganisation
from src.payments.config import payments_settings
from src.payments.connect.config import ConnectConfig, connect_settings
from src.payments.connect.disputes import dispute_for
from src.payments.connect.models import ConnectedAccount
from src.payments.models import Intent, LedgerEntry
from src.payments.providers import stripe as stripe_module
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.payments.conftest import (
    WEBHOOK_SIGNING_KEY,
    checkout_completed,
    provider_refund,
    signed,
)
from tests.payments.conftest import charge_refunded as charge_refunded_event

API = "/api/v1/payments"
CONNECT_SIGNING_KEY = "whsec_connect_unit_test"
ACCOUNT_ID = "acct_test_1"
pytestmark = pytest.mark.asyncio


@dataclass
class ConnectStub:
    requests: list[httpx.Request] = field(default_factory=list)
    #: The v1 Account snapshot Stripe returns for the connected account.
    charges_enabled: bool = False
    payouts_enabled: bool = False
    currently_due: list[str] = field(default_factory=list)
    fail_retrieve: bool = False
    fail_link: bool = False
    checkout_id: str = "cs_test_1"

    def json_of(self, index: int) -> dict[str, Any]:
        loaded = json.loads(self.requests[index].content.decode() or "{}")
        assert isinstance(loaded, dict)
        return loaded

    def form_of(self, index: int) -> dict[str, str]:
        from urllib.parse import parse_qs

        parsed = parse_qs(self.requests[index].content.decode())
        return {key: values[0] for key, values in parsed.items()}

    def find(self, method: str, path: str) -> list[int]:
        return [
            index
            for index, request in enumerate(self.requests)
            if request.method == method and request.url.path == path
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": ACCOUNT_ID,
            "object": "account",
            "charges_enabled": self.charges_enabled,
            "payouts_enabled": self.payouts_enabled,
            "details_submitted": self.charges_enabled,
            "requirements": {
                "currently_due": self.currently_due,
                "past_due": [],
                "disabled_reason": None,
            },
        }


@pytest.fixture
def connect_env(monkeypatch: pytest.MonkeyPatch) -> ConnectStub:
    stub = ConnectStub()

    def handler(request: httpx.Request) -> httpx.Response:
        stub.requests.append(request)
        path = request.url.path
        if request.method == "POST" and path == "/v2/core/accounts":
            return httpx.Response(
                200, json={"id": ACCOUNT_ID, "object": "v2.core.account"}
            )
        if request.method == "POST" and path == "/v2/core/account_links":
            if stub.fail_link:
                return httpx.Response(500, json={"error": {"message": "down"}})
            return httpx.Response(
                200,
                json={
                    "object": "v2.core.account_link",
                    "url": f"https://connect.stripe.com/setup/c/{ACCOUNT_ID}/abc",
                },
            )
        if request.method == "GET" and path == f"/v1/accounts/{ACCOUNT_ID}":
            if stub.fail_retrieve:
                return httpx.Response(500, json={"error": {"message": "down"}})
            return httpx.Response(200, json=stub.snapshot())
        if request.method == "POST" and path == "/v1/checkout/sessions":
            return httpx.Response(
                200,
                json={
                    "id": stub.checkout_id,
                    "url": f"https://checkout.stripe.com/c/pay/{stub.checkout_id}",
                },
            )
        if request.method == "GET" and path.startswith("/v1/checkout/sessions/"):
            return httpx.Response(
                200, json={"payment_status": "paid", "status": "complete"}
            )
        if request.method == "GET" and path == "/v1/refunds":
            return httpx.Response(
                200, json={"object": "list", "has_more": False, "data": []}
            )
        if request.method == "POST" and path == "/v1/refunds":
            return httpx.Response(200, json={"id": "re_test_1", "status": "succeeded"})
        return httpx.Response(404, json={})

    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", "sk_test_unit")
    monkeypatch.setattr(payments_settings, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SIGNING_KEY)
    monkeypatch.setattr(
        payments_settings, "STRIPE_SUCCESS_URL", "https://example.test/paid"
    )
    monkeypatch.setattr(
        payments_settings, "STRIPE_CANCEL_URL", "https://example.test/cancelled"
    )
    monkeypatch.setattr(
        connect_settings, "STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT_SIGNING_KEY
    )
    monkeypatch.setattr(
        connect_settings, "CONNECT_RETURN_URL", "https://example.test/billing"
    )
    monkeypatch.setattr(connect_settings, "CONNECT_PLATFORM_FEE_CAP_BPS", 1000)
    monkeypatch.setattr(connect_settings, "CONNECT_REFUND_APPLICATION_FEE", False)
    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(handler))
    return stub


async def _org(
    db: AsyncSession, role: MembershipRole = MembershipRole.ADMIN
) -> tuple[PlatformOrganisation, User]:
    user = await make_user(db)
    org = await make_org(
        db,
        f"Shop {uuid.uuid4().hex[:6]}",
        members=((user, role),),
        apps=("payments",),
    )
    return org, user


async def _onboard(
    client: httpx.AsyncClient, org: PlatformOrganisation, user: User
) -> httpx.Response:
    return await client.post(
        f"{API}/org/connect/onboarding-links", headers=headers_for(user, org.id)
    )


async def _status(
    client: httpx.AsyncClient, org: PlatformOrganisation, user: User
) -> dict[str, Any]:
    response = await client.get(f"{API}/org/connect", headers=headers_for(user, org.id))
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def _ready(
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    user: User,
    stub: ConnectStub,
) -> None:
    assert (await _onboard(client, org, user)).status_code == 200
    stub.charges_enabled = True
    stub.payouts_enabled = True
    assert (await _status(client, org, user))["charges_enabled"] is True


async def _set_fee(
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    fee_bps: int,
    superuser_headers: dict[str, str],
) -> httpx.Response:
    return await client.post(
        f"{API}/admin/connect/accounts/{org.id}/platform-fee",
        headers=superuser_headers,
        json={"platform_fee_bps": fee_bps},
    )


def _nzd_intent(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "amount_minor": 5000,
        "currency": "NZD",
        "provider": "stripe",
        "source_type": "shop.sale",
        "source_id": f"order-{uuid.uuid4().hex[:6]}",
        "idempotency_key": uuid.uuid4().hex,
    }
    body.update(overrides)
    return body


async def _checkout(
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    user: User,
    **overrides: object,
) -> httpx.Response:
    return await client.post(
        f"{API}/org/intents",
        headers=headers_for(user, org.id),
        json=_nzd_intent(**overrides),
    )


def connect_event(
    event_id: str,
    event_type: str,
    obj: dict[str, Any],
    *,
    created: int | None = None,
    account: str = ACCOUNT_ID,
) -> dict[str, Any]:
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "account": account,
        "created": int(time.time()) if created is None else created,
        "data": {"object": obj},
    }


async def _post_connect(
    client: httpx.AsyncClient,
    event: dict[str, Any],
    *,
    secret: str = CONNECT_SIGNING_KEY,
) -> httpx.Response:
    body, headers = signed(event, secret=secret)
    return await client.post(
        f"{API}/public/webhooks/stripe-connect", content=body, headers=headers
    )


async def _stored_row(db: AsyncSession, organisation_id: str) -> ConnectedAccount:
    # populate_existing: a request on its own session may have changed the row since
    # this session first loaded it.
    row = (
        await db.execute(
            select(ConnectedAccount)
            .where(ConnectedAccount.organisation_id == organisation_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return row


async def _ledger_total(db: AsyncSession, organisation_id: str) -> int:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0)).where(
                LedgerEntry.organisation_id == organisation_id
            )
        )
    ).scalar_one()
    return int(total)


# --- onboarding -----------------------------------------------------------------------


async def test_onboarding_creates_a_nz_seller_account_with_no_personal_data(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    response = await _onboard(async_client, org, user)
    assert response.status_code == 200, response.text
    assert response.json()["url"].startswith("https://connect.stripe.com/")

    create = connect_env.find("POST", "/v2/core/accounts")
    assert len(create) == 1
    body = connect_env.json_of(create[0])
    assert body["identity"]["country"] == "nz"
    assert body["configuration"]["merchant"]["capabilities"]["card_payments"] == {
        "requested": True
    }
    # The business is the seller: Stripe collects fees and negative balances from
    # the connected account, and the business gets the full Stripe Dashboard.
    assert body["defaults"]["responsibilities"] == {
        "fees_collector": "stripe",
        "losses_collector": "stripe",
    }
    assert body["dashboard"] == "full"
    assert "contact_email" not in body
    assert connect_env.requests[create[0]].headers["Idempotency-Key"] == (
        f"connect-account-{org.id}"
    )

    link = connect_env.find("POST", "/v2/core/account_links")
    link_body = connect_env.json_of(link[0])
    assert link_body["account"] == ACCOUNT_ID
    assert link_body["use_case"]["type"] == "account_onboarding"
    onboarding = link_body["use_case"]["account_onboarding"]
    assert onboarding["return_url"] == "https://example.test/billing"
    assert onboarding["refresh_url"] == "https://example.test/billing"


async def test_second_onboarding_reuses_the_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 200
    assert (await _onboard(async_client, org, user)).status_code == 200
    assert len(connect_env.find("POST", "/v2/core/accounts")) == 1
    assert len(connect_env.find("POST", "/v2/core/account_links")) == 2


async def test_status_reports_onboarding_states_and_requirements_due(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 200

    connect_env.currently_due = ["individual.id_number"]
    waiting = await _status(async_client, org, user)
    assert waiting["connected"] is True
    assert waiting["charges_enabled"] is False
    assert waiting["payouts_enabled"] is False
    assert waiting["requirements_due"] == ["individual.id_number"]
    assert waiting["synced"] is True

    connect_env.currently_due = []
    connect_env.charges_enabled = True
    connect_env.payouts_enabled = True
    ready = await _status(async_client, org, user)
    assert ready["charges_enabled"] is True
    assert ready["payouts_enabled"] is True
    assert ready["requirements_due"] == []


async def test_status_before_onboarding_is_not_connected(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    status_body = await _status(async_client, org, user)
    assert status_body["connected"] is False
    assert status_body["charges_enabled"] is False
    assert connect_env.find("GET", f"/v1/accounts/{ACCOUNT_ID}") == []


async def test_status_keeps_the_stored_state_when_stripe_is_unreachable(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    connect_env.fail_retrieve = True
    stale = await _status(async_client, org, user)
    assert stale["synced"] is False
    assert stale["charges_enabled"] is True


async def test_onboarding_needs_a_return_address(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(connect_settings, "CONNECT_RETURN_URL", None)
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 503
    assert connect_env.find("POST", "/v2/core/accounts") == []


async def test_live_key_is_refused_before_any_connect_request(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", "sk_live_nope")
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 503
    assert connect_env.requests == []


async def test_a_member_without_the_connect_grant_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, member = await _org(db_async, role=MembershipRole.MEMBER)
    assert (await _onboard(async_client, org, member)).status_code == 403
    assert (
        await async_client.get(
            f"{API}/org/connect", headers=headers_for(member, org.id)
        )
    ).status_code == 403
    assert connect_env.requests == []


# --- direct charges -------------------------------------------------------------------


@pytest.mark.usefixtures("monkeypatch")
async def test_checkout_is_a_direct_charge_on_the_connected_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    assert (
        await _set_fee(async_client, org, 300, superuser_token_headers_async)
    ).status_code == 200

    response = await _checkout(async_client, org, user, amount_minor=5000)
    assert response.status_code == 201, response.text
    assert response.json()["checkout_url"].startswith("https://checkout.stripe.com/")

    checkout = connect_env.find("POST", "/v1/checkout/sessions")
    assert len(checkout) == 1
    request = connect_env.requests[checkout[0]]
    assert request.headers["Stripe-Account"] == ACCOUNT_ID
    form = connect_env.form_of(checkout[0])
    assert form["payment_intent_data[application_fee_amount]"] == "150"
    assert form["line_items[0][price_data][currency]"] == "nzd"
    assert form["line_items[0][price_data][unit_amount]"] == "5000"
    assert form["success_url"] == "https://example.test/paid"
    assert form["cancel_url"] == "https://example.test/cancelled"

    intent_id = uuid.UUID(response.json()["intent"]["id"])
    stored = (
        await db_async.execute(select(Intent).where(Intent.id == intent_id))
    ).scalar_one()
    assert stored.connected_account_id == ACCOUNT_ID
    assert stored.application_fee_minor == 150


async def test_zero_fee_sends_no_application_fee(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    assert (await _checkout(async_client, org, user)).status_code == 201
    form = connect_env.form_of(connect_env.find("POST", "/v1/checkout/sessions")[0])
    assert "payment_intent_data[application_fee_amount]" not in form
    assert form["line_items[0][price_data][currency]"] == "nzd"


async def test_checkout_stays_on_the_platform_until_onboarding_is_complete(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    # Onboarding must never break a business's existing card payments: until Stripe
    # says charges are enabled, the checkout is the platform charge, as before.
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 200
    response = await _checkout(async_client, org, user)
    assert response.status_code == 201, response.text
    checkout = connect_env.find("POST", "/v1/checkout/sessions")
    assert len(checkout) == 1
    assert "Stripe-Account" not in connect_env.requests[checkout[0]].headers
    intent = (
        await db_async.execute(
            select(Intent).where(
                Intent.id == uuid.UUID(response.json()["intent"]["id"])
            )
        )
    ).scalar_one()
    assert intent.connected_account_id is None


async def test_non_nzd_checkout_for_a_connected_business_stays_on_the_platform(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    response = await _checkout(async_client, org, user, currency="XCD")
    assert response.status_code == 201, response.text
    checkout = connect_env.find("POST", "/v1/checkout/sessions")
    assert "Stripe-Account" not in connect_env.requests[checkout[0]].headers


async def test_link_failure_keeps_the_account_and_a_retry_succeeds(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    connect_env.fail_link = True
    failed = await _onboard(async_client, org, user)
    assert failed.status_code == 502
    connect_env.fail_link = False
    retried = await _onboard(async_client, org, user)
    assert retried.status_code == 200, retried.text
    # The account was saved before the link was requested: the retry reuses it.
    assert len(connect_env.find("POST", "/v2/core/accounts")) == 1
    assert (await _stored_row(db_async, org.id)).stripe_account_id == ACCOUNT_ID


async def test_return_address_must_be_https(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        connect_settings, "CONNECT_RETURN_URL", "http://example.test/billing"
    )
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 503
    assert connect_env.find("POST", "/v2/core/accounts") == []


def test_config_refuses_a_plain_http_return_address() -> None:
    with pytest.raises(ValidationError):
        ConnectConfig(CONNECT_RETURN_URL="http://example.test/billing")
    accepted = ConnectConfig(CONNECT_RETURN_URL="https://example.test/billing")
    assert accepted.CONNECT_RETURN_URL == "https://example.test/billing"


def test_config_refuses_a_connect_secret_equal_to_the_platform_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PAYMENTS_STRIPE_WEBHOOK_SECRET", "whsec_same_value")
    monkeypatch.setenv("PAYMENTS_STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_same_value")
    with pytest.raises(ValidationError):
        ConnectConfig()


@pytest.mark.usefixtures("db_async", "connect_env")
async def test_connect_webhook_refuses_a_secret_equal_to_the_platform_secret(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        connect_settings, "STRIPE_CONNECT_WEBHOOK_SECRET", WEBHOOK_SIGNING_KEY
    )
    event = connect_event("evt_same", "account.updated", {"id": ACCOUNT_ID})
    body, headers = signed(event, secret=WEBHOOK_SIGNING_KEY)
    response = await async_client.post(
        f"{API}/public/webhooks/stripe-connect", content=body, headers=headers
    )
    assert response.status_code == 503


@pytest.mark.usefixtures("connect_env")
async def test_platform_webhook_ignores_an_event_that_names_a_connected_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    # A platform-only organisation: its checkout is a platform charge.
    org, user = await _org(db_async)
    created = await _checkout(async_client, org, user, currency="XCD")
    assert created.status_code == 201, created.text
    intent_id = created.json()["intent"]["id"]

    named = checkout_completed(
        intent_id, event_id="evt_named", amount=5000, currency="xcd"
    )
    named["account"] = ACCOUNT_ID
    body, headers = signed(named)
    response = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code == 200
    assert await _ledger_total(db_async, org.id) == 0

    plain = checkout_completed(
        intent_id, event_id="evt_plain", amount=5000, currency="xcd"
    )
    body, headers = signed(plain)
    response = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code == 200
    assert await _ledger_total(db_async, org.id) == 5000


async def test_connected_charge_leaves_the_platform_balance_and_blocks_payouts(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    intent_id = created.json()["intent"]["id"]
    paid = checkout_completed(
        intent_id, event_id="evt_paid_b", amount=5000, currency="nzd"
    )
    assert (
        await _post_connect(
            async_client,
            connect_event(
                "evt_paid_b", "checkout.session.completed", paid["data"]["object"]
            ),
        )
    ).status_code == 200

    # The business's own money: Barrels' balance for the organisation is unchanged.
    balance = await async_client.get(
        f"{API}/org/balance", headers=headers_for(user, org.id)
    )
    assert balance.status_code == 200
    assert balance.json()["data"] == []

    # A payout cannot pay out money Barrels never held.
    payout = await async_client.post(
        f"{API}/admin/payouts",
        headers=superuser_token_headers_async,
        json={
            "organisation_id": org.id,
            "amount_minor": 1,
            "currency": "NZD",
            "reference": "bank-1",
            "request_id": str(uuid.uuid4()),
        },
    )
    assert payout.status_code == 409, payout.text


async def test_platform_money_still_counts_beside_a_connected_charge(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    intent_id = created.json()["intent"]["id"]
    paid = checkout_completed(
        intent_id, event_id="evt_paid_c2", amount=5000, currency="nzd"
    )
    assert (
        await _post_connect(
            async_client,
            connect_event(
                "evt_paid_c2", "checkout.session.completed", paid["data"]["object"]
            ),
        )
    ).status_code == 200
    manual = await async_client.post(
        f"{API}/org/intents",
        headers=headers_for(user, org.id),
        json={
            "amount_minor": 3000,
            "source_type": "shop.sale",
            "source_id": f"cash-{uuid.uuid4().hex[:6]}",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert manual.status_code == 201, manual.text
    recorded = await async_client.post(
        f"{API}/org/intents/{manual.json()['intent']['id']}/manual-payments",
        headers=headers_for(user, org.id),
        json={"method": "cash", "reference": "R-9"},
    )
    assert recorded.status_code == 201, recorded.text
    balance = await async_client.get(
        f"{API}/org/balance", headers=headers_for(user, org.id)
    )
    assert balance.json()["data"] == [
        {"organisation_id": org.id, "currency": "XCD", "owed_minor": 3000}
    ]


async def test_fee_is_capped_at_charge_time(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    row = await _stored_row(db_async, org.id)
    row.platform_fee_bps = 9000  # above the cap, as a stored row could be
    await db_async.commit()
    assert (
        await _checkout(async_client, org, user, amount_minor=5000)
    ).status_code == 201
    form = connect_env.form_of(connect_env.find("POST", "/v1/checkout/sessions")[-1])
    # The cap is 1000 basis points (10%) in this test: 10% of 5000.
    assert form["payment_intent_data[application_fee_amount]"] == "500"


async def test_list_refunds_and_status_reads_use_the_connected_account(
    connect_env: ConnectStub,
) -> None:
    from src.payments.providers.stripe import StripeProvider

    intent = Intent(
        id=uuid.uuid4(),
        organisation_id="org-x",
        amount_minor=5000,
        currency="NZD",
        provider="stripe",
        status="succeeded",
        source_type="shop.sale",
        source_id="x",
        idempotency_key="k" * 12,
        provider_ref="cs_test_1",
        provider_payment_ref="pi_test_1",
        connected_account_id=ACCOUNT_ID,
        application_fee_minor=0,
    )
    provider = StripeProvider()
    await provider.list_refunds(intent)
    await provider.fetch_status(intent)
    listing = connect_env.find("GET", "/v1/refunds")
    status_reads = connect_env.find("GET", "/v1/checkout/sessions/cs_test_1")
    assert len(listing) == 1
    assert len(status_reads) == 1
    for index in listing + status_reads:
        assert connect_env.requests[index].headers["Stripe-Account"] == ACCOUNT_ID


async def test_fee_above_the_platform_cap_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    response = await _set_fee(async_client, org, 1001, superuser_token_headers_async)
    assert response.status_code == 422


async def test_default_cap_is_zero_so_no_fee_can_be_set(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(connect_settings, "CONNECT_PLATFORM_FEE_CAP_BPS", 0)
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    assert (
        await _set_fee(async_client, org, 1, superuser_token_headers_async)
    ).status_code == 422
    assert (
        await _set_fee(async_client, org, 0, superuser_token_headers_async)
    ).status_code == 200


async def test_fee_only_for_a_new_zealand_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    row = (
        await db_async.execute(
            select(ConnectedAccount).where(ConnectedAccount.organisation_id == org.id)
        )
    ).scalar_one()
    row.country = "AU"
    # The request runs on its own session: commit the setup so the route sees it.
    await db_async.commit()
    assert (
        await _set_fee(async_client, org, 100, superuser_token_headers_async)
    ).status_code == 422


async def test_fee_must_be_less_than_the_charge(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(connect_settings, "CONNECT_PLATFORM_FEE_CAP_BPS", 10000)
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    assert (
        await _set_fee(async_client, org, 10000, superuser_token_headers_async)
    ).status_code == 200
    response = await _checkout(async_client, org, user, amount_minor=5000)
    assert response.status_code == 422


async def test_only_a_superuser_sets_the_platform_fee(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    response = await async_client.post(
        f"{API}/admin/connect/accounts/{org.id}/platform-fee",
        headers=headers_for(user, org.id),
        json={"platform_fee_bps": 100},
    )
    assert response.status_code in {401, 403}


# --- Connect webhook ------------------------------------------------------------------


@pytest.mark.usefixtures("connect_env", "db_async")
async def test_connect_webhook_refuses_the_platform_signature(
    async_client: httpx.AsyncClient,
) -> None:
    event = connect_event("evt_x", "account.updated", {"id": ACCOUNT_ID})
    response = await _post_connect(async_client, event, secret=WEBHOOK_SIGNING_KEY)
    assert response.status_code == 400


@pytest.mark.usefixtures("connect_env", "db_async")
async def test_connect_webhook_refuses_a_stale_signature(
    async_client: httpx.AsyncClient,
) -> None:
    event = connect_event("evt_x", "account.updated", {"id": ACCOUNT_ID})
    body, headers = signed(event, secret=CONNECT_SIGNING_KEY, timestamp=1_000)
    response = await async_client.post(
        f"{API}/public/webhooks/stripe-connect", content=body, headers=headers
    )
    assert response.status_code == 400


@pytest.mark.usefixtures("connect_env", "db_async")
async def test_connect_webhook_without_a_secret_is_unavailable(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(connect_settings, "STRIPE_CONNECT_WEBHOOK_SECRET", None)
    event = connect_event("evt_x", "account.updated", {"id": ACCOUNT_ID})
    response = await _post_connect(async_client, event)
    assert response.status_code == 503


@pytest.mark.usefixtures("superuser_token_headers_async")
async def test_connect_payment_is_credited_once_and_only_on_its_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    assert created.status_code == 201
    intent_id = created.json()["intent"]["id"]

    paid = checkout_completed(
        intent_id, event_id="evt_paid_c", amount=5000, currency="nzd"
    )
    other = connect_event(
        "evt_paid_other",
        "checkout.session.completed",
        paid["data"]["object"],
        account="acct_other",
    )
    assert (await _post_connect(async_client, other)).status_code == 200
    assert await _ledger_total(db_async, org.id) == 0

    event = connect_event(
        "evt_paid_c", "checkout.session.completed", paid["data"]["object"]
    )
    first = await _post_connect(async_client, event)
    assert first.status_code == 200
    assert await _ledger_total(db_async, org.id) == 5000

    again = await _post_connect(async_client, event)
    assert again.status_code == 200
    assert await _ledger_total(db_async, org.id) == 5000

    # The platform endpoint cannot credit a connected payment either.
    monkeypatch.setattr(payments_settings, "STRIPE_WEBHOOK_SECRET", WEBHOOK_SIGNING_KEY)
    body, headers = signed(
        checkout_completed(
            intent_id, event_id="evt_platform_dup", amount=5000, currency="nzd"
        )
    )
    platform = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert platform.status_code == 200
    assert await _ledger_total(db_async, org.id) == 5000


async def test_account_updated_applies_only_newer_state(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    assert (await _onboard(async_client, org, user)).status_code == 200
    snapshot = connect_env.snapshot()
    snapshot["charges_enabled"] = True
    snapshot["payouts_enabled"] = True

    # Read the stored row, not the status route: the route reads Stripe itself.
    older = connect_event(
        "evt_acct_old",
        "account.updated",
        {**snapshot, "charges_enabled": False},
        created=int(time.time()) - 3600,
    )
    assert (await _post_connect(async_client, older)).status_code == 200
    stored = await _stored_row(db_async, org.id)
    assert stored.charges_enabled is False

    newer = connect_event(
        "evt_acct_new", "account.updated", snapshot, created=int(time.time()) + 60
    )
    assert (await _post_connect(async_client, newer)).status_code == 200
    stored = await _stored_row(db_async, org.id)
    assert stored.charges_enabled is True
    assert stored.payouts_enabled is True


async def test_dispute_is_recorded_for_the_business_and_never_ledgered(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    intent_id = created.json()["intent"]["id"]
    paid = checkout_completed(
        intent_id, event_id="evt_paid_d", amount=5000, currency="nzd"
    )
    assert (
        await _post_connect(
            async_client,
            connect_event(
                "evt_paid_d", "checkout.session.completed", paid["data"]["object"]
            ),
        )
    ).status_code == 200
    before = await _ledger_total(db_async, org.id)

    dispute = {
        "id": "dp_test_1",
        "object": "dispute",
        "amount": 5000,
        "currency": "nzd",
        "charge": "ch_test_1",
        "payment_intent": "pi_test_1",
        "status": "needs_response",
        "reason": "fraudulent",
        "evidence_details": {"due_by": int(time.time()) + 86400},
    }
    event = connect_event("evt_dispute_1", "charge.dispute.created", dispute)
    assert (await _post_connect(async_client, event)).status_code == 200
    assert (await _post_connect(async_client, event)).status_code == 200

    listing = await async_client.get(
        f"{API}/org/disputes", headers=headers_for(user, org.id)
    )
    assert listing.status_code == 200
    body = listing.json()
    assert body["count"] == 1
    assert body["data"][0]["provider_dispute_ref"] == "dp_test_1"
    assert body["data"][0]["amount_minor"] == 5000
    assert body["data"][0]["currency"] == "NZD"
    assert body["data"][0]["status"] == "needs_response"
    assert body["data"][0]["intent_id"] == intent_id
    assert await _ledger_total(db_async, org.id) == before
    assert await dispute_for(db_async, "dp_test_1") is not None


async def test_refund_runs_on_the_connected_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    intent_id = created.json()["intent"]["id"]
    paid = checkout_completed(
        intent_id, event_id="evt_paid_r", amount=5000, currency="nzd"
    )
    assert (
        await _post_connect(
            async_client,
            connect_event(
                "evt_paid_r", "checkout.session.completed", paid["data"]["object"]
            ),
        )
    ).status_code == 200

    refund = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=headers_for(user, org.id),
        json={"amount_minor": 1000, "reason": "Customer cancelled"},
    )
    assert refund.status_code == 201, refund.text
    posted = connect_env.find("POST", "/v1/refunds")
    assert len(posted) == 1
    assert connect_env.requests[posted[0]].headers["Stripe-Account"] == ACCOUNT_ID
    assert connect_env.form_of(posted[0])["refund_application_fee"] == "false"

    monkeypatch.setattr(connect_settings, "CONNECT_REFUND_APPLICATION_FEE", True)
    second = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=headers_for(user, org.id),
        json={"amount_minor": 500, "reason": "Late cancellation"},
    )
    assert second.status_code == 201, second.text
    posted = connect_env.find("POST", "/v1/refunds")
    assert connect_env.form_of(posted[-1])["refund_application_fee"] == "true"


@pytest.mark.usefixtures("connect_env")
async def test_dispute_for_an_unknown_account_is_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    dispute = {
        "id": "dp_stranger",
        "object": "dispute",
        "amount": 100,
        "currency": "nzd",
        "payment_intent": "pi_nobody",
        "status": "needs_response",
        "reason": "general",
        "evidence_details": {"due_by": int(time.time()) + 86400},
    }
    event = connect_event(
        "evt_dispute_x", "charge.dispute.created", dispute, account="acct_nobody"
    )
    assert (await _post_connect(async_client, event)).status_code == 200
    assert await dispute_for(db_async, "dp_stranger") is None


async def test_refund_reported_on_a_connected_charge_is_recorded_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    intent_id = created.json()["intent"]["id"]
    paid = checkout_completed(
        intent_id, event_id="evt_paid_y", amount=5000, currency="nzd"
    )
    paid_event = connect_event(
        "evt_paid_y", "checkout.session.completed", paid["data"]["object"]
    )
    assert (await _post_connect(async_client, paid_event)).status_code == 200

    # A refund made in the business's Stripe Dashboard, listed on the charge.
    report = charge_refunded_event(
        "evt_refund_y",
        amount_refunded=1000,
        refunds=[provider_refund("re_dashboard_1", 1000)],
        amount=5000,
    )
    event = connect_event("evt_refund_y", "charge.refunded", report["data"]["object"])
    assert (await _post_connect(async_client, event)).status_code == 200
    assert await _ledger_total(db_async, org.id) == 4000
    assert (await _post_connect(async_client, event)).status_code == 200
    assert await _ledger_total(db_async, org.id) == 4000
