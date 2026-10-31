"""Organiser order desk, money edges: failures, concurrency, provider rails,
idempotency and the legacy cancel paths. Complements ``test_org_orders.py``."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any, cast

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.events import dependencies as deps
from src.events import order_fulfilment, order_payments, order_refunds, tickets
from src.events.exceptions import EventsConflict
from src.events.models import Admission, Listing, Order, OrderItem, Ticket
from src.main import app
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.exceptions import PaymentsConflictError
from src.payments.models import LedgerEntry, LedgerKind, Refund
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
    _pay_by_hand,
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
        reason_code="event_cancelled",
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


@pytest.mark.asyncio
async def test_grant_holding_members_never_get_the_buyer_email(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    from src.organisations import service as org_service
    from src.organisations.models import Membership, MembershipGrant, MembershipRole
    from tests.organisations.support import headers_for

    shop = await _shop_with_events(db_async, events_db, allocation=8)
    staff = await make_user(db_async)
    membership = await org_service.add_member(
        db_async,
        organisation_id=shop.organisation_id,
        user_id=staff.id,
        role=MembershipRole.MEMBER,
    )
    for role_key in ("events-manager", "events-refunds"):
        db_async.add(
            MembershipGrant(
                id=f"grant_{uuid.uuid4().hex}",
                membership_id=membership.id,
                organisation_id=shop.organisation_id,
                role_key=role_key,
                granted_by=shop.owner.id,
            )
        )
    await db_async.commit()
    assert isinstance(membership, Membership)

    buyers = [await make_user(db_async) for _ in range(5)]
    ids = [(await _order(b, shop)).json()["id"] for b in buyers]
    member = headers_for(staff, shop.organisation_id)
    admin = _h(shop)

    def keyed(headers: dict[str, str], key: str) -> dict[str, str]:
        return {**headers, "Idempotency-Key": key}

    async with await _desk() as client:
        # Order detail and manual payment (the member holds the till key via manager).
        for who, headers in (("member", member), ("admin", admin)):
            index = 0 if who == "member" else 1
            detail = await client.get(f"{ORG}/orders/{ids[index]}", headers=headers)
            assert detail.status_code == 200
            expected = None if who == "member" else buyers[1].email
            assert detail.json()["buyer_email"] == expected

            pay = await client.post(
                f"{ORG}/orders/{ids[index]}/manual-payments",
                headers=keyed(headers, f"email-pay-{who}-0001"),
                json={"method": "cash"},
            )
            assert pay.status_code == 201, pay.text
            assert pay.json()["buyer_email"] == expected

            refund = await client.post(
                f"{ORG}/orders/{ids[index]}/refunds",
                headers=keyed(headers, f"email-refund-{who}01"),
                json={"amount_minor": 100, "reason": "Part refund"},
            )
            assert refund.status_code == 201, refund.text
            assert refund.json()["buyer_email"] == expected

        paid = await _paid(db_async, shop)
        cancelled = await client.post(
            f"{ORG}/orders/{paid}/cancel", headers=member, json={"refund": "none"}
        )
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["order"]["buyer_email"] is None


@pytest.mark.asyncio
async def test_a_queued_refund_reports_its_real_state_and_rearms_a_dead_row(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    from src.auth.models import User

    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    order = await db_async.get(Order, uuid.UUID(order_id))
    actor = await db_async.get(User, shop.owner.id)
    assert order is not None
    assert actor is not None

    async def ask() -> str:
        outcome, _ = await order_refunds.request_refund(
            db_async,
            organisation_id=shop.organisation_id,
            order=order,
            actor=actor,
            reason="Secret organiser words",
            reason_code="order_cancelled",
            key=order_refunds.CANCEL_KEY,
        )
        await db_async.commit()
        return outcome

    async def row() -> outbox.Outbox:
        found = await db_async.scalar(
            select(outbox.Outbox)
            .where(outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC)
            .execution_options(populate_existing=True)
        )
        assert found is not None
        return found

    assert await ask() == "queued"
    first = await row()
    assert "reason" not in first.payload
    assert "Secret" not in str(first.payload)
    assert first.payload["reason_code"] == "order_cancelled"

    stripe_env.requests.clear()  # fixture used: the card rail is live
    first.status = "dead"
    first.attempts = 5
    await db_async.commit()
    assert await ask() == "queued"  # re-armed, not silently lost
    again = await row()
    assert (again.status, again.attempts) == ("pending", 0)

    await outbox.drain(
        db_async,
        only_topics={order_refunds.REQUESTED_TOPIC, "events.order_refunded"},
    )
    assert await _refund_rows(db_async, order_id) == 1
    assert (await _row(events_db, order_id)).status == "refunded"


@pytest.mark.asyncio
async def test_a_second_card_refund_waits_for_the_first_and_status_trusts_the_ledger(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    url = f"{ORG}/orders/{order_id}/refunds"
    async with await _desk() as client:
        first = await client.post(
            url,
            headers=_h(shop, "queue-key-000001"),
            json={"amount_minor": 3000, "reason": "Part one"},
        )
        assert first.status_code == 201, first.text
        assert first.json()["refund_status"] == "queued"
        second = await client.post(
            url,
            headers=_h(shop, "queue-key-000002"),
            json={"amount_minor": 3000, "reason": "Part two"},
        )
        assert second.status_code == 409  # 3000 + 3000 > 5000 would race
        # Nothing reached the provider inside either request.
        assert not any(r.url.path == "/v1/refunds" for r in stripe_env.requests)

        # The outbox gives up on the request; the order is then refunded another way
        # (the ledger now says everything is back): the status must say refunded.
        await db_async.execute(
            update(outbox.Outbox)
            .where(outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC)
            .values(status="dead", attempts=5)
        )
        await db_async.execute(
            update(Order)
            .where(Order.id == uuid.UUID(order_id))
            .values(refunded_minor=PRICE)
        )
        await db_async.commit()
        detail = await client.get(f"{ORG}/orders/{order_id}", headers=_h(shop))
    assert detail.json()["refund_status"] == "refunded"


@pytest.mark.asyncio
async def test_a_changed_refundable_amount_fails_the_queued_request_instead_of_cutting_it(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    from src.events.exceptions import EventsConflict

    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=4000, reason="Refunded elsewhere"
        ),
    )
    await db_async.commit()
    with pytest.raises(EventsConflict):
        await order_refunds.perform_requested(
            db_async,
            organisation_id=shop.organisation_id,
            order_id=uuid.UUID(order_id),
            intent_id=intent.id,
            refund_id=uuid.uuid4(),
            actor_id=shop.owner.id,
            reason_code="organiser_refund",
            amount_minor=2000,  # only 1000 is left
        )
    await db_async.rollback()
    assert await _refunded(db_async, order_id) == 4000


@pytest.mark.asyncio
async def test_a_deadlock_becomes_a_409_and_rolls_back() -> None:
    from sqlalchemy.exc import DBAPIError

    from src.events.exceptions import EventsConflict
    from src.events.service import org_orders

    class Deadlock(Exception):
        sqlstate = "40P01"

    class Session:
        rolled_back = False

        async def rollback(self) -> None:
            self.rolled_back = True

    session = Session()
    with pytest.raises(EventsConflict):
        async with org_orders.conflict_on_deadlock(cast(AsyncSession, session)):
            raise DBAPIError("UPDATE", {}, Deadlock("deadlock detected"))
    assert session.rolled_back

    other = Session()
    with pytest.raises(DBAPIError):
        async with org_orders.conflict_on_deadlock(cast(AsyncSession, other)):
            raise DBAPIError("UPDATE", {}, Exception("something else"))
    assert not other.rolled_back


@pytest.mark.asyncio
async def test_a_retried_refund_in_full_reuses_the_refund_id(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#513: the outbox retries ``refund_in_full`` after a lost response. Both
    attempts must carry the same refund id, so Stripe's ``refund-<id>`` idempotency
    key matches and the provider refunds once."""
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    sent: list[object] = []
    real_refund_intent = payments_service.refund_intent

    async def lost_then_retried(*args: Any, **kwargs: Any) -> Any:
        sent.append(kwargs.get("refund_id"))
        if len(sent) == 1:
            raise RuntimeError("the provider response was lost")
        return await real_refund_intent(*args, **kwargs)

    monkeypatch.setattr(payments_service, "refund_intent", lost_then_retried)
    for _ in range(2):
        try:
            await order_payments.refund_in_full(
                db_async,
                organisation_id=shop.organisation_id,
                order_id=uuid.UUID(order_id),
                reason="Event cancelled",
            )
        except RuntimeError:
            await db_async.rollback()
    await db_async.commit()

    expected = order_refunds.refund_id_for(
        uuid.UUID(order_id), order_payments.FULL_REFUND_KEY
    )
    assert sent == [expected, expected]
    assert sum(r.url.path == "/v1/refunds" for r in stripe_env.requests) == 1
    assert await _refund_rows(db_async, order_id) == 1


