"""Refund policy and cancellation fee on the money paths (manual rail).

An organiser's order cancel with a fee keeps the fee and refunds the rest in one
refund. An event cancel ignores the fee. Once a paid order exists, the listing's
refund terms can only be made more generous.
"""

import importlib
import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.events import emails
from src.events import schemas as event_schemas
from src.events.exceptions import EventsConflict
from src.events.models import Listing, Order
from src.events.service import organiser_admin
from src.utils.datetime import utc_now
from tests.events.support import SessionFactory
from tests.events.test_org_orders import (
    ORG,
    _activity,
    _cancel_order,
    _desk,
    _h,
    _paid,
    _pending,
    _refunded,
    _shop_with_events,
)
from tests.events.test_paid_orders import PRICE, Shop, _row, _tickets


async def _set_terms(events_db: SessionFactory, shop: Shop, **fields: Any) -> None:
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        for key, value in fields.items():
            setattr(listing, key, value)
        await events.commit()


async def _set_start(events_db: SessionFactory, shop: Shop, hours: float) -> None:
    starts = utc_now() + timedelta(hours=hours)
    await _set_terms(
        events_db, shop, starts_at=starts, ends_at=starts + timedelta(hours=4)
    )


# --- order cancel: the fee is kept and the rest refunded in one refund -----------------


