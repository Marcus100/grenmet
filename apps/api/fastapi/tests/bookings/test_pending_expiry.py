"""Booking hygiene (#1808): a booking request the business does not confirm in time
expires (``lifecycle.expire_stale_requests``, worker job ``expire_pending_bookings``).

Pending requests only: a deposit hold (``pending_payment``) is the sweeper's job
(``deposits.expire_unpaid``) and must not be touched here."""

import uuid
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import lifecycle
from src.bookings.config import bookings_settings
from src.bookings.models import Booking, BookingEvent, BookingStatus
from src.notifications import outbox_handlers
from src.outbox import Outbox
from src.worker import main as worker
from tests.bookings.test_deposits import _book_deposit, _deposit_studio
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)
from tests.email_payload import payload_text

EXPIRED_NOTE = "Not confirmed by the business in time; slot released"


async def _pending(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, str, str]:
    """A pending request and the slot it took (its start, as offered)."""
    studio = await _studio(db, client, requires_confirmation=True, **profile)
    slot = (await _slots(client, studio))[0]
    response = await _book(client, studio, slot)
    assert response.status_code == 201, response.text
    return studio, response.json()["booking"]["id"], slot


async def _events(db: AsyncSession, booking_id: str) -> list[BookingEvent]:
    return list(
        await db.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == uuid.UUID(booking_id))
            .order_by(BookingEvent.created_at, BookingEvent.id)
            .execution_options(populate_existing=True)
        )
    )


async def _expiry_mails(db: AsyncSession, booking_id: str) -> list[Outbox]:
    return list(
        await db.scalars(
            select(Outbox).where(
                Outbox.topic == outbox_handlers.EMAIL_SEND,
                Outbox.dedupe_key == f"booking-expired:{booking_id}",
            )
        )
    )


async def test_an_unconfirmed_request_expires_after_its_window(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, slot = await _pending(
        db_async, async_client, pending_expiry_hours=2
    )
    created = (await _booking_for(db_async, booking_id)).created_at

    just_inside = created + timedelta(hours=1, minutes=59)
    assert (
        await lifecycle.expire_stale_requests(
            db_async, now=just_inside, organisation_id=studio.org_id
        )
        == 0
    )
    just_after = created + timedelta(hours=2, minutes=1)
    assert (
        await lifecycle.expire_stale_requests(
            db_async, now=just_after, organisation_id=studio.org_id
        )
        == 1
    )
    await db_async.commit()

    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CANCELLED.value
    assert booking.cancel_reason == "Not confirmed in time"
    last = (await _events(db_async, booking_id))[-1]
    assert last.note == EXPIRED_NOTE
    assert last.actor_user_id is None
    assert (last.from_status, last.to_status) == ("pending", "cancelled")
    # The slot is free again for the next customer.
    assert slot in await _slots(async_client, studio)


async def test_the_customer_is_told_and_can_book_again(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=1
    )
    created = (await _booking_for(db_async, booking_id)).created_at
    await lifecycle.expire_stale_requests(
        db_async, now=created + timedelta(hours=2), organisation_id=studio.org_id
    )
    await db_async.commit()

    mails = await _expiry_mails(db_async, booking_id)
    assert len(mails) == 1
    text = payload_text(mails[0].payload)
    assert "did not confirm" in text
    assert f"{bookings_settings.APP_URL.rstrip('/')}/{studio.slug}" in text


async def test_a_null_window_expires_only_at_the_start_time(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=None
    )
    booking = await _booking_for(db_async, booking_id)
    # Days after the request but before the start: still held.
    assert (
        await lifecycle.expire_stale_requests(
            db_async,
            now=booking.created_at + timedelta(hours=100),
            organisation_id=studio.org_id,
        )
        == 0
    )
    assert (
        await lifecycle.expire_stale_requests(
            db_async,
            now=booking.starts_at - timedelta(minutes=1),
            organisation_id=studio.org_id,
        )
        == 0
    )
    assert (
        await lifecycle.expire_stale_requests(
            db_async,
            now=booking.starts_at + timedelta(minutes=1),
            organisation_id=studio.org_id,
        )
        == 1
    )


async def test_a_request_expires_at_its_start_even_inside_the_window(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=168
    )
    booking = await _booking_for(db_async, booking_id)
    assert (
        await lifecycle.expire_stale_requests(
            db_async,
            now=booking.starts_at + timedelta(minutes=1),
            organisation_id=studio.org_id,
        )
        == 1
    )
    await db_async.commit()
    assert (
        await _booking_for(db_async, booking_id)
    ).status == BookingStatus.CANCELLED.value


async def test_a_confirmed_request_is_never_expired(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=2
    )
    response = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert response.status_code == 200, response.text
    booking = await _booking_for(db_async, booking_id)
    later = booking.created_at + timedelta(hours=3)
    assert (
        await lifecycle.expire_stale_requests(
            db_async, now=later, organisation_id=studio.org_id
        )
        == 0
    )
    await db_async.commit()
    assert (
        await _booking_for(db_async, booking_id)
    ).status == BookingStatus.CONFIRMED.value


async def test_a_confirm_after_expiry_fails_cleanly(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=2
    )
    created = (await _booking_for(db_async, booking_id)).created_at
    await lifecycle.expire_stale_requests(
        db_async, now=created + timedelta(hours=3), organisation_id=studio.org_id
    )
    await db_async.commit()

    response = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert response.status_code == 409
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CANCELLED.value
    # Exactly one cancellation in the history: the expiry.
    assert [e.to_status for e in await _events(db_async, booking_id)].count(
        "cancelled"
    ) == 1


async def test_a_pending_payment_hold_is_not_touched(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, pending_expiry_hours=1)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.PENDING_PAYMENT.value
    assert (
        await lifecycle.expire_stale_requests(
            db_async,
            now=booking.created_at + timedelta(days=30),
            organisation_id=studio.org_id,
        )
        == 0
    )
    await db_async.commit()
    assert (
        await _booking_for(db_async, booking_id)
    ).status == BookingStatus.PENDING_PAYMENT.value


async def test_expiry_is_idempotent_and_mails_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id, _ = await _pending(
        db_async, async_client, pending_expiry_hours=1
    )
    created = (await _booking_for(db_async, booking_id)).created_at
    later = created + timedelta(hours=5)
    for _ in range(2):
        await lifecycle.expire_stale_requests(
            db_async, now=later, organisation_id=studio.org_id
        )
    await db_async.commit()

    assert len(await _expiry_mails(db_async, booking_id)) == 1
    cancelled_rows = [
        e for e in await _events(db_async, booking_id) if e.to_status == "cancelled"
    ]
    assert len(cancelled_rows) == 1
    count = await db_async.scalar(
        select(func.count(Booking.id)).where(
            Booking.id == uuid.UUID(booking_id),
            Booking.status == BookingStatus.CANCELLED.value,
        )
    )
    assert count == 1


def test_the_expiry_job_is_registered_and_tracked() -> None:
    from src import operational_metrics

    assert worker.expire_pending_bookings in worker.WorkerSettings.functions
    scheduled = {job.coroutine for job in worker.WorkerSettings.cron_jobs}
    assert worker.expire_pending_bookings in scheduled
    assert "expire_pending_bookings" in operational_metrics.JOBS
    assert hasattr(worker.expire_pending_bookings, "__wrapped__")