REQUEST_TOPIC = order_refunds.REQUESTED_TOPIC


def _crash_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lose the transaction after the refund has been recorded: the first
    ``apply_refund`` raises, so the caller's writes (the refund row, its ledger
    entry, the outbox status) roll back. Later calls run normally."""
    real = order_fulfilment.apply_refund
    lost = {"once": True}

    async def crash_once(*args: Any, **kwargs: Any) -> Any:
        if lost["once"]:
            lost["once"] = False
            raise RuntimeError("connection lost before commit")
        return await real(*args, **kwargs)

    monkeypatch.setattr(order_fulfilment, "apply_refund", crash_once)


async def _ledger_refunds(db: AsyncSession, order_id: str) -> list[int]:
    intent = await _intent(db, order_id)
    assert intent is not None
    rows = await db.scalars(
        select(LedgerEntry)
        .where(
            LedgerEntry.intent_id == intent.id,
            LedgerEntry.kind == LedgerKind.REFUND.value,
        )
        .execution_options(populate_existing=True)
    )
    return [entry.amount_minor for entry in rows]


@pytest.mark.asyncio
@pytest.mark.parametrize("report", ["charge_list", "refund_created"])
async def test_a_card_refund_lost_before_commit_is_counted_once_through_the_outbox(
    report: str,
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#512: Stripe refunds 2000, our transaction is lost before commit, Stripe's
    ``charge.refunded`` arrives, then the outbox retries the queued refund. The
    refund must be counted once and the order totals must match the provider."""
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    order = await db_async.get(Order, uuid.UUID(order_id))
    actor = await db_async.get(User, shop.owner.id)
    assert order is not None and actor is not None
    queued, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund",
        reason_code="organiser_refund",
        key="partial-1",
        amount_minor=2000,
    )
    await db_async.commit()
    assert queued == "queued"
    refund_id = order_refunds.refund_id_for(uuid.UUID(order_id), "partial-1")

    _crash_once(monkeypatch)
    db_async.expire_all()
    assert await outbox.drain(db_async, only_topics={REQUEST_TOPIC}) == 0
    # Stripe has the refund; our rows did not survive the lost transaction.
    assert await _refund_rows(db_async, order_id) == 0
    assert await _ledger_refunds(db_async, order_id) == []

    # Stripe reports it.
    intent = await _intent(db_async, order_id)
    assert intent is not None
    if report == "charge_list":
        # The charge.refunded shape with the refund listed on the charge.
        event = payments_conftest.charge_refunded(
            "evt_refund_lost",
            amount_refunded=2000,
            refunds=[
                payments_conftest.provider_refund(
                    "re_test_1", 2000, refund_id=refund_id, intent_id=intent.id
                )
            ],
        )
    else:
        # The refund.created shape: the refund object, with our metadata.
        event = payments_conftest.refund_event(
            "evt_refund_lost",
            "refund.created",
            payments_conftest.refund_object(
                "re_test_1", 2000, refund_id=refund_id, intent_id=intent.id
            ),
        )
    body, headers = payments_conftest.signed(event)
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200

    # The outbox retries the queued request (the retry is due an hour on).
    db_async.expire_all()
    await outbox.drain(
        db_async,
        now=utc_now() + timedelta(hours=1),
        only_topics={REQUEST_TOPIC, order_payments.REFUNDED_TOPIC},
    )

    sent = [i for i, r in enumerate(stripe_env.requests) if r.url.path == "/v1/refunds"]
    assert len(sent) == 1
    assert stripe_env.form(sent[0])["metadata[refund_id]"] == str(refund_id)
    assert await _refund_rows(db_async, order_id) == 1
    assert await _ledger_refunds(db_async, order_id) == [-2000]
    row = await _row(events_db, order_id)
    assert (row.collected_minor, row.refunded_minor, row.status) == (
        PRICE,
        2000,
        "confirmed",
    )
    assert [t.status for t in await _tickets(events_db, order_id)] == ["valid"]