@pytest.mark.asyncio
async def test_a_fixed_fee_per_ticket_is_kept_and_the_rest_refunded(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    response = await _cancel_order(shop, order_id)  # follow_policy
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["refund_outcome"] == "refunded"
    assert await _refunded(db_async, order_id) == 2 * PRICE - 2 * 1_000
    stored = await _row(events_db, order_id)
    # A partial refund: the tickets stay cancelled and the order is not refunded.
    assert stored.status == "confirmed"
    assert {t.status for t in await _tickets(events_db, order_id)} == {"cancelled"}
    history = await _activity(events_db, "order.cancelled")
    assert history[-1].summary["refund_minor"] == 2 * PRICE - 2 * 1_000
    assert history[-1].summary["fee_minor"] == 2 * 1_000


@pytest.mark.asyncio
async def test_a_percent_fee_is_kept_and_the_rest_refunded(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(
        events_db, shop, cancellation_fee_type="percent", cancellation_fee_value=10
    )
    response = await _cancel_order(shop, order_id)
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "refunded"
    assert await _refunded(db_async, order_id) == PRICE - PRICE // 10
    assert (await _row(events_db, order_id)).status == "confirmed"


@pytest.mark.asyncio
async def test_a_fee_at_least_the_amount_keeps_everything(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=PRICE
    )
    response = await _cancel_order(shop, order_id)
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0
    assert (await _row(events_db, order_id)).status == "confirmed"


@pytest.mark.asyncio
async def test_no_refunds_policy_keeps_the_money(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(events_db, shop, refund_policy="no_refunds")
    response = await _cancel_order(shop, order_id)
    assert response.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0


@pytest.mark.asyncio
async def test_a_custom_cutoff_keeps_the_money_inside_it(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(events_db, shop, refund_cutoff_hours=72)
    await _set_start(events_db, shop, hours=60)
    response = await _cancel_order(shop, order_id)
    assert response.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0


@pytest.mark.asyncio
async def test_a_null_cutoff_uses_the_platform_default_on_the_money_path(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_start(events_db, shop, hours=24)  # inside the default 48 hours
    response = await _cancel_order(shop, order_id)
    assert response.json()["refund_outcome"] == "kept"


@pytest.mark.asyncio
async def test_a_manual_refund_of_the_kept_remainder_is_still_possible(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """The organiser can hand back the fee later from the order desk."""
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    await _cancel_order(shop, order_id)
    async with await _desk() as client:
        later = await client.post(
            f"{ORG}/orders/{order_id}/refunds",
            headers=_h(shop, "fee-later-001"),
            json={"reason": "Goodwill: fee waived"},
        )
    assert later.status_code == 201, later.text
    assert await _refunded(db_async, order_id) == PRICE
    assert (await _row(events_db, order_id)).status == "refunded"


@pytest.mark.asyncio
async def test_a_fee_kept_on_cancel_is_recorded_on_the_order_and_in_settlement(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    settlement_service = importlib.import_module("src.events.service.settlement")

    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    response = await _cancel_order(shop, order_id)
    assert response.status_code == 200, response.text
    detail = response.json()["order"]
    assert detail["cancellation_fee_kept_minor"] == 2_000
    assert detail["refund_status"] == "partial"  # kept money is not a full refund
    assert detail["payment"]["refundable_minor"] == 2_000  # still a ledger amount
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        online = await settlement_service._online_payments(events, listing)
    assert online.cancellation_fee_kept_minor == 2_000
    assert online.collected_minor - online.refunded_minor == 2_000  # retained revenue


# --- event cancel: the fee is ignored ---------------------------------------------------


@pytest.mark.asyncio
async def test_an_event_cancel_refunds_in_full_and_ignores_the_fee(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    await _set_terms(
        events_db,
        shop,
        refund_policy="no_refunds",
        cancellation_fee_type="percent",
        cancellation_fee_value=100,
    )
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True},  # follow_policy
        )
    assert response.status_code == 200, response.text
    assert response.json()["orders_refunded"] == 1
    assert response.json()["orders_kept"] == 0
    assert await _refunded(db_async, order_id) == 2 * PRICE


# --- once a paid order exists, the terms can only get more generous ---------------------


def _upsert(**changes: Any) -> event_schemas.ListingUpsert:
    start = utc_now() + timedelta(days=10)
    body: dict[str, Any] = {
        "title": "Paid Fete",
        "summary": "All inclusive",
        "parish": "st-george",
        "venue": "Stadium",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "ticketed",
        "capacity": 1000,
        "tiers": [{"name": "General", "price_minor": PRICE, "allocation": 3}],
    }
    body.update(changes)
    return event_schemas.ListingUpsert(**body)


async def _guard(
    events_db: SessionFactory, shop: Shop, body: event_schemas.ListingUpsert
) -> None:
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        await organiser_admin.enforce_paid_terms(events, listing, body)


async def _conflict(
    events_db: SessionFactory, shop: Shop, body: event_schemas.ListingUpsert
) -> str:
    with pytest.raises(EventsConflict) as caught:
        await _guard(events_db, shop, body)
    assert caught.value.status_code == 409
    return caught.value.message


@pytest.mark.asyncio
async def test_without_paid_orders_any_terms_can_be_set(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _pending(db_async, shop, 1)  # unpaid holds do not count
    await _guard(
        events_db,
        shop,
        _upsert(
            refund_policy="no_refunds",
            refund_cutoff_hours=500,
            cancellation_fee_type="percent",
            cancellation_fee_value=100,
        ),
    )


@pytest.mark.asyncio
async def test_a_paid_order_blocks_a_stricter_policy(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    message = await _conflict(events_db, shop, _upsert(refund_policy="no_refunds"))
    assert message == (
        "Paid orders already exist for this event, so refunds can't be switched off. "
        "You can only make the refund policy more generous: set it to refundable."
    )


@pytest.mark.asyncio
async def test_a_paid_order_blocks_a_longer_cutoff_and_null_is_the_default(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    message = await _conflict(events_db, shop, _upsert(refund_cutoff_hours=72))
    assert message == (
        "Paid orders already exist for this event, so the refund cutoff can only get "
        "shorter. It is 48 hours now; a longer cutoff isn't allowed."
    )
    # Setting the default explicitly is the same cutoff, so it is allowed.
    await _guard(events_db, shop, _upsert(refund_cutoff_hours=48))


@pytest.mark.asyncio
async def test_a_paid_order_blocks_adding_or_raising_the_fee(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    fee_message = (
        "Paid orders already exist for this event, so the cancellation fee can't go "
        "up. It can only go down or stay the same, and a fixed and percent fee can't "
        "be swapped unless the fee becomes 0."
    )
    assert (
        await _conflict(
            events_db,
            shop,
            _upsert(cancellation_fee_type="fixed", cancellation_fee_value=100),
        )
        == fee_message
    )
    assert (
        await _conflict(
            events_db,
            shop,
            _upsert(cancellation_fee_type="percent", cancellation_fee_value=5),
        )
        == fee_message
    )


@pytest.mark.asyncio
async def test_a_paid_order_blocks_a_higher_fee_and_a_switch_between_types(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=500
    )
    higher = _upsert(cancellation_fee_type="fixed", cancellation_fee_value=800)
    assert "cancellation fee can't go up" in await _conflict(events_db, shop, higher)
    switch = _upsert(cancellation_fee_type="percent", cancellation_fee_value=10)
    assert "cancellation fee can't go up" in await _conflict(events_db, shop, switch)


@pytest.mark.asyncio
async def test_a_paid_order_allows_loosening_the_terms(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    await _set_terms(
        events_db,
        shop,
        refund_policy="no_refunds",
        refund_cutoff_hours=72,
        cancellation_fee_type="fixed",
        cancellation_fee_value=800,
    )
    # Each of these is more generous than the stored terms.
    await _guard(events_db, shop, _upsert(refund_policy="refundable"))
    await _guard(events_db, shop, _upsert(refund_cutoff_hours=24))
    await _guard(
        events_db,
        shop,
        _upsert(cancellation_fee_type="fixed", cancellation_fee_value=300),
    )
    await _guard(events_db, shop, _upsert(cancellation_fee_type="none"))
    await _guard(
        events_db,
        shop,
        _upsert(cancellation_fee_type="percent", cancellation_fee_value=0),
    )


@pytest.mark.asyncio
async def test_an_expired_order_does_not_lock_the_terms(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop, 1)
    async with events_db() as events:
        order = await events.get(Order, uuid.UUID(order_id))
        assert order is not None
        order.status = "expired"
        await events.commit()
    await _guard(events_db, shop, _upsert(refund_policy="no_refunds"))


# --- receipt wording for a refund on a cancelled ticket --------------------------------


def test_a_partial_refund_on_cancelled_tickets_does_not_say_they_stay_valid() -> None:
    _, body = emails.order_refunded(
        buyer_name="Ana",
        title="Paid Fete",
        order_ref="ABCD1234",
        refund_minor=4500,
        currency="XCD",
        full=False,
        card=False,
        event_cancelled=False,
        tickets_valid=False,
    )
    assert "stay valid" not in body
    assert "tickets on this order are cancelled" in body


def test_a_partial_refund_with_valid_tickets_still_says_they_stay_valid() -> None:
    _, body = emails.order_refunded(
        buyer_name="Ana",
        title="Paid Fete",
        order_ref="ABCD1234",
        refund_minor=4500,
        currency="XCD",
        full=False,
        card=False,
        event_cancelled=False,
    )
    assert "your tickets stay valid" in body
