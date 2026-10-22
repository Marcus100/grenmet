"""Refund receipts and 24-hour reminders for Events (launch audit P1-3, P1-4).

Nothing is sent: the emails are rows on the platform outbox (topic ``email.send``).
"""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.events import emails, reminders
from src.events import outbox as events_outbox
from src.events.models import Listing, Rsvp, Ticket
from src.notifications.config import notification_settings
from src.outbox import Outbox
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from tests.events.support import SessionFactory
from tests.events.test_org_orders import ORG, _desk, _h, _paid, _shop_with_events
from tests.events.test_paid_orders import (
    PRICE,
    Shop,
    _drain,
    _intent,
    _paid_order,
    _row,
    _shop,
    _tickets,
    make_user,
)

NOW = datetime.fromisoformat("2026-10-22T12:00:00")


async def _emails(db: AsyncSession, prefix: str) -> list[Outbox]:
    db.expire_all()
    return list(
        await db.scalars(
            select(Outbox)
            .where(Outbox.topic == "email.send", Outbox.dedupe_key.like(f"{prefix}%"))
            .order_by(Outbox.dedupe_key)
        )
    )


# --- refund receipts ----------------------------------------------------------------


async def _refund(
    db: AsyncSession, shop: Shop, order_id: str, amount: int | None = None
) -> None:
    intent = await _intent(db, order_id)
    assert intent is not None
    await payments_service.refund_intent(
        db,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=amount, reason="Buyer asked"
        ),
    )
    await db.commit()
    await _drain(db)


@pytest.mark.asyncio
async def test_a_full_refund_queues_one_receipt_even_when_replayed(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=2)
    order_id = await _paid_order(db_async, shop, 2)
    await _refund(db_async, shop, order_id)

    rows = await _emails(db_async, "events-order-refunded:")
    assert len(rows) == 1
    payload = rows[0].payload
    assert payload["transactional"] is True
    assert payload["subject"] == "Refund for Paid Fete"
    html = payload["html"]
    assert "XCD 100.00" in html
    assert "whole order" in html
    assert "Paid Fete" in html
    assert order_id[:8].upper() in html
    assert "5 to 10 business days" not in html  # the manual rail: no card timeline
    refund_id = rows[0].dedupe_key.split(":", 1)[1]

    from src.events import order_fulfilment

    for _ in range(2):  # the same message delivered again, and a second reaction
        await order_fulfilment.apply_refund(
            db_async,
            organisation_id=shop.organisation_id,
            order_id=uuid.UUID(order_id),
            refund_id=uuid.UUID(refund_id),
        )
        await db_async.commit()
    assert len(await _emails(db_async, "events-order-refunded:")) == 1


@pytest.mark.asyncio
async def test_a_partial_refund_says_the_tickets_stay_valid(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = await _paid_order(db_async, shop, 2)
    await _refund(db_async, shop, order_id, PRICE)
    (row,) = await _emails(db_async, "events-order-refunded:")
    assert "XCD 50.00" in row.payload["html"]
    assert "partial refund" in row.payload["html"]
    assert "whole order" not in row.payload["html"]
    assert {t.status for t in await _tickets(events_db, order_id)} == {"valid"}
    # A second partial refund is its own receipt (a different refund id).
    await _refund(db_async, shop, order_id, PRICE)
    assert len(await _emails(db_async, "events-order-refunded:")) == 2


@pytest.mark.asyncio
async def test_the_inline_manual_refund_and_its_reaction_queue_one_receipt(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id = await _paid(db_async, shop, 1)
    async with await _desk() as client:
        done = await client.post(
            f"{ORG}/orders/{order_id}/cancel",
            headers=_h(shop),
            json={"refund": "full"},
        )
    assert done.status_code == 200, done.text
    assert len(await _emails(db_async, "events-order-refunded:")) == 1
    await _drain(db_async)  # the events.order_refunded reaction runs on top
    assert len(await _emails(db_async, "events-order-refunded:")) == 1


@pytest.mark.asyncio
async def test_a_cancelled_event_refund_receipt_names_the_cancellation(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=5)
    await _paid(db_async, shop, 1)
    async with await _desk() as client:
        done = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_h(shop),
            json={"confirm": True, "refund": "full"},
        )
    assert done.status_code == 200, done.text
    (row,) = await _emails(db_async, "events-order-refunded:")
    assert "organiser cancelled" in row.payload["html"]
    # The one cancel message (notification) states the refund rule, not the amount.
    note = events_outbox.REFUND_NOTES
    cancelled = list(
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == events_outbox.TOPIC,
                Outbox.dedupe_key == f"listing.cancelled:{shop.listing_id}",
            )
        )
    )
    assert [r.payload["refund"] for r in cancelled] == ["refund"]
    assert "refunded" in note["refund"] and "not refunded" in note["keep"]


def test_the_card_receipt_gives_the_timeline_and_amounts_are_escaped() -> None:
    _, html = emails.order_refunded(
        buyer_name="<b>Ann</b>",
        title="Fete",
        order_ref="AB12CD34",
        refund_minor=123456,
        currency="XCD",
        full=True,
        card=True,
        event_cancelled=False,
    )
    assert "XCD 1,234.56" in html
    assert "5 to 10 business days" in html
    assert "&lt;b&gt;Ann" in html


# --- reminders ----------------------------------------------------------------------