@pytest.mark.asyncio
async def test_a_manual_refund_retried_after_a_lost_commit_is_recorded_once(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The manual rail has no provider to disagree with: a retry with the same key
    finds the refund row (if it committed) or creates it (if it did not). One row."""
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_by_hand(db_async, shop, order_id)

    async def ask() -> tuple[str, int]:
        # Re-read after a rollback: the rolled-back session expires its objects.
        order = await db_async.get(Order, uuid.UUID(order_id))
        actor = await db_async.get(User, shop.owner.id)
        assert order is not None and actor is not None
        return await order_refunds.request_refund(
            db_async,
            organisation_id=shop.organisation_id,
            order=order,
            actor=actor,
            reason="Partial refund",
            reason_code="organiser_refund",
            key="partial-1",
            amount_minor=2000,
        )

    _crash_once(monkeypatch)
    with pytest.raises(RuntimeError):
        await ask()
    await db_async.rollback()
    assert await _refund_rows(db_async, order_id) == 0

    assert await ask() == ("refunded", 2000)
    await db_async.commit()
    assert await _refund_rows(db_async, order_id) == 1
    assert await _ledger_refunds(db_async, order_id) == [-2000]
    row = await _row(events_db, order_id)
    assert (row.collected_minor, row.refunded_minor) == (PRICE, 2000)


@pytest.mark.asyncio
@pytest.mark.usefixtures("stripe_env")
async def test_an_order_cancel_with_nothing_left_to_refund_reports_not_due(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
) -> None:
    """#517 L2: the provider already holds nothing to refund (the money moved outside
    the order mirror), so the cancel must not claim a refund."""
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(reason="Refunded in the dashboard"),
    )
    await db_async.commit()

    response = await _cancel_order(shop, order_id, refund="full")
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "not_due"
    assert await _refund_rows(db_async, order_id) == 1


@pytest.mark.asyncio
@pytest.mark.usefixtures("stripe_env")
async def test_a_dead_refund_rearmed_after_the_money_moved_keeps_its_amount(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
) -> None:
    """#517 L4: a re-armed refund keeps the amount fixed when it was requested. The
    provider's idempotency key is bound to that amount, so a new amount under the
    same refund id would be refused, and a retry must not pay another amount."""
    from src.auth.models import User

    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    actor = await db_async.get(User, shop.owner.id)
    assert actor is not None

    async def ask() -> str:
        order = await db_async.get(Order, uuid.UUID(order_id))
        assert order is not None
        outcome, _ = await order_refunds.request_refund(
            db_async,
            organisation_id=shop.organisation_id,
            order=order,
            actor=actor,
            reason="Order cancelled by the organiser",
            reason_code="order_cancelled",
            key=order_refunds.CANCEL_KEY,
        )
        await db_async.commit()
        return outcome

    assert await ask() == "queued"  # the whole 5000, fixed now
    row = await db_async.scalar(
        select(outbox.Outbox).where(
            outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC
        )
    )
    assert row is not None
    row.status = "dead"
    row.attempts = 5
    await db_async.commit()

    # Money moves elsewhere (the dashboard) while the refund is dead.
    intent = await _intent(db_async, order_id)
    assert intent is not None
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=1000, reason="Dashboard partial"
        ),
    )
    await db_async.commit()

    assert await ask() == "queued"  # re-armed
    rearmed = await db_async.scalar(
        select(outbox.Outbox)
        .where(outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC)
        .execution_options(populate_existing=True)
    )
    assert rearmed is not None
    assert rearmed.payload["amount_minor"] == PRICE

    # Sent again, it asks for more than is left: it fails, and no second refund moves.
    await outbox.drain(db_async, only_topics={order_refunds.REQUESTED_TOPIC})
    assert await _ledger_refunds(db_async, order_id) == [-1000]
    assert await _refund_rows(db_async, order_id) == 1


@pytest.mark.asyncio
@pytest.mark.usefixtures("stripe_env")
async def test_a_re_arm_does_not_wait_for_a_send_in_progress(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
) -> None:
    """#517 L1: the outbox holds its row while it talks to the provider. A re-cancel
    must answer at once (409, try again) rather than wait behind a Stripe call while
    holding the order lock."""
    from src.auth.models import User

    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    actor = await db_async.get(User, shop.owner.id)
    assert actor is not None
    order = await db_async.get(Order, uuid.UUID(order_id))
    assert order is not None
    await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Order cancelled by the organiser",
        reason_code="order_cancelled",
        key=order_refunds.CANCEL_KEY,
    )
    await db_async.commit()
    row = await db_async.scalar(
        select(outbox.Outbox).where(
            outbox.Outbox.topic == order_refunds.REQUESTED_TOPIC
        )
    )
    assert row is not None
    row.status = "dead"
    await db_async.commit()

    async with events_db() as sender:  # the sender holds the row mid-send
        await sender.execute(
            select(outbox.Outbox).where(outbox.Outbox.id == row.id).with_for_update()
        )
        try:
            order = await db_async.get(Order, uuid.UUID(order_id))
            assert order is not None

            async def re_cancel() -> tuple[str, int]:
                return await order_refunds.request_refund(
                    db_async,
                    organisation_id=shop.organisation_id,
                    order=order,
                    actor=actor,
                    reason="Order cancelled by the organiser",
                    reason_code="order_cancelled",
                    key=order_refunds.CANCEL_KEY,
                )

            with pytest.raises(EventsConflict):
                await asyncio.wait_for(re_cancel(), timeout=10)
        finally:
            await db_async.rollback()
            await sender.rollback()


@pytest.mark.asyncio
@pytest.mark.usefixtures("stripe_env")
async def test_an_event_cancel_counts_an_order_with_a_refund_already_pending_apart(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
) -> None:
    """#517 L3: an order whose organiser refund is still waiting for the provider is
    neither queued nor failed by the event cancel. It is counted as pending."""
    from src.auth.models import User
    from src.events.service import event_cancel

    shop = await _shop_with_events(db_async, events_db, allocation=5)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    actor = await db_async.get(User, shop.owner.id)
    order = await db_async.get(Order, uuid.UUID(order_id))
    listing = await db_async.get(Listing, shop.listing_id)
    assert actor is not None and order is not None and listing is not None
    queued, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund",
        reason_code="organiser_refund",
        key="partial-1",
        amount_minor=1000,
    )
    await db_async.commit()
    assert queued == "queued"

    settled = await event_cancel.cancel_event_orders(
        db_async, actor, listing, "full", utc_now()
    )
    await db_async.commit()
    assert (settled.queued, settled.pending, settled.failed) == (0, 1, 0)


@pytest.mark.asyncio
async def test_a_card_refund_that_fails_at_the_provider_after_pending_is_reversed(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    """A refund the provider first reports pending, then failed: the order mirror and
    the ledger totals that settlement compares both drop back to nothing refunded."""
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    order = await db_async.get(Order, uuid.UUID(order_id))
    actor = await db_async.get(User, shop.owner.id)
    assert order is not None and actor is not None
    stripe_env.refund_status = "pending"
    queued, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund",
        reason_code="organiser_refund",
        key="partial-1",
        amount_minor=2000,
    )
    await db_async.commit()
    assert queued == "queued"
    db_async.expire_all()
    await outbox.drain(
        db_async, only_topics={REQUEST_TOPIC, order_payments.REFUNDED_TOPIC}
    )
    assert (await _row(events_db, order_id)).refunded_minor == 2000

    refund_id = order_refunds.refund_id_for(uuid.UUID(order_id), "partial-1")
    intent = await _intent(db_async, order_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.refund_event(
            "evt_refund_failed",
            "refund.failed",
            payments_conftest.refund_object(
                "re_test_1",
                2000,
                status="failed",
                refund_id=refund_id,
                intent_id=intent.id,
            ),
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    db_async.expire_all()
    await outbox.drain(
        db_async, only_topics={REQUEST_TOPIC, order_payments.REFUNDED_TOPIC}
    )

    row = await _row(events_db, order_id)
    assert (row.collected_minor, row.refunded_minor, row.status) == (
        PRICE,
        0,
        "confirmed",
    )
    async with events_db() as events:
        totals = await order_payments.ledger_totals(
            events,
            organisation_id=shop.organisation_id,
            listing_id=shop.listing_id,
        )
    assert totals == (PRICE, 0)


@pytest.mark.asyncio
async def test_a_refund_the_provider_failed_is_terminal_and_the_operator_refunds_again(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A queued refund whose provider refund already failed can never succeed under
    its id (Stripe replays the failure). The outbox row dead-letters at once, with
    the dead-letter signal, and the operator's own new refund goes through."""
    from src import operational_metrics

    dead: list[object] = []

    async def record_dead(*args: Any, **_kwargs: Any) -> None:
        dead.append(args)

    monkeypatch.setattr(operational_metrics, "outbox_dead_lettered", record_dead)
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    intent_id = intent.id
    refund_id = order_refunds.refund_id_for(uuid.UUID(order_id), "partial-1")
    stripe_env.refund_status = "pending"
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent_id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=2000, reason="Partial"
        ),
        refund_id=refund_id,
    )
    await db_async.commit()
    body, headers = payments_conftest.signed(
        payments_conftest.refund_event(
            "evt_refund_failed_terminal",
            "refund.failed",
            payments_conftest.refund_object(
                "re_test_1",
                2000,
                status="failed",
                refund_id=refund_id,
                intent_id=intent_id,
            ),
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200

    # The request for the same refund is still on the outbox (say, a lost response).
    order = await db_async.get(Order, uuid.UUID(order_id))
    actor = await db_async.get(User, shop.owner.id)
    assert order is not None and actor is not None
    queued, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund",
        reason_code="organiser_refund",
        key="partial-1",
        amount_minor=2000,
    )
    await db_async.commit()
    assert queued == "queued"
    db_async.expire_all()
    assert await outbox.drain(db_async, only_topics={REQUEST_TOPIC}) == 0
    row = await db_async.scalar(
        select(outbox.Outbox)
        .where(
            outbox.Outbox.topic == REQUEST_TOPIC,
            outbox.Outbox.dedupe_key == str(refund_id),
        )
        .execution_options(populate_existing=True)
    )
    assert row is not None
    assert (row.status, row.attempts) == ("dead", 1)
    assert len(dead) == 1

    # The operator recovers with a new refund (a new key, so a new refund id).
    stripe_env.refund_status = "succeeded"
    order = await db_async.get(Order, uuid.UUID(order_id))
    actor = await db_async.get(User, shop.owner.id)
    assert order is not None and actor is not None
    again, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund, again",
        reason_code="organiser_refund",
        key="partial-2",
        amount_minor=2000,
    )
    await db_async.commit()
    assert again == "queued"
    await outbox.drain(
        db_async, only_topics={REQUEST_TOPIC, order_payments.REFUNDED_TOPIC}
    )
    assert (await _row(events_db, order_id)).refunded_minor == 2000
    assert await _ledger_refunds(db_async, order_id) == [-2000, -2000]


