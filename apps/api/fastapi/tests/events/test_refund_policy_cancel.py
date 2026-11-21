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
from src.events.exceptions import EventsConflict, EventsInvalid
from src.events.models import Listing, Order, TicketTier
from src.events.service import organiser_admin
from src.utils.datetime import utc_now
from tests.events.support import BASE, SessionFactory, client_as
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
from tests.events.test_paid_orders import PRICE, Shop, _row, _tickets, make_user


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
    response = await _cancel_order(
        shop, order_id, initiated_by="buyer"
    )  # follow_policy
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
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
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
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
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
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
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
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert response.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0


@pytest.mark.asyncio
async def test_a_null_cutoff_uses_the_platform_default_on_the_money_path(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_start(events_db, shop, hours=24)  # inside the default 48 hours
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
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
    await _cancel_order(shop, order_id, initiated_by="buyer")
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
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
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


@pytest.mark.asyncio
async def test_a_pending_order_blocks_a_stricter_change(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _pending(db_async, shop, 1)  # waiting for payment: the buyer saw the terms
    message = await _conflict(events_db, shop, _upsert(refund_policy="no_refunds"))
    assert "refunds can't be switched off" in message


@pytest.mark.asyncio
async def test_moving_no_refunds_to_refundable_with_any_fee_is_allowed(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    await _set_terms(events_db, shop, refund_policy="no_refunds")
    await _guard(
        events_db,
        shop,
        _upsert(
            refund_policy="refundable",
            refund_cutoff_hours=720,
            cancellation_fee_type="fixed",
            cancellation_fee_value=2_000,
        ),
    )


@pytest.mark.asyncio
async def test_a_stricter_terms_save_through_the_update_is_refused_and_leaves_no_change(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)
    body = _upsert(
        status="cancelled",
        refund_policy="no_refunds",
        tiers=[
            {
                "id": str(shop.tier_id),
                "name": "General",
                "price_minor": PRICE,
                "allocation": 3,
            }
        ],
    )
    with pytest.raises(EventsConflict):
        async with events_db() as events:
            await organiser_admin.update_listing(
                events, shop.owner, shop.listing_id, body, [shop.organisation_id]
            )
    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        assert listing.status == "published"
        assert listing.refund_policy == "refundable"


@pytest.mark.asyncio
async def test_saving_an_event_as_cancelled_refunds_every_buyer_in_full(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    # Terms that would keep money for an organiser cancel: a fee and no refunds.
    await _set_terms(
        events_db,
        shop,
        refund_policy="no_refunds",
        cancellation_fee_type="fixed",
        cancellation_fee_value=1_000,
    )
    body = _upsert(
        status="cancelled",
        tiers=[
            {
                "id": str(shop.tier_id),
                "name": "General",
                "price_minor": PRICE,
                "allocation": 3,
            }
        ],
    )
    async with events_db() as events:
        await organiser_admin.update_listing(
            events, shop.owner, shop.listing_id, body, [shop.organisation_id]
        )
    assert await _refunded(db_async, order_id) == 2 * PRICE
    assert (await _row(events_db, order_id)).status == "refunded"
    assert (await _row(events_db, order_id)).cancellation_fee_kept_minor == 0


@pytest.mark.asyncio
async def test_an_organiser_cancel_is_refunded_in_full_even_inside_the_cutoff(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_start(events_db, shop, hours=5)
    await _set_terms(events_db, shop, refund_policy="no_refunds")
    response = await _cancel_order(shop, order_id)  # organiser, follow_policy
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "refunded"
    assert await _refunded(db_async, order_id) == PRICE
    assert (await _activity_summary(events_db))["initiated_by"] == "organiser"


async def _activity_summary(events_db: SessionFactory) -> dict[str, Any]:
    rows = await _activity(events_db, "order.cancelled")
    return rows[-1].summary


@pytest.mark.asyncio
async def test_an_organiser_keep_needs_a_reason_and_a_buyer_keep_does_not(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    refused = await _cancel_order(shop, order_id, refund="none")
    assert refused.status_code == 422, refused.text
    assert await _refunded(db_async, order_id) == 0
    assert (await _row(events_db, order_id)).status == "confirmed"  # nothing changed
    blank = await _cancel_order(shop, order_id, refund="none", reason="   ")
    assert blank.status_code == 422

    kept = await _cancel_order(
        shop, order_id, refund="none", reason="Venue kept the fee"
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["refund_outcome"] == "kept"
    assert await _refunded(db_async, order_id) == 0
    assert (await _activity_summary(events_db))["initiated_by"] == "organiser"


@pytest.mark.asyncio
async def test_a_buyer_cancel_keeps_money_under_the_policy_without_a_reason(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    await _set_terms(events_db, shop, refund_policy="no_refunds")
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert response.status_code == 200, response.text
    assert response.json()["refund_outcome"] == "kept"
    summary = await _activity_summary(events_db)
    assert summary["initiated_by"] == "buyer"


@pytest.mark.asyncio
async def test_a_fixed_fee_counts_only_the_paid_tickets_of_a_mixed_order(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    async with events_db() as events:
        free = TicketTier(
            listing_id=shop.listing_id,
            name="Free",
            price_minor=0,
            allocation=5,
            per_account_limit=4,
        )
        events.add(free)
        await events.commit()
        free_tier_id = free.id
    buyer = await make_user(db_async)
    async with client_as(buyer) as client:
        created = await client.post(
            f"{BASE}/listings/{shop.slug}/orders",
            json={
                "items": [
                    {"tier_id": str(shop.tier_id), "quantity": 1},
                    {"tier_id": str(free_tier_id), "quantity": 1},
                ]
            },
        )
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    async with await _desk() as client:
        paid = await client.post(
            f"{ORG}/orders/{order_id}/manual-payments",
            headers=_h(shop, "mixed-pay-001"),
            json={"method": "cash"},
        )
    assert paid.status_code == 201, paid.text
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert response.status_code == 200, response.text
    # One paid ticket pays the 1000 fee; the free ticket carries none.
    assert await _refunded(db_async, order_id) == PRICE - 1_000
    assert response.json()["order"]["cancellation_fee_kept_minor"] == 1_000


@pytest.mark.asyncio
async def test_a_partly_refunded_order_through_follow_policy_refunds_the_rest_less_the_fee(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    async with await _desk() as client:
        partial = await client.post(
            f"{ORG}/orders/{order_id}/refunds",
            headers=_h(shop, "partial-first-001"),
            json={"amount_minor": 1_000, "reason": "Goodwill refund"},
        )
    assert partial.status_code == 201, partial.text
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    response = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert response.status_code == 200, response.text
    # 10000 paid, 1000 already back: 9000 left, less 2 x 1000 for the two tickets.
    assert await _refunded(db_async, order_id) == 1_000 + 7_000
    assert response.json()["order"]["cancellation_fee_kept_minor"] == 2_000
    assert response.json()["order"]["refund_status"] == "partial"


@pytest.mark.asyncio
async def test_a_replayed_cancel_does_not_refund_again(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    first = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert first.status_code == 200, first.text
    assert await _refunded(db_async, order_id) == 2 * PRICE - 2 * 1_000
    replay = await _cancel_order(shop, order_id, initiated_by="buyer")
    assert replay.status_code == 409
    assert await _refunded(db_async, order_id) == 2 * PRICE - 2 * 1_000


@pytest.mark.asyncio
async def test_refunding_the_kept_remainder_clears_the_kept_amount(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=3)
    order_id = await _paid(db_async, shop, 2)
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    await _cancel_order(shop, order_id, initiated_by="buyer")
    assert (await _row(events_db, order_id)).cancellation_fee_kept_minor == 2_000
    async with await _desk() as client:
        later = await client.post(
            f"{ORG}/orders/{order_id}/refunds",
            headers=_h(shop, "fee-later-clears"),
            json={"reason": "Goodwill: fee waived"},
        )
    assert later.status_code == 201, later.text
    assert (await _row(events_db, order_id)).cancellation_fee_kept_minor == 0


def test_a_receipt_names_the_fee_kept_on_a_partial_refund() -> None:
    _, body = emails.order_refunded(
        buyer_name="Ana",
        title="Paid <Fete>",
        order_ref="ABCD1234",
        refund_minor=4_000,
        currency="XCD",
        full=False,
        card=False,
        event_cancelled=False,
        tickets_valid=False,
        fee_kept_minor=1_000,
    )
    assert "XCD 10.00 was kept as the cancellation fee" in body
    assert "under the event's refund policy" in body
    assert "<Fete>" not in body  # the title is still escaped
    _, full = emails.order_refunded(
        buyer_name="Ana",
        title="Paid Fete",
        order_ref="ABCD1234",
        refund_minor=5_000,
        currency="XCD",
        full=True,
        card=False,
        event_cancelled=False,
        fee_kept_minor=1_000,
    )
    assert "cancellation fee" not in full


@pytest.mark.asyncio
async def test_a_buyer_cancel_that_keeps_money_with_none_needs_a_reason(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    refused = await _cancel_order(shop, order_id, refund="none", initiated_by="buyer")
    assert refused.status_code == 422, refused.text
    assert await _refunded(db_async, order_id) == 0
    assert (await _row(events_db, order_id)).status == "confirmed"  # nothing changed
    kept = await _cancel_order(
        shop,
        order_id,
        refund="none",
        initiated_by="buyer",
        reason="Buyer changed plans",
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["refund_outcome"] == "kept"


@pytest.mark.asyncio
async def test_a_tier_only_save_that_lowers_a_paid_tier_below_the_fixed_fee_is_422(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _paid(db_async, shop, 1)  # a paid order exists
    await _set_terms(
        events_db, shop, cancellation_fee_type="fixed", cancellation_fee_value=1_000
    )
    # Only the tiers change: the paid tier drops from PRICE to 500, below the fee.
    body = _upsert(
        status="published",
        tiers=[
            {
                "id": str(shop.tier_id),
                "name": "General",
                "price_minor": 500,
                "allocation": 3,
            }
        ],
    )
    with pytest.raises(EventsInvalid) as caught:
        async with events_db() as events:
            await organiser_admin.update_listing(
                events, shop.owner, shop.listing_id, body, [shop.organisation_id]
            )
    assert caught.value.status_code == 422
    async with events_db() as events:
        tier = await events.get(TicketTier, shop.tier_id)
        assert tier is not None
        assert tier.price_minor == PRICE  # the save was refused, nothing changed


@pytest.mark.asyncio
async def test_an_event_cancel_with_none_refunds_a_paid_online_order_in_full(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    from tests.events.test_org_orders_money import _as_organiser

    # The organiser route (OrgEventCancel) with refund none.
    org_shop = await _shop_with_events(db_async, events_db)
    org_order = await _paid(db_async, org_shop, 1)
    async with await _desk() as client:
        org_response = await client.post(
            f"{ORG}/events/{org_shop.listing_id}/cancel",
            headers=_h(org_shop),
            json={"confirm": True, "refund": "none"},
        )
    assert org_response.status_code == 200, org_response.text
    assert await _refunded(db_async, org_order) == PRICE

    # The legacy route (CancelEvent) with refund none.
    legacy_shop = await _shop_with_events(db_async, events_db)
    legacy_order = await _paid(db_async, legacy_shop, 1)
    async with _as_organiser(legacy_shop) as client:
        legacy_response = await client.post(
            f"{BASE}/manage/{legacy_shop.listing_id}/cancel",
            json={"confirm": True, "refund": "none"},
        )
    assert legacy_response.status_code == 200, legacy_response.text
    assert await _refunded(db_async, legacy_order) == PRICE


@pytest.mark.asyncio
async def test_the_terms_guard_counts_an_order_that_has_collected_money(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    # Fully refunded (status refunded): it was paid, so the terms are locked.
    refunded_shop = await _shop_with_events(db_async, events_db, allocation=3)
    refunded_order = await _paid(db_async, refunded_shop, 1)
    async with await _desk() as client:
        full = await client.post(
            f"{ORG}/orders/{refunded_order}/refunds",
            headers=_h(refunded_shop, "guard-full-001"),
            json={"reason": "Full refund"},
        )
    assert full.status_code == 201, full.text
    assert (await _row(events_db, refunded_order)).status == "refunded"
    message = await _conflict(
        events_db, refunded_shop, _upsert(refund_policy="no_refunds")
    )
    assert "refunds can't be switched off" in message

    # Partly refunded (still confirmed, collected money left): also locked.
    partial_shop = await _shop_with_events(db_async, events_db, allocation=3)
    partial_order = await _paid(db_async, partial_shop, 2)
    async with await _desk() as client:
        part = await client.post(
            f"{ORG}/orders/{partial_order}/refunds",
            headers=_h(partial_shop, "guard-part-001"),
            json={"amount_minor": 1_000, "reason": "Part refund"},
        )
    assert part.status_code == 201, part.text
    assert (await _row(events_db, partial_order)).status == "confirmed"
    message = await _conflict(
        events_db, partial_shop, _upsert(refund_policy="no_refunds")
    )
    assert "refunds can't be switched off" in message


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
