"""Organiser order desk (org zone): orders, attendees, manual payment, refund and
cancel with a refund choice. Money moves through the real payments core on the
manual rail; no network is touched."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Activity, Listing, Order, Ticket
from src.main import app
from src.organisations.models import MembershipRole
from src.payments.models import LedgerEntry
from src.utils.datetime import utc_now
from tests.events.support import SessionFactory
from tests.events.test_paid_orders import (
    PRICE,
    Shop,
    _intent,
    _order,
    _row,
    _shop,
    _tickets,
    make_user,
)
from tests.organisations.support import headers_for

ORG = "/api/v1/events/org"


async def _desk() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


async def _shop_with_events(
    db: AsyncSession, events_db: SessionFactory, *, allocation: int = 3
) -> Shop:
    return await _shop(
        db, events_db, allocation=allocation, apps=("payments", "events")
    )


def _h(shop: Shop, key: str | None = None) -> dict[str, str]:
    headers = headers_for(shop.owner, shop.organisation_id)
    if key:
        headers["Idempotency-Key"] = key
    return headers


async def _pending(
    db: AsyncSession, shop: Shop, quantity: int = 1
) -> tuple[str, object]:
    buyer = await make_user(db)
    response = await _order(buyer, shop, quantity)
    assert response.status_code == 201, response.text
    return response.json()["id"], buyer


async def _paid(
    db: AsyncSession, shop: Shop, quantity: int = 1, key: str | None = None
) -> str:
    order_id, _ = await _pending(db, shop, quantity)
    async with await _desk() as client:
        paid = await client.post(
            f"{ORG}/orders/{order_id}/manual-payments",
            headers=_h(shop, key or f"pay-{order_id}"),
            json={"method": "cash"},
        )
    assert paid.status_code == 201, paid.text
    return order_id


async def _listing_row(events_db: SessionFactory, shop: Shop) -> Listing:
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        return listing


async def _activity(events_db: SessionFactory, action: str) -> list[Activity]:
    async with events_db() as events:
        return list(
            await events.scalars(select(Activity).where(Activity.action == action))
        )


# --- reads ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orders_and_attendees_list_and_detail(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=10)
    paid_id = await _paid(db_async, shop, 2)
    pending_id, _ = await _pending(db_async, shop, 1)
    async with await _desk() as client:
        listed = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders", headers=_h(shop)
        )
        assert listed.status_code == 200, listed.text
        body = listed.json()
        assert body["count"] == 2
        assert {row["id"] for row in body["data"]} == {paid_id, pending_id}
        only = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=_h(shop),
            params={"status": "pending_payment", "size": 1},
        )
        assert [row["id"] for row in only.json()["data"]] == [pending_id]

        detail = await client.get(f"{ORG}/orders/{paid_id}", headers=_h(shop))
        assert detail.status_code == 200
        order = detail.json()
        assert order["status"] == "confirmed"
        assert order["ticket_count"] == 2
        assert order["active_ticket_count"] == 2
        assert order["items"][0]["quantity"] == 2
        assert order["payment"]["captured_minor"] == 2 * PRICE
        assert order["payment"]["refundable_minor"] == 2 * PRICE
        assert order["buyer_email"]

        attendees = await client.get(
            f"{ORG}/events/{shop.listing_id}/attendees", headers=_h(shop)
        )
        assert attendees.json()["count"] == 2
        assert {row["status"] for row in attendees.json()["data"]} == {"valid"}
        none = await client.get(
            f"{ORG}/events/{shop.listing_id}/attendees",
            headers=_h(shop),
            params={"status": "refunded"},
        )
        assert none.json()["count"] == 0


@pytest.mark.asyncio
async def test_another_organisations_event_and_order_are_404(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    async with await _desk() as client:
        for url in (
            f"{ORG}/events/{shop.listing_id}/orders",
            f"{ORG}/events/{shop.listing_id}/attendees",
            f"{ORG}/orders/{order_id}",
        ):
            assert (await client.get(url, headers=_h(other))).status_code == 404
        assert (
            await client.post(
                f"{ORG}/orders/{order_id}/refunds",
                headers=_h(other, "k-other-0001"),
                json={"reason": "not mine"},
            )
        ).status_code == 404
        assert (
            await client.post(
                f"{ORG}/events/{shop.listing_id}/cancel",
                headers=_h(other),
                json={"confirm": True},
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_access_needs_admin_membership_and_the_events_entitlement(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    staff = await make_user(db_async)
    outsider = await make_user(db_async)
    from src.organisations import service as org_service

    await org_service.add_member(
        db_async,
        organisation_id=shop.organisation_id,
        user_id=staff.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    url = f"{ORG}/events/{shop.listing_id}/orders"
    async with await _desk() as client:
        assert (
            await client.get(url, headers=headers_for(staff, shop.organisation_id))
        ).status_code == 403
        assert (
            await client.get(url, headers=headers_for(outsider, shop.organisation_id))
        ).status_code in (403, 404)
        assert (await client.get(url)).status_code == 401
    unentitled = await _shop(db_async, events_db, apps=("payments",))
    async with await _desk() as client:
        assert (
            await client.get(
                f"{ORG}/events/{unentitled.listing_id}/orders", headers=_h(unentitled)
            )
        ).status_code == 403


# --- manual payment ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_manual_payment_confirms_the_order_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    order_id, _ = await _pending(db_async, shop, 2)
    url = f"{ORG}/orders/{order_id}/manual-payments"
    payload = {"method": "bank_transfer", "reference": "TX-100"}
    async with await _desk() as client:
        assert (
            await client.post(url, headers=_h(shop), json=payload)
        ).status_code == 400  # Idempotency-Key is required
        first = await client.post(url, headers=_h(shop, "pay-key-0001"), json=payload)
        assert first.status_code == 201, first.text
        assert first.json()["status"] == "confirmed"
        assert len(first.json()["tickets"]) == 2
        assert first.json()["collected_minor"] == 2 * PRICE
        replay = await client.post(url, headers=_h(shop, "pay-key-0001"), json=payload)
        assert replay.status_code == 201
        assert replay.headers["Idempotency-Replayed"] == "true"
        assert replay.json()["id"] == order_id
        changed = await client.post(
            url, headers=_h(shop, "pay-key-0001"), json={"method": "cash"}
        )
        assert changed.status_code == 409
        again = await client.post(url, headers=_h(shop, "pay-key-0002"), json=payload)
        assert again.status_code == 409  # already paid; no second charge

    assert len(await _tickets(events_db, order_id)) == 2
    stored = await _row(events_db, order_id)
    assert stored.status == "confirmed"
    charges = list(
        await db_async.scalars(
            select(LedgerEntry)
            .where(LedgerEntry.kind == "charge")
            .execution_options(populate_existing=True)
        )
    )
    assert len(charges) == 1
    assert charges[0].created_by_user_id == shop.owner.id
    history = await _activity(events_db, "order.payment_recorded")
    assert len(history) == 1
    assert history[0].actor_id == shop.owner.id
    assert history[0].summary["method"] == "bank_transfer"
    assert "TX-100" not in str(history[0].summary)


@pytest.mark.asyncio
async def test_a_payment_cannot_be_recorded_on_an_expired_order_or_a_cancelled_event(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    async with events_db() as events:
        order = await events.get(Order, uuid.UUID(order_id))
        assert order is not None
        order.status = "expired"
        await events.commit()
    async with await _desk() as client:
        refused = await client.post(
            f"{ORG}/orders/{order_id}/manual-payments",
            headers=_h(shop, "pay-key-0003"),
            json={"method": "cash"},
        )
    assert refused.status_code == 409


# --- refunds -------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_full_refund_cancels_tickets_and_replays(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    order_id = await _paid(db_async, shop, 2)
    url = f"{ORG}/orders/{order_id}/refunds"
    async with await _desk() as client:
        partial = await client.post(
            url,
            headers=_h(shop, "refund-key-1"),
            json={"amount_minor": 1000, "reason": "Goodwill"},
        )
        assert partial.status_code == 201, partial.text
        assert partial.json()["status"] == "confirmed"
        assert partial.json()["refunded_minor"] == 1000
        assert {t["status"] for t in partial.json()["tickets"]} == {"valid"}
        too_much = await client.post(
            url,
            headers=_h(shop, "refund-key-2"),
            json={"amount_minor": 2 * PRICE, "reason": "Too much"},
        )
        assert too_much.status_code == 422 or too_much.status_code == 409
        full = await client.post(
            url, headers=_h(shop, "refund-key-3"), json={"reason": "Event issue"}
        )
        assert full.status_code == 201, full.text
        assert full.json()["status"] == "refunded"
        assert full.json()["refunded_minor"] == 2 * PRICE
        assert {t["status"] for t in full.json()["tickets"]} == {"refunded"}
        replay = await client.post(
            url, headers=_h(shop, "refund-key-3"), json={"reason": "Event issue"}
        )
        assert replay.headers["Idempotency-Replayed"] == "true"
        nothing = await client.post(
            url, headers=_h(shop, "refund-key-4"), json={"reason": "Again please"}
        )
        assert nothing.status_code == 409
    intent = await _intent(db_async, order_id)
    assert intent is not None
    refunds = list(
        await db_async.scalars(
            select(LedgerEntry)
            .where(LedgerEntry.intent_id == intent.id, LedgerEntry.kind == "refund")
            .execution_options(populate_existing=True)
        )
    )
    assert sum(-entry.amount_minor for entry in refunds) == 2 * PRICE
    assert len(await _activity(events_db, "order.refunded")) == 2


# --- cancel an order -----------------------------------------------------------------


async def _cancel_order(shop: Shop, order_id: str, **body: object) -> httpx.Response:
    async with await _desk() as client:
        return await client.post(
            f"{ORG}/orders/{order_id}/cancel", headers=_h(shop), json=body
        )


async def _refunded(db: AsyncSession, order_id: str) -> int:
    intent = await _intent(db, order_id)
    assert intent is not None
    entries = await db.scalars(
        select(LedgerEntry)
        .where(LedgerEntry.intent_id == intent.id, LedgerEntry.kind == "refund")
        .execution_options(populate_existing=True)
    )
    return sum(-entry.amount_minor for entry in entries)


@pytest.mark.asyncio
async def test_cancel_order_follow_policy_refunds_before_the_cutoff(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    response = await _cancel_order(shop, order_id)  # default follow_policy
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["refund_outcome"] == "refunded"
    assert body["order"]["status"] == "refunded"
    assert body["order"]["active_ticket_count"] == 0
    assert {t["status"] for t in body["order"]["tickets"]} == {"cancelled"}
    assert await _refunded(db_async, order_id) == 2 * PRICE
    again = await _cancel_order(shop, order_id)
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_cancel_order_follow_policy_keeps_money_inside_the_cutoff(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        listing.starts_at = utc_now() + timedelta(hours=5)
        listing.ends_at = utc_now() + timedelta(hours=9)
        await events.commit()
    kept = await _cancel_order(shop, order_id, refund="follow_policy")
    assert kept.status_code == 200, kept.text
    assert kept.json()["refund_outcome"] == "kept"
    assert kept.json()["order"]["status"] == "confirmed"
    assert kept.json()["order"]["active_ticket_count"] == 0
    assert kept.json()["order"]["ticket_count"] == 1
    assert await _refunded(db_async, order_id) == 0
    assert (await _cancel_order(shop, order_id)).status_code == 409  # already cancelled

    # "full" overrides the policy even inside the cutoff.
    other = await _paid(db_async, shop)
    forced = await _cancel_order(shop, other, refund="full")
    assert forced.json()["refund_outcome"] == "refunded"
    assert await _refunded(db_async, other) == PRICE


@pytest.mark.asyncio
async def test_cancel_order_none_keeps_the_money_and_frees_the_seat(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=1)
    order_id = await _paid(db_async, shop)
    response = await _cancel_order(shop, order_id, refund="none")
    assert response.status_code == 200
    assert response.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0
    async with events_db() as events:
        valid = await events.scalars(
            select(Ticket).where(
                Ticket.listing_id == shop.listing_id, Ticket.status == "valid"
            )
        )
        assert list(valid) == []
    # The seat is back on sale.
    assert (await _order(await make_user(db_async), shop, 1)).status_code == 201


@pytest.mark.asyncio
async def test_cancelling_an_unpaid_order_cancels_its_intent(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    response = await _cancel_order(shop, order_id, refund="full")
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "not_due"
    assert response.json()["order"]["status"] == "expired"
    intent = await _intent(db_async, order_id)
    assert intent is not None
    assert intent.status == "cancelled"


@pytest.mark.asyncio
async def test_a_failed_order_refund_aborts_the_cancel(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.events import order_refunds
    from src.events.exceptions import EventsConflict

    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)

    async def boom(*_args: object, **_kwargs: object) -> int:
        raise EventsConflict("provider down")

    monkeypatch.setattr(order_refunds, "refund_order", boom)
    response = await _cancel_order(shop, order_id, refund="full")
    assert response.status_code == 409
    stored = await _row(events_db, order_id)
    assert stored.status == "confirmed"
    assert {t.status for t in await _tickets(events_db, order_id)} == {"valid"}


# --- cancel an event -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_event_follow_policy_refunds_paid_orders_and_releases_unpaid(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=10)
    first = await _paid(db_async, shop, 2)
    second = await _paid(db_async, shop, 1)
    unpaid, _ = await _pending(db_async, shop, 1)
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True},  # refund defaults to follow_policy
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tickets_cancelled"] == 3
    assert body["orders_refunded"] == 2
    assert body["orders_released"] == 1
    assert body["orders_kept"] == 0
    assert body["refunds_failed"] == 0
    assert await _refunded(db_async, first) == 2 * PRICE
    assert await _refunded(db_async, second) == PRICE
    assert (await _row(events_db, first)).status == "refunded"
    assert (await _row(events_db, unpaid)).status == "expired"
    assert (await _listing_row(events_db, shop)).status == "cancelled"
    history = await _activity(events_db, "listing.cancelled")
    assert history[0].summary["refund"] == "follow_policy"


@pytest.mark.asyncio
async def test_cancel_event_none_keeps_the_money(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop)
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True, "refund": "none"},
        )
        assert response.status_code == 200
        assert response.json()["orders_kept"] == 1
        assert response.json()["orders_refunded"] == 0
        repeat = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True},
        )
        assert repeat.status_code == 409
        bad = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True, "refund": "maybe"},
        )
        assert bad.status_code == 422
    assert await _refunded(db_async, order_id) == 0
    # The money can still be handed back later from the order.
    async with await _desk() as client:
        later = await client.post(
            f"{ORG}/orders/{order_id}/refunds",
            headers=_h(shop, "later-key-001"),
            json={"reason": "Changed our mind"},
        )
    assert later.status_code == 201, later.text
    assert await _refunded(db_async, order_id) == PRICE


def test_the_cancel_body_defaults_to_follow_policy() -> None:
    from src.events import schemas

    assert schemas.CancelEvent(confirm=True).refund == "follow_policy"
    assert schemas.CancelEvent(confirm=True, refund="none").refund == "none"