async def _rsvp_shop(
    db: AsyncSession, events_db: SessionFactory, starts_at: datetime
) -> tuple[Shop, uuid.UUID]:
    shop = await _shop(db, events_db)
    user = await make_user(db)
    async with events_db() as events:
        await events.execute(
            update(Listing)
            .where(Listing.id == shop.listing_id)
            .values(starts_at=starts_at, ends_at=starts_at + timedelta(hours=4))
        )
        events.add(Rsvp(listing_id=shop.listing_id, user_id=user.id))
        await events.commit()
    return shop, user.id


async def _run(db: AsyncSession, now: datetime = NOW) -> int:
    queued = await reminders.enqueue_due_reminders(db, now=now)
    await db.commit()
    return queued


@pytest.mark.asyncio
async def test_the_window_is_23_to_24_hours_ahead(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    inside_start, _ = await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=23))
    await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=24))
    await _rsvp_shop(
        db_async, events_db, NOW + timedelta(hours=23) - timedelta(seconds=1)
    )
    last, _ = await _rsvp_shop(
        db_async, events_db, NOW + timedelta(hours=24) - timedelta(seconds=1)
    )
    assert await _run(db_async) == 2
    keys = {
        r.dedupe_key.split(":")[1] for r in await _emails(db_async, "events-reminder:")
    }
    assert keys == {str(inside_start.listing_id), str(last.listing_id)}


@pytest.mark.asyncio
async def test_the_email_has_grenada_time_venue_and_my_tickets_link(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    # 12:00 UTC + 23.5h = 11:30 UTC next day = 7:30 AM in Grenada (UTC-4).
    await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=23, minutes=30))
    assert await _run(db_async) == 1
    (row,) = await _emails(db_async, "events-reminder:")
    html = row.payload["html"]
    assert "Friday 23 October 2026, 7:30 AM (Grenada time)" in html
    assert "Stadium" in html
    assert "/me/tickets" in html
    assert row.payload["subject"] == "Reminder: Paid Fete is coming up"
    assert row.payload["transactional"] is True


@pytest.mark.asyncio
async def test_a_rerun_queues_nothing_but_a_new_start_time_reminds_again(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop, _ = await _rsvp_shop(
        db_async, events_db, NOW + timedelta(hours=23, minutes=30)
    )
    assert await _run(db_async) == 1
    assert await _run(db_async) == 0
    assert await _run(db_async, NOW + timedelta(minutes=10)) == 0  # same start
    # Postponed to a later time: the new start time is a new reminder.
    moved = NOW + timedelta(days=3, hours=23, minutes=30)
    async with events_db() as events:
        await events.execute(
            update(Listing)
            .where(Listing.id == shop.listing_id)
            .values(starts_at=moved, ends_at=moved + timedelta(hours=4))
        )
        await events.commit()
    assert await _run(db_async, NOW + timedelta(days=3)) == 1
    assert len(await _emails(db_async, "events-reminder:")) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["cancelled", "draft"])
async def test_unpublished_events_are_skipped(
    db_async: AsyncSession, events_db: SessionFactory, status: str
) -> None:
    shop, _ = await _rsvp_shop(
        db_async, events_db, NOW + timedelta(hours=23, minutes=30)
    )
    async with events_db() as events:
        await events.execute(
            update(Listing).where(Listing.id == shop.listing_id).values(status=status)
        )
        await events.commit()
    assert await _run(db_async) == 0


@pytest.mark.asyncio
async def test_ticket_holders_and_rsvps_are_reminded_once_each_but_not_refunded(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=10)
    holder_order = await _paid_order(db_async, shop, 1)
    both_order = await _paid_order(db_async, shop, 2)
    refunded_order = await _paid_order(db_async, shop, 1)
    (holder_ticket,) = await _tickets(events_db, holder_order)
    both_ticket = (await _tickets(events_db, both_order))[0]
    refunded_ticket = (await _tickets(events_db, refunded_order))[0]
    rsvp_only = await make_user(db_async)
    start = NOW + timedelta(hours=23, minutes=30)
    async with events_db() as events:
        await events.execute(
            update(Listing)
            .where(Listing.id == shop.listing_id)
            .values(starts_at=start, ends_at=start + timedelta(hours=4))
        )
        events.add_all(
            [
                Rsvp(listing_id=shop.listing_id, user_id=rsvp_only.id),
                Rsvp(listing_id=shop.listing_id, user_id=both_ticket.user_id),
            ]
        )
        await events.commit()
    await _refund(db_async, shop, refunded_order)
    assert {t.status for t in await _tickets(events_db, refunded_order)} == {"refunded"}

    assert await _run(db_async) == 3
    users = {
        r.dedupe_key.split(":")[2] for r in await _emails(db_async, "events-reminder:")
    }
    assert users == {
        str(holder_ticket.user_id),
        str(both_ticket.user_id),
        str(rsvp_only.id),
    }
    assert str(refunded_ticket.user_id) not in users
    assert isinstance(both_ticket, Ticket)
    assert (await _row(events_db, refunded_order)).status == "refunded"


@pytest.mark.asyncio
async def test_pages_cover_every_recipient_and_the_domain_guard_applies(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop, _ = await _rsvp_shop(
        db_async, events_db, NOW + timedelta(hours=23, minutes=30)
    )
    async with events_db() as events:
        for _ in range(4):
            events.add(
                Rsvp(listing_id=shop.listing_id, user_id=(await make_user(db_async)).id)
            )
        await events.commit()
    monkeypatch.setattr(reminders, "PAGE_SIZE", 2)
    assert await _run(db_async) == 5

    monkeypatch.setattr(
        notification_settings, "NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS", "barrels.gd"
    )
    start = NOW + timedelta(days=2, hours=23, minutes=30)
    await _rsvp_shop(db_async, events_db, start)
    assert await _run(db_async, NOW + timedelta(days=2)) == 0