@pytest.mark.asyncio
@pytest.mark.usefixtures("stripe_env")
async def test_the_event_cancel_response_reports_an_order_with_a_refund_already_pending(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
) -> None:
    """#517 L3: the cancel response says how many orders still wait for an earlier
    refund (``orders_pending``), and the activity row records the same count."""
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    order_id, _ = await _pending(db_async, shop)
    await _pay_stripe(db_async, async_client, order_id)
    actor = await db_async.get(User, shop.owner.id)
    order = await db_async.get(Order, uuid.UUID(order_id))
    assert actor is not None and order is not None
    queued, _ = await order_refunds.request_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order=order,
        actor=actor,
        reason="Partial refund",
        reason_code="organiser_refund",
        key="partial-1",
        amount_minor=1000,
    )
    await db_async.commit()
    assert queued == "queued"

    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True, "refund": "full"},
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (
        body["orders_pending"],
        body["orders_queued"],
        body["refunds_failed"],
    ) == (1, 0, 0)


@pytest.mark.asyncio
async def test_the_waiting_refund_lookup_can_use_the_pending_order_index(
    db_async: AsyncSession,
) -> None:
    """#517: the check for a refund already waiting on an order is served by
    ``outbox_pending_order_idx``, also under a generic prepared plan (bound topic and
    order id): its expression and partial predicate are SQL constants in the query.
    Sequential scans are switched off to ask the planner whether the index applies;
    the table is tiny in tests."""
    statement = select(outbox.Outbox.id).where(
        outbox.pending_for_order(order_refunds.REQUESTED_TOPIC, str(uuid.uuid4()))
    )
    sql = str(statement.compile(dialect=db_async.bind.dialect))
    assert "'pending'" in sql and "'order_id'" in sql
    await db_async.execute(sa_text("SET LOCAL plan_cache_mode = force_generic_plan"))
    await db_async.execute(sa_text("SET LOCAL enable_seqscan = off"))
    await db_async.execute(
        sa_text(f"PREPARE waiting_refund (varchar, varchar) AS {sql}")
    )
    plan = (
        (
            await db_async.execute(
                sa_text(
                    "EXPLAIN EXECUTE waiting_refund('events.order_refund_requested', 'x')"
                )
            )
        )
        .scalars()
        .all()
    )
    await db_async.execute(sa_text("DEALLOCATE waiting_refund"))
    await db_async.rollback()
    assert any("outbox_pending_order_idx" in line for line in plan), plan
