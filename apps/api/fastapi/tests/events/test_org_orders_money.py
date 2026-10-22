"""Organiser order desk, money edges: failures, concurrency, provider rails,
idempotency and the legacy cancel paths. Complements ``test_org_orders.py``."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.events import dependencies as deps
from src.events import order_refunds, tickets
from src.events.models import Admission, Listing, Order, OrderItem, Ticket
from src.main import app
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.exceptions import PaymentsConflictError
from src.payments.models import LedgerEntry, Refund
from src.utils.datetime import utc_now
from tests.events.support import BASE, SessionFactory, client_as
from tests.events.test_events_api import _listing_payload
from tests.events.test_org_orders import (
    ORG,
    _cancel_order,
    _desk,
    _h,
    _paid,
    _pending,
    _refunded,
    _shop_with_events,
)
from tests.events.test_paid_orders import (
    PRICE,
    WEBHOOK,
    Shop,
    _intent,
    _order,
    _row,
    _tickets,
    make_user,
)
from tests.payments import conftest as payments_conftest

stripe_env = payments_conftest.stripe_env


async def _refund_rows(db: AsyncSession, order_id: str) -> int:
    intent = await _intent(db, order_id)
    assert intent is not None
    return int(
        await db.scalar(
            select(func.count())
            .select_from(Refund)
            .where(Refund.intent_id == intent.id)
            .execution_options(populate_existing=True)
        )
        or 0
    )


async def _outlet_order(events_db: SessionFactory, shop: Shop) -> str:
    async with events_db() as events:
        order = Order(
            listing_id=shop.listing_id,
            user_id=None,
            channel="outlet",
            payment_method="cash_outlet",
            status="confirmed",
            total_minor=PRICE,
            collected_minor=PRICE,
            buyer_name="Walk-in",
        )
        events.add(order)
        await events.flush()
        events.add(
            OrderItem(
                order_id=order.id,
                tier_id=shop.tier_id,
                quantity=1,
                unit_price_minor=PRICE,
            )
        )
        events.add(
            Ticket(
                order_id=order.id,
                listing_id=shop.listing_id,
                tier_id=shop.tier_id,
                code=tickets.new_code(),
            )
        )
        await events.commit()
        return str(order.id)


async def _pay_stripe(
    db: AsyncSession, client: httpx.AsyncClient, order_id: str
) -> None:
    intent = await _intent(db, order_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=PRICE)
    )
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    db.expire_all()
    await outbox.drain(db, only_topics={"events.order_paid"})


# --- cross-organisation, idempotency, partial refunds ---------------------------------


@pytest.mark.asyncio
async def test_payment_and_order_cancel_of_another_organisation_are_404(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    async with await _desk() as client:
        pay = await client.post(
            f"{ORG}/orders/{order_id}/manual-payments",
            headers=_h(other, "x-org-key-0001"),
            json={"method": "cash"},
        )
        cancel = await client.post(
            f"{ORG}/orders/{order_id}/cancel", headers=_h(other), json={}
        )
    assert pay.status_code == cancel.status_code == 404
    assert (await _row(events_db, order_id)).status == "pending_payment"


@pytest.mark.asyncio
async def test_a_reused_key_with_another_body_is_409_for_payment_and_refund(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    pending, _ = await _pending(db_async, shop)
    paid = await _paid(db_async, shop)
    async with await _desk() as client:
        url = f"{ORG}/orders/{pending}/manual-payments"
        first = await client.post(
            url, headers=_h(shop, "reuse-pay-0001"), json={"method": "cash"}
        )
        assert first.status_code == 201
        other = await client.post(
            url,
            headers=_h(shop, "reuse-pay-0001"),
            json={"method": "bank_transfer", "reference": "B-1"},
        )
        assert other.status_code == 409

        rurl = f"{ORG}/orders/{paid}/refunds"
        one = await client.post(
            rurl,
            headers=_h(shop, "reuse-refund-01"),
            json={"amount_minor": 500, "reason": "Goodwill"},
        )
        assert one.status_code == 201
        two = await client.post(
            rurl,
            headers=_h(shop, "reuse-refund-01"),
            json={"amount_minor": 600, "reason": "Goodwill"},
        )
        assert two.status_code == 409
    assert await _refunded(db_async, paid) == 500


@pytest.mark.asyncio
async def test_partial_refunds_add_up_and_over_refund_is_rejected(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    url = f"{ORG}/orders/{order_id}/refunds"
    async with await _desk() as client:
        for index, amount in enumerate((1000, 2000)):
            response = await client.post(
                url,
                headers=_h(shop, f"partial-key-{index:03d}"),
                json={"amount_minor": amount, "reason": "Part refund"},
            )
            assert response.status_code == 201, response.text
        assert response.json()["refunded_minor"] == 3000
        assert response.json()["refund_status"] == "partial"
        over = await client.post(
            url,
            headers=_h(shop, "partial-key-over"),
            json={"amount_minor": PRICE - 3000 + 1, "reason": "Too much"},
        )
        assert over.status_code == 409
    assert await _refunded(db_async, order_id) == 3000
    assert await _refund_rows(db_async, order_id) == 2


@pytest.mark.asyncio
async def test_cancel_after_a_partial_refund_refunds_only_the_remainder(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    async with await _desk() as client:
        await client.post(
            f"{ORG}/orders/{order_id}/refunds",
            headers=_h(shop, "remainder-key-01"),
            json={"amount_minor": 1200, "reason": "Part refund"},
        )
    response = await _cancel_order(shop, order_id, refund="follow_policy")
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "refunded"
    assert response.json()["order"]["status"] == "refunded"
    assert await _refunded(db_async, order_id) == PRICE  # not PRICE + 1200


# --- cancel edge cases ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_outlet_cash_order_cancels_only_without_a_refund(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _outlet_order(events_db, shop)
    refused = await _cancel_order(shop, order_id)  # follow_policy
    assert refused.status_code == 409
    assert (await _cancel_order(shop, order_id, refund="full")).status_code == 409
    done = await _cancel_order(shop, order_id, refund="none")
    assert done.status_code == 200, done.text
    assert done.json()["refund_outcome"] == "not_due"
    assert done.json()["order"]["active_ticket_count"] == 0
    assert (await _cancel_order(shop, order_id, refund="none")).status_code == 409


@pytest.mark.asyncio
async def test_an_order_with_an_admitted_ticket_cannot_be_cancelled(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    ticket = (await _tickets(events_db, order_id))[0]
    async with events_db() as events:
        events.add(
            Admission(
                ticket_id=ticket.id,
                listing_id=shop.listing_id,
                admitted_by=shop.owner.id,
            )
        )
        await events.commit()
    refused = await _cancel_order(shop, order_id, refund="full")
    assert refused.status_code == 409
    assert await _refunded(db_async, order_id) == 0


# --- stripe / provider rail -----------------------------------------------------------


@pytest.mark.asyncio
async def test_a_manual_payment_cannot_be_recorded_on_a_card_order(
    db_async: AsyncSession,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    assert intent.provider == "stripe"
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/orders/{order_id}/manual-payments",
            headers=_h(shop, "stripe-pay-0001"),
            json={"method": "cash"},
        )
    assert response.status_code == 409
    assert (await _row(events_db, order_id)).status == "pending_payment"
    assert not stripe_env.paid


@pytest.mark.asyncio
async def test_event_cancel_queues_card_refunds_and_the_outbox_sends_them_once(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    refunds_before = sum(r.url.path == "/v1/refunds" for r in stripe_env.requests)

    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert (body["orders_queued"], body["orders_refunded"]) == (1, 0)
        # Nothing was sent to the provider inside the request.
        assert (
            sum(r.url.path == "/v1/refunds" for r in stripe_env.requests)
            == refunds_before
        )
        detail = await client.get(f"{ORG}/orders/{order_id}", headers=_h(shop))
        assert detail.json()["refund_status"] == "queued"

        # A failing provider: the row backs off, nothing is stored, no orphan refund.
        stripe_env.fail_refund = True
        db_async.expire_all()
        await outbox.drain(db_async, only_topics={order_refunds.REQUESTED_TOPIC})
        assert await _refund_rows(db_async, order_id) == 0
        row = await db_async.scalar(
            select(outbox.Outbox)
            .where(outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC)
            .execution_options(populate_existing=True)
        )
        assert row is not None
        assert row.attempts == 1
        assert row.status == "pending"

        # The provider recovers: one refund, however often the row is replayed.
        stripe_env.fail_refund = False
        await db_async.execute(
            update(outbox.Outbox)
            .where(outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC)
            .values(next_attempt_at=utc_now() - timedelta(minutes=1))
        )
        await db_async.commit()
        await outbox.drain(
            db_async,
            only_topics={order_refunds.REQUESTED_TOPIC, "events.order_refunded"},
        )
        assert await _refund_rows(db_async, order_id) == 1
        assert await _refunded(db_async, order_id) == PRICE
        assert (await _row(events_db, order_id)).status == "refunded"
        detail = await client.get(f"{ORG}/orders/{order_id}", headers=_h(shop))
        assert detail.json()["refund_status"] == "refunded"

    # Replaying the handler itself (a crash after the provider call) is a no-op.
    intent = await _intent(db_async, order_id)
    assert intent is not None
    again = await order_refunds.perform_requested(
        db_async,
        organisation_id=shop.organisation_id,
        order_id=uuid.UUID(order_id),
        intent_id=intent.id,
        refund_id=order_refunds.refund_id_for(
            uuid.UUID(order_id), order_refunds.CANCEL_KEY
        ),
        actor_id=shop.owner.id,
        reason="Event cancelled by the organiser",
        amount_minor=None,
    )
    assert again == "duplicate"
    assert await _refund_rows(db_async, order_id) == 1


@pytest.mark.asyncio
async def test_the_same_refund_id_never_reaches_the_provider_twice(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    refund_id = order_refunds.refund_id_for(uuid.UUID(order_id), "k")
    payload = payment_schemas.PaymentRefundCreate(reason="Because")
    for _ in range(2):
        await payments_service.refund_intent(
            db_async,
            organisation_id=shop.organisation_id,
            intent_id=intent.id,
            actor=None,
            payload=payload,
            refund_id=refund_id,
        )
        await db_async.commit()
    assert sum(r.url.path == "/v1/refunds" for r in stripe_env.requests) == 1
    assert await _refund_rows(db_async, order_id) == 1


# --- manual-rail failure inside an event cancel ---------------------------------------


@pytest.mark.asyncio
async def test_a_failed_refund_in_an_event_cancel_does_not_stop_the_others(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    bad = await _paid(db_async, shop)
    good = await _paid(db_async, shop)
    bad_intent = await _intent(db_async, bad)
    assert bad_intent is not None
    original = payments_service.refund_intent

    async def flaky(session: AsyncSession, **kwargs: Any) -> Any:
        if kwargs["intent_id"] == bad_intent.id:
            raise PaymentsConflictError("provider down")
        return await original(session, **kwargs)

    monkeypatch.setattr(payments_service, "refund_intent", flaky)
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["orders_refunded"], body["refunds_failed"]) == (1, 1)
    assert await _refunded(db_async, good) == PRICE
    assert await _refunded(db_async, bad) == 0
    assert await _refund_rows(db_async, bad) == 0  # no orphan refund row
    assert (await _row(events_db, bad)).status == "confirmed"
    assert (await _row(events_db, good)).status == "refunded"
    # The failed one can be refunded afterwards from its order.
    monkeypatch.setattr(payments_service, "refund_intent", original)
    async with await _desk() as client:
        retry = await client.post(
            f"{ORG}/orders/{bad}/refunds",
            headers=_h(shop, "retry-key-00001"),
            json={"reason": "Event cancelled"},
        )
    assert retry.status_code == 201, retry.text
    assert await _refunded(db_async, bad) == PRICE


# --- concurrency ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_manual_payments_with_different_keys_charge_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)

    async def pay(key: str) -> int:
        async with await _desk() as client:
            response = await client.post(
                f"{ORG}/orders/{order_id}/manual-payments",
                headers=_h(shop, key),
                json={"method": "cash"},
            )
            return response.status_code

    codes = await asyncio.gather(pay("race-pay-000001"), pay("race-pay-000002"))
    assert sorted(codes) == [201, 409]
    charges = await db_async.scalar(
        select(func.count())
        .select_from(LedgerEntry)
        .where(LedgerEntry.kind == "charge")
        .execution_options(populate_existing=True)
    )
    assert charges == 1
    assert len(await _tickets(events_db, order_id)) == 1


@pytest.mark.asyncio
async def test_event_cancel_racing_a_manual_payment_ends_consistent(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)

    async def cancel() -> int:
        async with await _desk() as client:
            return (
                await client.post(
                    f"{ORG}/events/{shop.listing_id}/cancel",
                    headers=_h(shop),
                    json={"confirm": True},
                )
            ).status_code

    async def pay() -> int:
        async with await _desk() as client:
            return (
                await client.post(
                    f"{ORG}/orders/{order_id}/manual-payments",
                    headers=_h(shop, "race-cancel-pay-1"),
                    json={"method": "cash"},
                )
            ).status_code

    cancelled, paid = await asyncio.gather(cancel(), pay())
    assert cancelled == 200
    assert paid in (201, 409)
    order = await _row(events_db, order_id)
    if paid == 201:  # the money arrived first, so the cancel handed it back
        assert order.status == "refunded"
        assert await _refunded(db_async, order_id) == PRICE
    else:  # the cancel came first and released the hold
        assert order.status == "expired"
        assert await _refunded(db_async, order_id) == 0


@pytest.mark.asyncio
async def test_event_cancel_racing_an_order_cancel_refunds_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)

    async def cancel_event() -> int:
        async with await _desk() as client:
            return (
                await client.post(
                    f"{ORG}/events/{shop.listing_id}/cancel",
                    headers=_h(shop),
                    json={"confirm": True},
                )
            ).status_code

    event_code, order_code = await asyncio.gather(
        cancel_event(), _cancel_order(shop, order_id, refund="full")
    )
    assert event_code == 200
    assert order_code.status_code in (200, 409)
    assert await _refunded(db_async, order_id) == PRICE
    assert await _refund_rows(db_async, order_id) == 1
    assert (await _row(events_db, order_id)).status == "refunded"


# --- legacy cancel paths --------------------------------------------------------------


def _as_organiser(shop: Shop) -> httpx.AsyncClient:
    client = client_as(shop.owner, organiser=True)
    app.dependency_overrides[deps.organiser_scope] = lambda: [shop.organisation_id]
    return client


@pytest.mark.asyncio
async def test_the_legacy_cancel_route_moves_no_money_by_default(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    unpaid, _ = await _pending(db_async, shop)
    async with _as_organiser(shop) as client:
        response = await client.post(
            f"{BASE}/manage/{shop.listing_id}/cancel", json={"confirm": True}
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["orders_refunded"], body["orders_queued"], body["orders_kept"]) == (
        0,
        0,
        1,
    )
    assert body["orders_released"] == 1
    assert await _refunded(db_async, order_id) == 0
    assert (await _row(events_db, order_id)).status == "confirmed"
    assert (await _row(events_db, unpaid)).status == "expired"
    assert {t.status for t in await _tickets(events_db, order_id)} == {"cancelled"}


@pytest.mark.asyncio
async def test_saving_a_listing_as_cancelled_moves_no_money_and_locks_orders(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    unpaid, _ = await _pending(db_async, shop)
    listing = await _listing_row(events_db, shop)
    payload = _listing_payload(
        title=listing.title,
        summary=listing.summary,
        venue=listing.venue,
        admission="ticketed",
        status="cancelled",
        starts_at=f"{listing.starts_at.isoformat()}Z",
        ends_at=f"{listing.ends_at.isoformat()}Z",
        tiers=[
            {
                "id": str(shop.tier_id),
                "name": "General",
                "price_minor": PRICE,
                "allocation": 3,
                "per_account_limit": 4,
            }
        ],
    )
    async with _as_organiser(shop) as client:
        response = await client.put(
            f"{BASE}/manage/listings/{shop.listing_id}", json=payload
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert await _refunded(db_async, order_id) == 0
    assert {t.status for t in await _tickets(events_db, order_id)} == {"cancelled"}
    assert (await _row(events_db, unpaid)).status == "expired"  # hold released


async def _listing_row(events_db: SessionFactory, shop: Shop) -> Listing:
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        return listing


@pytest.mark.asyncio
async def test_the_buyer_email_is_on_the_detail_for_the_organising_admin_only(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    from src.organisations import service as org_service
    from src.organisations.models import MembershipRole
    from tests.organisations.support import headers_for

    shop = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    buyer = await make_user(db_async)
    order_id = (await _order(buyer, shop)).json()["id"]
    staff = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=shop.organisation_id,
        user_id=staff.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    url = f"{ORG}/orders/{order_id}"
    async with await _desk() as client:
        mine = await client.get(url, headers=_h(shop))
        assert mine.status_code == 200
        assert mine.json()["buyer_email"] == buyer.email
        assert (await client.get(url, headers=_h(other))).status_code == 404
        member = await client.get(url, headers=headers_for(staff, shop.organisation_id))
        assert member.status_code == 403
        assert buyer.email not in member.text
        listed = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders", headers=_h(shop)
        )
        assert buyer.email not in listed.text  # lists carry no email
