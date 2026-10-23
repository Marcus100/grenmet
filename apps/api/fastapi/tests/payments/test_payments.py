# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""Payments core (PF4): manual flow, ledger, refunds, callbacks, isolation, admin."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.models import MembershipRole, PlatformOrganisation
from src.payments.models import Intent, LedgerEntry
from src.utils.datetime import utc_now
from src.utils.timezones import GRENADA, utc_to_local
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.payments.conftest import (
    StripeStub,
    checkout_completed,
    signed,
)

API = "/api/v1/payments"
pytestmark = pytest.mark.asyncio


async def _org(
    db: AsyncSession, *, apps: tuple[str, ...] = ("payments",)
) -> tuple[PlatformOrganisation, User]:
    admin = await make_user(db)
    org = await make_org(
        db,
        f"Shop {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=apps,
    )
    return org, admin


def _body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "amount_minor": 5000,
        "source_type": "shop.sale",
        "source_id": "booking-1",
        "idempotency_key": uuid.uuid4().hex,
    }
    body.update(overrides)
    return body


async def _create(
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    admin: User,
    **overrides: object,
) -> dict:
    response = await client.post(
        f"{API}/org/intents",
        headers=headers_for(admin, org.id),
        json=_body(**overrides),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _pay_manually(
    client: httpx.AsyncClient, org: PlatformOrganisation, admin: User, intent_id: str
) -> httpx.Response:
    return await client.post(
        f"{API}/org/intents/{intent_id}/manual-payments",
        headers=headers_for(admin, org.id),
        json={"method": "cash", "reference": "R-1"},
    )


async def _paid(
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    admin: User,
    **overrides: object,
) -> str:
    created = await _create(client, org, admin, **overrides)
    intent_id = created["intent"]["id"]
    assert (await _pay_manually(client, org, admin, intent_id)).status_code == 201
    return intent_id


# --- manual provider flow -----------------------------------------------------------


async def test_manual_flow_creates_pays_and_credits_the_ledger(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    created = await _create(async_client, org, admin, customer_email="Pat@Example.com")
    intent = created["intent"]
    assert created["checkout_url"] is None
    assert intent["status"] == "requires_payment"
    assert intent["currency"] == "XCD"
    assert intent["captured_minor"] == 0
    assert "customer_email" not in intent

    paid = await _pay_manually(async_client, org, admin, intent["id"])
    assert paid.status_code == 201
    assert paid.json()["status"] == "succeeded"
    assert paid.json()["captured_minor"] == 5000

    # Recording twice cannot double-credit.
    again = await _pay_manually(async_client, org, admin, intent["id"])
    assert again.status_code == 409

    balance = await async_client.get(
        f"{API}/org/balance", headers=headers_for(admin, org.id)
    )
    assert balance.json()["data"] == [
        {"organisation_id": org.id, "currency": "XCD", "owed_minor": 5000}
    ]

    detail = await async_client.get(
        f"{API}/org/intents/{intent['id']}", headers=headers_for(admin, org.id)
    )
    assert detail.status_code == 200
    assert [a["status"] for a in detail.json()["attempts"]] == ["succeeded"]

    # The payer's address is stored only as a hash.
    stored = (
        await db_async.execute(
            select(Intent.customer_email_hash).where(
                Intent.id == uuid.UUID(intent["id"])
            )
        )
    ).scalar_one()
    assert stored is not None
    assert len(stored) == 64
    assert "pat" not in stored


async def test_create_is_idempotent_per_organisation_key(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    other, other_admin = await _org(db_async)
    key = "same-key-for-everyone"
    first = await _create(async_client, org, admin, idempotency_key=key)
    replay = await _create(async_client, org, admin, idempotency_key=key)
    assert replay["intent"]["id"] == first["intent"]["id"]

    changed = await async_client.post(
        f"{API}/org/intents",
        headers=headers_for(admin, org.id),
        json=_body(idempotency_key=key, amount_minor=9999),
    )
    assert changed.status_code == 409

    # The same key in another organisation is a different payment.
    elsewhere = await _create(async_client, other, other_admin, idempotency_key=key)
    assert elsewhere["intent"]["id"] != first["intent"]["id"]


async def test_create_validates_the_request(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    headers = headers_for(admin, org.id)
    for bad in (
        {"amount_minor": 0},
        {"amount_minor": -5},
        {"currency": "xcd"},
        {"source_type": "Bad Type"},
        {"idempotency_key": "short"},
        {"provider": "paypal"},
    ):
        response = await async_client.post(
            f"{API}/org/intents", headers=headers, json=_body(**bad)
        )
        assert response.status_code == 422, bad


async def test_list_filters_and_paginates_in_sql(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    for index in range(3):
        await _create(async_client, org, admin, source_id=f"order-{index}")
    headers = headers_for(admin, org.id)
    page = await async_client.get(f"{API}/org/intents?size=2", headers=headers)
    assert page.json()["count"] == 3
    assert len(page.json()["data"]) == 2
    one = await async_client.get(
        f"{API}/org/intents?source_id=order-1&status=requires_payment", headers=headers
    )
    assert one.json()["count"] == 1


# --- refunds ---------------------------------------------------------------------------


async def test_refund_cannot_exceed_what_was_captured(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    headers = headers_for(admin, org.id)
    intent_id = await _paid(async_client, org, admin)
    url = f"{API}/org/intents/{intent_id}/refunds"

    partial = await async_client.post(
        url, headers=headers, json={"amount_minor": 2000, "reason": "Late arrival"}
    )
    assert partial.status_code == 201
    assert partial.json()["status"] == "succeeded"

    too_much = await async_client.post(
        url, headers=headers, json={"amount_minor": 3001, "reason": "Too much"}
    )
    assert too_much.status_code == 422

    rest = await async_client.post(url, headers=headers, json={"reason": "The rest"})
    assert rest.status_code == 201
    assert rest.json()["amount_minor"] == 3000

    nothing_left = await async_client.post(
        url, headers=headers, json={"amount_minor": 1, "reason": "Again"}
    )
    assert nothing_left.status_code == 422

    balance = await async_client.get(f"{API}/org/balance", headers=headers)
    assert balance.json()["data"][0]["owed_minor"] == 0
    detail = (
        await async_client.get(f"{API}/org/intents/{intent_id}", headers=headers)
    ).json()
    assert detail["intent"]["refunded_minor"] == 5000
    assert len(detail["refunds"]) == 2


async def test_refund_needs_a_captured_payment(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    created = await _create(async_client, org, admin)
    response = await async_client.post(
        f"{API}/org/intents/{created['intent']['id']}/refunds",
        headers=headers_for(admin, org.id),
        json={"reason": "Nothing taken"},
    )
    assert response.status_code == 409


# --- isolation and access ----------------------------------------------------------------


async def test_other_organisations_payments_answer_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    other, other_admin = await _org(db_async)
    intent_id = await _paid(async_client, org, admin)
    intruder = headers_for(other_admin, other.id)

    assert (
        await async_client.get(f"{API}/org/intents/{intent_id}", headers=intruder)
    ).status_code == 404
    assert (
        await _pay_manually(async_client, other, other_admin, intent_id)
    ).status_code == 404
    refund = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=intruder,
        json={"reason": "Not mine"},
    )
    assert refund.status_code == 404
    listing = await async_client.get(f"{API}/org/intents", headers=intruder)
    assert listing.json()["count"] == 0
    balance = await async_client.get(f"{API}/org/balance", headers=intruder)
    assert balance.json()["data"] == []
    # Naming an organisation you do not belong to reveals nothing either.
    forged = await async_client.get(
        f"{API}/org/intents/{intent_id}", headers=headers_for(other_admin, org.id)
    )
    assert forged.status_code == 404


async def test_entitlement_and_role_are_required(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    unentitled, admin = await _org(db_async, apps=())
    response = await async_client.get(
        f"{API}/org/intents", headers=headers_for(admin, unentitled.id)
    )
    assert response.status_code == 403

    member = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Shop {uuid.uuid4().hex[:6]}",
        members=((member, MembershipRole.MEMBER),),
        apps=("payments",),
    )
    response = await async_client.post(
        f"{API}/org/intents", headers=headers_for(member, org.id), json=_body()
    )
    assert response.status_code == 403

    anonymous = await async_client.get(f"{API}/org/intents")
    assert anonymous.status_code == 401


# --- the ledger is append-only -----------------------------------------------------------


async def test_ledger_rejects_updates_and_deletes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    await _paid(async_client, org, admin)

    for statement in (
        "UPDATE payments.ledger_entry SET amount_minor = 1",
        "UPDATE payments.ledger_entry SET currency = 'USD'",
        "UPDATE payments.ledger_entry SET intent_id = NULL",
        "UPDATE payments.ledger_entry SET note = 'edited'",
        "DELETE FROM payments.ledger_entry",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            await db_async.execute(text(statement))
        await db_async.rollback()

    count = (
        await db_async.execute(select(func.count()).select_from(LedgerEntry))
    ).scalar_one()
    assert count == 1


async def test_ledger_signs_are_enforced_by_the_database(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid(async_client, org, admin)
    with pytest.raises(DBAPIError):
        await db_async.execute(
            text(
                "INSERT INTO payments.ledger_entry (id, organisation_id, intent_id, "
                "kind, amount_minor, currency, provider, created_at) VALUES "
                "(gen_random_uuid(), :org, :intent, 'refund', 100, 'XCD', 'manual', now())"
            ),
            {"org": org.id, "intent": intent_id},
        )
    await db_async.rollback()


# --- provider callbacks -----------------------------------------------------------------


async def _stripe_intent(
    client: httpx.AsyncClient, org: PlatformOrganisation, admin: User
) -> str:
    created = await _create(client, org, admin, provider="stripe")
    return created["intent"]["id"]


async def _ledger_count(db: AsyncSession) -> int:
    return (
        await db.execute(select(func.count()).select_from(LedgerEntry))
    ).scalar_one()


async def test_stripe_create_returns_a_hosted_checkout_and_sends_no_personal_data(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    created = await _create(
        async_client,
        org,
        admin,
        provider="stripe",
        customer_email="pat@example.com",
        metadata={"table": 4},
    )
    assert created["checkout_url"].startswith("https://checkout.stripe.com/")
    assert created["intent"]["status"] == "processing"
    sent = stripe_env.form(0)
    assert sent["mode"] == "payment"
    assert sent["line_items[0][price_data][currency]"] == "xcd"
    assert sent["line_items[0][price_data][unit_amount]"] == "5000"
    assert "pat@example.com" not in stripe_env.requests[0].content.decode()
    assert stripe_env.requests[0].headers["authorization"] == "Bearer sk_test_unit"

    # A retried request returns the same checkout without calling Stripe again.
    again = await _create(
        async_client,
        org,
        admin,
        provider="stripe",
        customer_email="pat@example.com",
        metadata={"table": 4},
        idempotency_key=(
            await db_async.execute(select(Intent.idempotency_key))
        ).scalar_one(),
    )
    assert again["checkout_url"] == created["checkout_url"]
    assert len(stripe_env.requests) == 1


async def test_stripe_is_unavailable_until_configured(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    response = await async_client.post(
        f"{API}/org/intents",
        headers=headers_for(admin, org.id),
        json=_body(provider="stripe"),
    )
    assert response.status_code == 503
    assert (
        await db_async.execute(select(func.count()).select_from(Intent))
    ).scalar_one() == 0


async def test_webhook_credits_once_and_replay_is_a_noop(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    body, headers = signed(checkout_completed(intent_id))

    first = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert first.status_code == 200
    replay = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert replay.status_code == 200
    # The same sale delivered under a different event id is not credited twice.
    other, other_headers = signed(checkout_completed(intent_id, event_id="evt_other"))
    again = await async_client.post(
        f"{API}/public/webhooks/stripe", content=other, headers=other_headers
    )
    assert again.status_code == 200

    assert await _ledger_count(db_async) == 1
    detail = (
        await async_client.get(
            f"{API}/org/intents/{intent_id}", headers=headers_for(admin, org.id)
        )
    ).json()
    assert detail["intent"]["status"] == "succeeded"
    assert detail["intent"]["captured_minor"] == 5000
    assert [a["status"] for a in detail["attempts"]] == ["succeeded"]


async def test_webhook_rejects_bad_signatures(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    event = checkout_completed(intent_id)
    url = f"{API}/public/webhooks/stripe"

    wrong_secret, headers = signed(event, secret="whsec_someone_else")
    assert (
        await async_client.post(url, content=wrong_secret, headers=headers)
    ).status_code == 400

    body, headers = signed(event)
    tampered = body.replace(b"5000", b"1")
    assert (
        await async_client.post(url, content=tampered, headers=headers)
    ).status_code == 400

    stale_body, stale_headers = signed(
        event, timestamp=int(utc_now().timestamp()) - 3600
    )
    assert (
        await async_client.post(url, content=stale_body, headers=stale_headers)
    ).status_code == 400

    assert (await async_client.post(url, content=body)).status_code == 400
    assert await _ledger_count(db_async) == 0


async def test_webhook_provider_and_configuration_errors(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    body, headers = signed({"id": "evt_x", "type": "ping", "data": {"object": {}}})
    assert (
        await async_client.post(
            f"{API}/public/webhooks/paypal", content=body, headers=headers
        )
    ).status_code == 404
    # A rail with no callbacks answers 400, never 2xx.
    assert (
        await async_client.post(
            f"{API}/public/webhooks/manual", content=body, headers=headers
        )
    ).status_code == 400
    # Unrelated verified events are accepted and dropped.
    assert (
        await async_client.post(
            f"{API}/public/webhooks/stripe", content=body, headers=headers
        )
    ).status_code == 200


async def test_webhook_refuses_a_misconfigured_secret(
    async_client: httpx.AsyncClient,
    stripe_env: StripeStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.payments.config import payments_settings

    body, headers = signed({"id": "evt_x", "type": "ping", "data": {"object": {}}})
    for secret in (None, "not-a-webhook-secret"):
        monkeypatch.setattr(payments_settings, "STRIPE_WEBHOOK_SECRET", secret)
        response = await async_client.post(
            f"{API}/public/webhooks/stripe", content=body, headers=headers
        )
        assert response.status_code == 503


async def test_webhook_does_not_credit_a_mismatched_amount(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    body, headers = signed(checkout_completed(intent_id, amount=1))
    response = await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code == 200
    assert await _ledger_count(db_async) == 0
    status = (
        await db_async.execute(
            select(Intent.status).where(Intent.id == uuid.UUID(intent_id))
        )
    ).scalar_one()
    assert status == "processing"


async def test_webhook_failure_marks_the_attempt_and_replays_safely(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    event = {
        "id": "evt_failed_1",
        "type": "payment_intent.payment_failed",
        "data": {
            "object": {
                "id": "pi_test_1",
                "metadata": {"intent_id": intent_id},
                "last_payment_error": {"code": "card_declined"},
            }
        },
    }
    body, headers = signed(event)
    for _ in range(2):
        response = await async_client.post(
            f"{API}/public/webhooks/stripe", content=body, headers=headers
        )
        assert response.status_code == 200
    detail = (
        await async_client.get(
            f"{API}/org/intents/{intent_id}", headers=headers_for(admin, org.id)
        )
    ).json()
    assert detail["intent"]["status"] == "failed"
    assert detail["attempts"][0]["status"] == "failed"
    assert detail["attempts"][0]["failure_code"] == "card_declined"
    assert await _ledger_count(db_async) == 0


async def test_app_refund_through_stripe_is_not_double_recorded_by_the_webhook(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    headers_org = headers_for(admin, org.id)
    intent_id = await _stripe_intent(async_client, org, admin)
    body, headers = signed(checkout_completed(intent_id))
    await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )

    refund = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=headers_org,
        json={"amount_minor": 2000, "reason": "Customer changed mind"},
    )
    assert refund.status_code == 201
    sent = stripe_env.form()
    assert sent["payment_intent"] == "pi_test_1"
    assert sent["amount"] == "2000"

    def charge_refunded(event_id: str, total: int) -> dict:
        return {
            "id": event_id,
            "type": "charge.refunded",
            "data": {
                "object": {
                    "payment_intent": "pi_test_1",
                    "amount": 5000,
                    "currency": "xcd",
                    "amount_refunded": total,
                }
            },
        }

    # Stripe tells us about the refund we made: nothing new to record.
    body, headers = signed(charge_refunded("evt_ref_1", 2000))
    assert (
        await async_client.post(
            f"{API}/public/webhooks/stripe", content=body, headers=headers
        )
    ).status_code == 200
    assert await _ledger_count(db_async) == 2

    # A further 1000 refunded from Stripe's dashboard is recorded once.
    body, headers = signed(charge_refunded("evt_ref_2", 3000))
    for _ in range(2):
        assert (
            await async_client.post(
                f"{API}/public/webhooks/stripe", content=body, headers=headers
            )
        ).status_code == 200
    assert await _ledger_count(db_async) == 3
    balance = await async_client.get(f"{API}/org/balance", headers=headers_org)
    assert balance.json()["data"][0]["owed_minor"] == 2000


async def test_provider_refund_failure_records_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession, stripe_env: StripeStub
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    body, headers = signed(checkout_completed(intent_id))
    await async_client.post(
        f"{API}/public/webhooks/stripe", content=body, headers=headers
    )
    stripe_env.fail_refund = True
    response = await async_client.post(
        f"{API}/org/intents/{intent_id}/refunds",
        headers=headers_for(admin, org.id),
        json={"reason": "Provider will fail"},
    )
    assert response.status_code == 502
    assert await _ledger_count(db_async) == 1


# --- administration ----------------------------------------------------------------------


async def test_admin_routes_are_superuser_only(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    today = utc_to_local(utc_now(), GRENADA).date()
    paths = (
        f"{API}/admin/intents",
        f"{API}/admin/ledger",
        f"{API}/admin/balances",
        f"{API}/admin/reconciliation?start_date={today}&end_date={today}",
        f"{API}/admin/reconciliation.csv?start_date={today}&end_date={today}",
    )
    for path in paths:
        response = await async_client.get(path, headers=headers_for(admin, org.id))
        assert response.status_code == 403, path
    payout = await async_client.post(
        f"{API}/admin/payouts",
        headers=headers_for(admin, org.id),
        json={
            "request_id": str(uuid.uuid4()),
            "organisation_id": org.id,
            "amount_minor": 1,
            "reference": "x",
        },
    )
    assert payout.status_code == 403


async def test_payout_cannot_exceed_the_balance_and_reduces_it(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, admin = await _org(db_async)
    await _paid(async_client, org, admin)
    url = f"{API}/admin/payouts"

    too_much = await async_client.post(
        url,
        headers=superuser_token_headers_async,
        json={
            "request_id": str(uuid.uuid4()),
            "organisation_id": org.id,
            "amount_minor": 5001,
            "reference": "BT-1",
        },
    )
    assert too_much.status_code == 409
    unknown = await async_client.post(
        url,
        headers=superuser_token_headers_async,
        json={
            "request_id": str(uuid.uuid4()),
            "organisation_id": "nope",
            "amount_minor": 1,
            "reference": "BT-1",
        },
    )
    assert unknown.status_code == 422
    other_currency = await async_client.post(
        url,
        headers=superuser_token_headers_async,
        json={
            "request_id": str(uuid.uuid4()),
            "organisation_id": org.id,
            "amount_minor": 1,
            "currency": "USD",
            "reference": "BT-1",
        },
    )
    assert other_currency.status_code == 409

    request_id = str(uuid.uuid4())
    body = {
        "request_id": request_id,
        "organisation_id": org.id,
        "amount_minor": 3000,
        "reference": "BT-2",
    }
    ok = await async_client.post(url, headers=superuser_token_headers_async, json=body)
    assert ok.status_code == 201
    # A double click or retry with the same request id returns the same entry.
    again = await async_client.post(
        url, headers=superuser_token_headers_async, json=body
    )
    assert again.status_code == 201
    assert again.json()["id"] == ok.json()["id"]
    # The same id for a different payout is refused.
    mismatch = await async_client.post(
        url,
        headers=superuser_token_headers_async,
        json={**body, "amount_minor": 1000},
    )
    assert mismatch.status_code == 409
    assert ok.json()["kind"] == "payout"
    assert ok.json()["amount_minor"] == -3000

    balances = await async_client.get(
        f"{API}/admin/balances", headers=superuser_token_headers_async
    )
    assert balances.json()["data"][0]["owed_minor"] == 2000
    ledger = await async_client.get(
        f"{API}/admin/ledger?kind=payout&organisation_id={org.id}",
        headers=superuser_token_headers_async,
    )
    assert ledger.json()["count"] == 1


async def test_reconciliation_totals_and_csv(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, admin = await _org(db_async)
    other, other_admin = await _org(db_async)
    first = await _paid(async_client, org, admin, amount_minor=10000)
    await _paid(async_client, org, admin, amount_minor=2500)
    await _paid(async_client, other, other_admin, amount_minor=700)
    await async_client.post(
        f"{API}/org/intents/{first}/refunds",
        headers=headers_for(admin, org.id),
        json={"amount_minor": 1500, "reason": "Short stay"},
    )
    await async_client.post(
        f"{API}/admin/payouts",
        headers=superuser_token_headers_async,
        json={
            "request_id": str(uuid.uuid4()),
            "organisation_id": org.id,
            "amount_minor": 4000,
            "reference": "BT-9",
        },
    )
    # A succeeded intent with no charge (as if the ledger write were lost).
    orphan = await _create(async_client, other, other_admin)
    await db_async.execute(
        text("UPDATE payments.intent SET status = 'succeeded' WHERE id = :id"),
        {"id": orphan["intent"]["id"]},
    )
    await db_async.commit()

    today = utc_to_local(utc_now(), GRENADA).date()
    window = (
        f"start_date={today - timedelta(days=1)}&end_date={today + timedelta(days=1)}"
    )
    report = (
        await async_client.get(
            f"{API}/admin/reconciliation?{window}",
            headers=superuser_token_headers_async,
        )
    ).json()
    rows = {row["organisation_id"]: row for row in report["rows"]}
    assert rows[org.id] == {
        "organisation_id": org.id,
        "currency": "XCD",
        "opening_minor": 0,
        "charges_minor": 12500,
        "refunds_minor": -1500,
        "fees_minor": 0,
        "adjustments_minor": 0,
        "payouts_minor": -4000,
        "closing_minor": 7000,
        "intents_succeeded": 2,
        "unmatched_intents": 0,
    }
    assert rows[other.id]["charges_minor"] == 700
    assert rows[other.id]["unmatched_intents"] == 1

    # One organisation only.
    single = (
        await async_client.get(
            f"{API}/admin/reconciliation?{window}&organisation_id={other.id}",
            headers=superuser_token_headers_async,
        )
    ).json()
    assert [row["organisation_id"] for row in single["rows"]] == [other.id]

    # After the period everything is opening balance and nothing moved.
    later = today + timedelta(days=2)
    after = (
        await async_client.get(
            f"{API}/admin/reconciliation?start_date={later}&end_date={later}",
            headers=superuser_token_headers_async,
        )
    ).json()
    after_row = {row["organisation_id"]: row for row in after["rows"]}[org.id]
    assert after_row["opening_minor"] == 7000
    assert after_row["closing_minor"] == 7000
    assert after_row["charges_minor"] == 0

    backwards = await async_client.get(
        f"{API}/admin/reconciliation?start_date={today}&end_date={today - timedelta(days=1)}",
        headers=superuser_token_headers_async,
    )
    assert backwards.status_code == 422

    csv = await async_client.get(
        f"{API}/admin/reconciliation.csv?{window}&organisation_id={org.id}",
        headers=superuser_token_headers_async,
    )
    assert csv.status_code == 200
    assert csv.headers["content-type"].startswith("text/csv")
    assert "attachment" in csv.headers["content-disposition"]
    lines = csv.text.split("\r\n")
    assert lines[0] == "Payments reconciliation"
    assert f"{org.id},XCD,0.00,125.00,-15.00,0.00,0.00,-40.00,70.00,2,0" in lines


async def test_admin_lists_every_organisations_intents(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    org, admin = await _org(db_async)
    other, other_admin = await _org(db_async)
    await _create(async_client, org, admin)
    await _create(async_client, other, other_admin)
    everything = await async_client.get(
        f"{API}/admin/intents", headers=superuser_token_headers_async
    )
    assert everything.json()["count"] == 2
    one = await async_client.get(
        f"{API}/admin/intents?organisation_id={other.id}",
        headers=superuser_token_headers_async,
    )
    assert one.json()["count"] == 1
