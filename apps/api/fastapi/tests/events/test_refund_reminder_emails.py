"""Refund receipts and 24-hour reminders for Events (launch audit P1-3, P1-4).

Nothing is sent: the emails are rows on the platform outbox (topic ``email.send``).
"""

import uuid
from typing import Any
from datetime import datetime, timedelta

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events import emails, reminders
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
from tests.events.test_paid_orders import sent_emails  # noqa: F401  (fixture)

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
async def test_only_the_refund_that_completes_the_order_says_whole_order(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = await _paid_order(db_async, shop, 2)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    for _ in range(2):  # two half refunds, both recorded before the outbox drains
        await payments_service.refund_intent(
            db_async,
            organisation_id=shop.organisation_id,
            intent_id=intent.id,
            actor=None,
            payload=payment_schemas.PaymentRefundCreate(
                amount_minor=PRICE, reason="Buyer asked"
            ),
        )
        await db_async.commit()
    await _drain(db_async)
    rows = await _emails(db_async, "events-order-refunded:")
    assert len(rows) == 2
    wording = sorted("whole order" in r.payload["html"] for r in rows)
    assert wording == [False, True]
    assert sum("partial refund" in r.payload["html"] for r in rows) == 1
    assert {t.status for t in await _tickets(events_db, order_id)} == {"refunded"}


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


@pytest.mark.asyncio
async def test_a_pending_refund_sends_no_receipt_until_it_settles(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    from src.events import order_fulfilment
    from src.payments.models import Refund, RefundStatus

    shop = await _shop(db_async, events_db)
    order_id = await _paid_order(db_async, shop, 1)
    await _refund(db_async, shop, order_id)
    (row,) = await _emails(db_async, "events-order-refunded:")
    refund_id = uuid.UUID(row.dedupe_key.split(":", 1)[1])
    await db_async.execute(delete(Outbox).where(Outbox.id == row.id))
    refund = await db_async.get(Refund, refund_id)
    assert refund is not None
    refund.status = RefundStatus.PENDING.value
    await db_async.commit()

    async def replay() -> None:
        await order_fulfilment.apply_refund(
            db_async,
            organisation_id=shop.organisation_id,
            order_id=uuid.UUID(order_id),
            refund_id=refund_id,
        )
        await db_async.commit()

    await replay()
    assert await _emails(db_async, "events-order-refunded:") == []
    refund.status = RefundStatus.SUCCEEDED.value
    await db_async.commit()
    await replay()
    await replay()
    assert len(await _emails(db_async, "events-order-refunded:")) == 1


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


async def _set_start(
    events_db: SessionFactory, listing_id: uuid.UUID, starts_at: datetime
) -> None:
    async with events_db() as events:
        await events.execute(
            update(Listing)
            .where(Listing.id == listing_id)
            .values(starts_at=starts_at, ends_at=starts_at + timedelta(hours=4))
        )
        await events.commit()


async def _rsvp_shop(
    db: AsyncSession, events_db: SessionFactory, starts_at: datetime
) -> tuple[Shop, uuid.UUID]:
    """A paid event with one valid ticket, starting at ``starts_at``."""
    shop = await _shop(db, events_db)
    order_id = await _paid_order(db, shop, 1)
    (ticket,) = await _tickets(events_db, order_id)
    assert ticket.user_id is not None
    await _set_start(events_db, shop.listing_id, starts_at)
    return shop, ticket.user_id


async def _run(db: AsyncSession, now: datetime = NOW) -> int:
    queued = await reminders.enqueue_due_reminders(db, now=now)
    await db.commit()
    return queued


@pytest.mark.asyncio
async def test_the_window_is_everything_starting_in_the_next_24_hours(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    soon, _ = await _rsvp_shop(db_async, events_db, NOW + timedelta(minutes=1))
    edge, _ = await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=24))
    await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=24, seconds=1))
    await _rsvp_shop(db_async, events_db, NOW)  # starting now: already started
    await _rsvp_shop(db_async, events_db, NOW - timedelta(minutes=1))
    assert await _run(db_async) == 2
    keys = {
        r.dedupe_key.split(":")[1] for r in await _emails(db_async, "events-reminder:")
    }
    assert keys == {str(soon.listing_id), str(edge.listing_id)}


@pytest.mark.asyncio
async def test_jittered_and_skipped_runs_still_remind_exactly_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop, _ = await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=26))
    # Runs at :12 with jitter; none yet sees the event (26h away).
    assert await _run(db_async, NOW) == 0
    assert await _run(db_async, NOW + timedelta(hours=1, seconds=40)) == 0
    # The run at +2h is skipped entirely; the next one (+3h, 23h before the start)
    # still catches the event, and later runs add nothing.
    assert await _run(db_async, NOW + timedelta(hours=3, minutes=1)) == 1
    assert await _run(db_async, NOW + timedelta(hours=4, seconds=20)) == 0
    assert await _run(db_async, NOW + timedelta(hours=5)) == 0
    (row,) = await _emails(db_async, "events-reminder:")
    assert str(shop.listing_id) in row.dedupe_key


