"""Stripe Connect behind the ``payments-stripe-connect`` flag (story 5.5, 8.7).

Off: the Connect routes answer 404 and make no Stripe call, a card payment is the
platform charge exactly as before Connect, and the Connect webhook answers 200 and
does not apply account or dispute events. A payment already taken on a connected
account is still reconciled when the flag goes off, because the money has moved.
The flag on is covered by ``test_connect.py`` (which enables it for every test).
"""

import time
import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.feature_flags.keys import PAYMENTS_STRIPE_CONNECT
from src.payments.connect.models import Dispute
from src.payments.models import Intent
from tests.organisations.support import headers_for
from tests.payments.conftest import checkout_completed, set_flag
from tests.payments.test_connect import (
    ACCOUNT_ID,
    API,
    ConnectStub,
    _checkout,
    _ledger_total,
    _onboard,
    _org,
    _post_connect,
    _ready,
    _set_fee,
    _stored_row,
    connect_event,
)

pytestmark = pytest.mark.asyncio


async def test_flag_off_answers_404_on_every_connect_route_and_calls_no_stripe(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=False)

    assert (await _onboard(async_client, org, user)).status_code == 404
    status_read = await async_client.get(
        f"{API}/org/connect", headers=headers_for(user, org.id)
    )
    assert status_read.status_code == 404
    disputes = await async_client.get(
        f"{API}/org/disputes", headers=headers_for(user, org.id)
    )
    assert disputes.status_code == 404
    fee = await async_client.post(
        f"{API}/admin/connect/accounts/{org.id}/platform-fee",
        headers=superuser_token_headers_async,
        json={"platform_fee_bps": 300},
    )
    assert fee.status_code == 404
    assert connect_env.requests == []


async def test_flag_off_checkout_is_the_platform_charge_even_when_ready(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, user = await _org(db_async)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=True)
    await _ready(async_client, org, user, connect_env)
    assert (
        await _set_fee(async_client, org, 300, superuser_token_headers_async)
    ).status_code == 200

    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=False)
    response = await _checkout(async_client, org, user, amount_minor=5000)
    assert response.status_code == 201, response.text

    checkout = connect_env.find("POST", "/v1/checkout/sessions")
    assert len(checkout) == 1
    assert "Stripe-Account" not in connect_env.requests[checkout[0]].headers
    form = connect_env.form_of(checkout[0])
    assert "payment_intent_data[application_fee_amount]" not in form
    intent = (
        await db_async.execute(
            select(Intent).where(
                Intent.id == uuid.UUID(response.json()["intent"]["id"])
            )
        )
    ).scalar_one()
    assert intent.connected_account_id is None
    assert intent.application_fee_minor is None


async def test_flag_off_webhook_acknowledges_and_ignores_account_and_dispute_events(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    org, user = await _org(db_async)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=True)
    await _ready(async_client, org, user, connect_env)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=False)

    # 200, not 4xx or 5xx: Stripe must not retry these for days.
    account = connect_event(
        "evt_acct_off",
        "account.updated",
        {
            "id": ACCOUNT_ID,
            "object": "account",
            "charges_enabled": False,
            "payouts_enabled": False,
            "details_submitted": False,
            "requirements": {"currently_due": [], "past_due": []},
        },
        created=int(time.time()) + 60,
    )
    assert (await _post_connect(async_client, account)).status_code == 200
    assert (await _stored_row(db_async, org.id)).charges_enabled is True

    dispute = connect_event(
        "evt_dispute_off",
        "charge.dispute.created",
        {
            "id": "dp_flag_off_1",
            "object": "dispute",
            "amount": 5000,
            "currency": "nzd",
            "charge": "ch_test_1",
            "payment_intent": "pi_test_1",
            "status": "needs_response",
            "reason": "fraudulent",
            "evidence_details": {"due_by": int(time.time()) + 86400},
        },
    )
    assert (await _post_connect(async_client, dispute)).status_code == 200
    stored = await db_async.scalar(
        select(func.count())
        .select_from(Dispute)
        .where(Dispute.provider_dispute_ref == "dp_flag_off_1")
    )
    assert stored == 0


async def test_flag_off_still_credits_a_payment_already_on_a_connected_account(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    connect_env: ConnectStub,
) -> None:
    # The money already moved on the business's account: its success is applied.
    org, user = await _org(db_async)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=True)
    await _ready(async_client, org, user, connect_env)
    created = await _checkout(async_client, org, user, amount_minor=5000)
    assert created.status_code == 201, created.text
    intent_id = created.json()["intent"]["id"]

    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=False)
    paid = checkout_completed(
        intent_id, event_id="evt_paid_off", amount=5000, currency="nzd"
    )
    event = connect_event(
        "evt_paid_off", "checkout.session.completed", paid["data"]["object"]
    )
    assert (await _post_connect(async_client, event)).status_code == 200
    assert await _ledger_total(db_async, org.id) == 5000


@pytest.mark.usefixtures("connect_env")
async def test_switching_off_and_on_takes_effect_without_a_restart(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, user = await _org(db_async)
    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=True)
    assert (await _onboard(async_client, org, user)).status_code == 200

    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=False)
    gone = await async_client.get(
        f"{API}/org/connect", headers=headers_for(user, org.id)
    )
    assert gone.status_code == 404

    await set_flag(db_async, PAYMENTS_STRIPE_CONNECT, enabled=True)
    back = await async_client.get(
        f"{API}/org/connect", headers=headers_for(user, org.id)
    )
    assert back.status_code == 200


@pytest.mark.usefixtures("connect_env")
async def test_audience_can_open_connect_for_one_organisation_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    pilot, pilot_user = await _org(db_async)
    other, other_user = await _org(db_async)
    await set_flag(
        db_async, PAYMENTS_STRIPE_CONNECT, enabled=True, organisation_ids=[pilot.id]
    )

    assert (await _onboard(async_client, pilot, pilot_user)).status_code == 200
    assert (await _onboard(async_client, other, other_user)).status_code == 404
