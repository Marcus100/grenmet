"""Booking hygiene (#1808): a confirmed booking that ended more than 48 hours ago is
closed as completed by the system (``lifecycle.complete_finished_bookings``, worker
job ``complete_finished_bookings``).

A system completion earns no rewards, sends no customer or studio email and emits no
webhook. Only a completion the business marks by hand (studio ``complete``) earns."""

import uuid
from datetime import datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import lifecycle, public
from src.bookings.models import Booking, BookingEvent, BookingStatus, Customer
from src.contacts.models import Contact
from src.outbox import Outbox
from src.rewards import outbox_handlers as rewards_handlers
from src.rewards import service as rewards_service
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from src.worker import main as worker
from tests.bookings.email_code_helpers import book_known
from tests.bookings.test_public_bookings import (
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)
from tests.factories import make_user

FULL = ("bookings", "contacts", "rewards")
NOTE = "Completed automatically 48 hours after the booking ended"


async def _booked(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    email: str | None = None,
    requires_confirmation: bool = False,
    apps: tuple[str, ...] = ("bookings",),
) -> tuple[Studio, str]:
    studio = await _studio(
        db, client, apps=apps, requires_confirmation=requires_confirmation
    )
    slot = (await _slots(client, studio))[0]
    overrides = {"customer_email": email} if email else {}
    response = await _book(client, studio, slot, **overrides)
    assert response.status_code == 201, response.text
    return studio, response.json()["booking"]["id"]


async def _end_at(db: AsyncSession, booking_id: str, ends_at: datetime) -> None:
    """Move the booking so it ends at ``ends_at`` (naive UTC), keeping its length."""
    booking = await db.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    length = booking.ends_at - booking.starts_at
    booking.starts_at = ends_at - length
    booking.ends_at = ends_at
    booking.blocked_from = booking.starts_at
    booking.blocked_until = ends_at
    await db.commit()


async def _status(db: AsyncSession, booking_id: str) -> str:
    return (await _booking_for(db, booking_id)).status


async def _outbox_count(db: AsyncSession, org_id: str) -> int:
    db.expire_all()
    return int(
        await db.scalar(
            select(func.count(Outbox.id)).where(Outbox.organisation_id == org_id)
        )
        or 0
    )


async def test_a_booking_is_not_closed_before_48_hours(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    now = utc_now()
    await _end_at(db_async, booking_id, now - timedelta(hours=47))
    assert (
        await lifecycle.complete_finished_bookings(
            db_async, now=now, organisation_id=studio.org_id
        )
        == 0
    )
    await db_async.commit()
    assert await _status(db_async, booking_id) == BookingStatus.CONFIRMED.value


async def test_a_booking_is_closed_after_48_hours_with_a_system_event(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    now = utc_now()
    await _end_at(db_async, booking_id, now - timedelta(hours=49))
    assert (
        await lifecycle.complete_finished_bookings(
            db_async, now=now, organisation_id=studio.org_id
        )
        == 1
    )
    await db_async.commit()
    assert await _status(db_async, booking_id) == BookingStatus.COMPLETED.value
    last = (
        await db_async.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == uuid.UUID(booking_id))
            .order_by(BookingEvent.created_at.desc(), BookingEvent.id.desc())
        )
    ).first()
    assert last is not None
    assert (last.from_status, last.to_status) == ("confirmed", "completed")
    assert last.actor_user_id is None
    assert last.note == NOTE


async def test_a_system_completion_earns_no_reward_and_sends_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    email = f"member-{uuid.uuid4().hex[:6]}@example.com"
    studio = await _studio(db_async, async_client, apps=FULL, providers=2)
    member_id = (await make_user(db_async)).id
    actor = await make_user(db_async)
    await rewards_service.create_program(
        db_async,
        organisation_id=studio.org_id,
        actor=actor,
        payload=ProgramCreate(
            name="Lash card",
            stamps_required=3,
            reward_description="A free fill",
            qualifying_source_type="bookings.completed",
        ),
    )
    slots = await _slots(async_client, studio)
    first = await book_known(
        db_async, async_client, studio, slots[0], customer_email=email
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["booking"]["id"]
    customer = await db_async.scalar(
        select(Customer)
        .join(Booking, Booking.customer_id == Customer.id)
        .where(Booking.id == uuid.UUID(first_id))
    )
    assert customer is not None
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    contact.user_id = member_id
    await db_async.commit()

    # A second booking with the same contact, closed by hand: this one earns.
    second = await book_known(
        db_async, async_client, studio, slots[0], customer_email=email
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["booking"]["id"]
    booking = await db_async.get(Booking, uuid.UUID(second_id))
    assert booking is not None
    await public.transition(db_async, booking, BookingStatus.COMPLETED)
    await db_async.commit()

    now = utc_now()
    await _end_at(db_async, first_id, now - timedelta(hours=49))
    before = await _outbox_count(db_async, studio.org_id)
    assert (
        await lifecycle.complete_finished_bookings(
            db_async, now=now, organisation_id=studio.org_id
        )
        == 1
    )
    await db_async.commit()
    assert await _status(db_async, first_id) == BookingStatus.COMPLETED.value
    # No outbox row of any kind: no email, no reward, no webhook.
    assert await _outbox_count(db_async, studio.org_id) == before

    rewarded = {
        row.dedupe_key
        for row in await db_async.scalars(
            select(Outbox).where(Outbox.topic == rewards_handlers.TOPIC)
        )
    }
    assert f"bookings.completed:{second_id}:{member_id}" in rewarded
    assert f"bookings.completed:{first_id}:{member_id}" not in rewarded


async def test_only_confirmed_bookings_are_closed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(
        db_async, async_client, requires_confirmation=True
    )
    await _end_at(db_async, booking_id, utc_now() - timedelta(days=5))
    assert (
        await lifecycle.complete_finished_bookings(
            db_async, now=utc_now(), organisation_id=studio.org_id
        )
        == 0
    )
    await db_async.commit()
    assert await _status(db_async, booking_id) == BookingStatus.PENDING.value


async def test_closing_is_idempotent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    now = utc_now()
    await _end_at(db_async, booking_id, now - timedelta(hours=60))
    first = await lifecycle.complete_finished_bookings(
        db_async, now=now, organisation_id=studio.org_id
    )
    second = await lifecycle.complete_finished_bookings(
        db_async, now=now, organisation_id=studio.org_id
    )
    await db_async.commit()
    assert (first, second) == (1, 0)
    events = await db_async.scalar(
        select(func.count(BookingEvent.id)).where(
            BookingEvent.booking_id == uuid.UUID(booking_id),
            BookingEvent.to_status == "completed",
        )
    )
    assert events == 1


def test_the_completion_job_is_registered_and_tracked() -> None:
    from src import operational_metrics

    assert worker.complete_finished_bookings in worker.WorkerSettings.functions
    scheduled = {job.coroutine for job in worker.WorkerSettings.cron_jobs}
    assert worker.complete_finished_bookings in scheduled
    assert "complete_finished_bookings" in operational_metrics.JOBS
