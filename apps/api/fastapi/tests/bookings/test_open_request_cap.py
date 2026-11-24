"""Booking hygiene (#1808): a customer may hold only ``max_open_per_customer`` future
bookings (pending, pending payment or confirmed) with one business. The public create
refuses the next one with 409. Staff and walk-in bookings are never refused."""

import uuid
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from tests.bookings.booking_day import MONDAY, utc_iso
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)

EMAIL = "repeat-{}@example.com"


#: The same text whatever the count: a refusal must not reveal that bookings exist.
REFUSAL = (
    "We can't take another online booking for this email right now. "
    "Please contact the business to book."
)


async def _book_again(
    client: httpx.AsyncClient, studio: Studio, email: str, slot: int = 0
) -> httpx.Response:
    """Book the first free slot of the day for ``email``."""
    slots = await _slots(client, studio)
    return await _book(client, studio, slots[slot], customer_email=email)


async def _fill(
    client: httpx.AsyncClient, studio: Studio, email: str, count: int
) -> list[dict]:
    receipts = []
    for _ in range(count):
        response = await _book_again(client, studio, email)
        assert response.status_code == 201, response.text
        receipts.append(response.json())
    return receipts


async def test_the_fourth_open_booking_is_refused_by_default(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 3)

    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409, refused.text
    assert REFUSAL in refused.text


async def test_a_cancelled_booking_frees_room_under_the_cap(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    receipts = await _fill(async_client, studio, email, 3)
    assert (await _book_again(async_client, studio, email)).status_code == 409

    cancel = await async_client.post(
        f"{API}/public/bookings/{receipts[0]['manage_token']}/cancel"
    )
    assert cancel.status_code == 200, cancel.text
    again = await _book_again(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_a_pending_request_counts_towards_the_cap(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        providers=4,
        requires_confirmation=True,
        max_open_per_customer=2,
    )
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 2)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    assert REFUSAL in refused.text


async def test_the_refusal_is_the_same_whatever_the_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2, max_open_per_customer=1)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 1)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    assert REFUSAL in refused.text
    # The count is not revealed: no number, no word for "bookings".
    assert "upcoming" not in refused.text
    assert "1" not in refused.text


async def test_another_customer_is_not_affected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    await _fill(async_client, studio, EMAIL.format("full-a"), 3)
    other = await _book_again(async_client, studio, EMAIL.format("open-b"))
    assert other.status_code == 201, other.text


async def test_past_bookings_do_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    receipts = await _fill(async_client, studio, email, 3)
    # The three have started: they are no longer upcoming.
    for receipt in receipts:
        booking = await _booking_for(db_async, receipt["booking"]["id"])
        past = booking.starts_at - timedelta(days=30)
        booking.starts_at = past
        booking.ends_at = past + timedelta(hours=2)
        booking.blocked_from = past
        booking.blocked_until = booking.ends_at
    await db_async.commit()

    again = await _book_again(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_staff_bookings_are_never_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=1)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    for week in range(4):
        response = await _create(
            async_client,
            studio,
            utc_iso(9, 30, day=MONDAY + timedelta(days=7 * week)),
            customer_email=email,
        )
        assert response.status_code == 201, response.text

    # Staff bookings are upcoming bookings of this customer, so they do count
    # towards the next online booking, but they never refuse a staff entry.
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    assert REFUSAL in refused.text


async def test_a_walk_in_without_an_email_is_not_capped(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=1, max_open_per_customer=1)
    for week in range(3):
        response = await _create(
            async_client,
            studio,
            utc_iso(9, 30, day=MONDAY + timedelta(days=7 * week)),
        )
        assert response.status_code == 201, response.text
    # Walk-ins carry no email, so they belong to no customer's count.
    online = await _book_again(async_client, studio, EMAIL.format("fresh"))
    assert online.status_code == 201, online.text


def test_refusal_wording_is_plain_and_generic() -> None:
    assert REFUSAL == (
        "We can't take another online booking for this email right now. "
        "Please contact the business to book."
    )


async def test_the_same_address_in_another_case_is_the_same_customer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    await _fill(async_client, studio, "A@x.com", 3)
    # Email is normalised for the contact, so the lower-case address is the same
    # customer and already at the cap.
    refused = await _book_again(async_client, studio, "a@x.com")
    assert refused.status_code == 409, refused.text
    assert REFUSAL in refused.text


async def test_a_refused_request_stores_no_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The cap is checked after the contact is upserted; the refusal must roll
    # back the whole create so nothing (no booking, no extra mail) is stored.
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 3)
    before = await db_async.scalar(
        select(func.count(Booking.id)).where(Booking.organisation_id == studio.org_id)
    )
    assert (await _book_again(async_client, studio, email)).status_code == 409
    db_async.expire_all()
    after = await db_async.scalar(
        select(func.count(Booking.id)).where(Booking.organisation_id == studio.org_id)
    )
    assert before == after == 3