@pytest.mark.asyncio
async def test_an_event_booked_less_than_a_day_before_it_starts_is_reminded_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=10))
    assert await _run(db_async) == 1
    assert await _run(db_async, NOW + timedelta(hours=1)) == 0
    assert await _run(db_async, NOW + timedelta(hours=2)) == 0
    assert len(await _emails(db_async, "events-reminder:")) == 1


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
    assert row.payload["transactional"] is False


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
async def test_each_valid_ticket_holder_is_reminded_once_but_not_a_refunded_one(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=10)
    holder_order = await _paid_order(db_async, shop, 1)
    two_order = await _paid_order(db_async, shop, 2)
    refunded_order = await _paid_order(db_async, shop, 1)
    (holder_ticket,) = await _tickets(events_db, holder_order)
    two_ticket = (await _tickets(events_db, two_order))[0]
    refunded_ticket = (await _tickets(events_db, refunded_order))[0]
    rsvp_only = await make_user(db_async)
    await _set_start(events_db, shop.listing_id, NOW + timedelta(hours=23, minutes=30))
    async with events_db() as events:  # going without a ticket: not reminded
        events.add(Rsvp(listing_id=shop.listing_id, user_id=rsvp_only.id))
        await events.commit()
    await _refund(db_async, shop, refunded_order)
    assert {t.status for t in await _tickets(events_db, refunded_order)} == {"refunded"}

    # Two tickets on one order still mean one email for that holder.
    assert await _run(db_async) == 2
    users = {
        r.dedupe_key.split(":")[2] for r in await _emails(db_async, "events-reminder:")
    }
    assert users == {str(holder_ticket.user_id), str(two_ticket.user_id)}
    assert str(refunded_ticket.user_id) not in users
    assert str(rsvp_only.id) not in users


@pytest.mark.asyncio
async def test_a_cancelled_ticket_and_an_event_that_started_are_skipped(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=5)
    order_id = await _paid_order(db_async, shop, 1)
    (ticket,) = await _tickets(events_db, order_id)
    await _set_start(events_db, shop.listing_id, NOW + timedelta(hours=23, minutes=30))
    async with events_db() as events:
        await events.execute(
            update(Ticket).where(Ticket.id == ticket.id).values(status="cancelled")
        )
        await events.commit()
    assert await _run(db_async) == 0

    started, _ = await _rsvp_shop(db_async, events_db, NOW - timedelta(minutes=5))
    assert started.listing_id != shop.listing_id
    assert await _run(db_async) == 0


@pytest.mark.asyncio
async def test_a_suppressed_address_gets_no_reminder_but_still_gets_a_receipt(
    db_async: AsyncSession,
    events_db: SessionFactory,
    sent_emails: list[dict[str, Any]],
) -> None:
    from src import outbox as platform_outbox
    from src.notifications.models import (
        EmailSuppression,
        OutboundEmail,
        SuppressionReason,
    )
    from src.utils.email_hash import hash_email

    _, user_id = await _rsvp_shop(db_async, events_db, NOW + timedelta(hours=10))
    user = await db_async.get(User, user_id)
    assert user is not None and user.email
    email = user.email
    db_async.add(
        EmailSuppression(
            email_hash=hash_email(email), reason=SuppressionReason.COMPLAINT.value
        )
    )
    await db_async.commit()
    assert await _run(db_async) == 1

    db_async.expire_all()
    await platform_outbox.drain(db_async, only_topics={"email.send"})
    rows = list(
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == email.lower())
        )
    )
    reminder = [r for r in rows if r.subject.startswith("Reminder:")]
    assert [r.status for r in reminder] == ["skipped"]
    assert not any(m.get("subject", "").startswith("Reminder:") for m in sent_emails)


@pytest.mark.asyncio
async def test_pages_cover_every_recipient_and_the_domain_guard_applies(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop = await _shop(db_async, events_db, allocation=10)
    for _ in range(5):
        await _paid_order(db_async, shop, 1)
    await _set_start(events_db, shop.listing_id, NOW + timedelta(hours=23, minutes=30))
    monkeypatch.setattr(reminders, "PAGE_SIZE", 2)
    assert await _run(db_async) == 5

    monkeypatch.setattr(
        notification_settings, "NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS", "barrels.gd"
    )
    start = NOW + timedelta(days=2, hours=23, minutes=30)
    await _rsvp_shop(db_async, events_db, start)
    assert await _run(db_async, NOW + timedelta(days=2)) == 0
