"""Booking hygiene (#1808): a customer may hold only ``max_open_per_customer`` future
bookings (pending, pending payment or confirmed) with one business. The public create
refuses the next one with 409. Staff and walk-in bookings are never refused."""

import uuid
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import public
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


def refusal(count: int) -> str:
    """The refusal a customer at the cap reads (owner decision, 27 Nov 2026): their
    own count and where to change a booking, and nothing about anybody else."""
    one = count == 1
    return (
        f"You already have {count} upcoming "
        f"{'booking' if one else 'bookings'} with this business, "
        "which is as many as we can hold online for one email address. "
        f"To book another time, change or cancel {'it' if one else 'one of them'} "
        "from the link in your booking email, or contact the business."
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
    assert refusal(3) in refused.json()["detail"]


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
    assert refusal(2) in refused.json()["detail"]


async def test_the_refusal_names_the_customer_own_count_in_the_singular(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2, max_open_per_customer=1)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 1)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail == refusal(1)
    assert "1 upcoming booking with this business" in detail
    assert "bookings with this business" not in detail


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
    # The count a customer reads is every upcoming booking they hold, the staff
    # entries included, so a booking taken by phone is visible to them too.
    assert refusal(4) in refused.json()["detail"]


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


def test_refusal_wording_names_the_count_and_the_booking_link() -> None:
    assert public.open_cap_message(3) == refusal(3)
    assert public.open_cap_message(1) == refusal(1)
    for count in (1, 3, 20):
        text = public.open_cap_message(count)
        # The customer is told how many they hold and how to free one up.
        assert f"{count} upcoming" in text
        assert "link in your booking email" in text
        # The page shows the business's contact links under a message that says so.
        assert "contact the business" in text


async def test_the_same_address_in_another_case_is_the_same_customer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    await _fill(async_client, studio, "A@x.com", 3)
    # Email is normalised for the contact, so the lower-case address is the same
    # customer and already at the cap.
    refused = await _book_again(async_client, studio, "a@x.com")
    assert refused.status_code == 409, refused.text
    assert refusal(3) in refused.json()["detail"]


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


async def test_the_refusal_reveals_nothing_about_any_other_contact(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The refusal names the caller's own count only. Another customer's name,
    address and phone number, and the times and reference of any booking, stay out
    of it, so a prober learns nothing it did not already supply."""
    studio = await _studio(db_async, async_client, providers=4)
    other_email = "grace-hopper@example.com"
    other = await _book_again(async_client, studio, other_email)
    assert other.status_code == 201, other.text
    other_id = other.json()["booking"]["id"]

    email = EMAIL.format(uuid.uuid4().hex[:8])
    receipts = await _fill(async_client, studio, email, 3)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    detail = refused.json()["detail"]

    assert detail == refusal(3)
    for secret in (other_email, other_id, "Ada Lovelace", "Hopper", "555 0100"):
        assert secret not in detail
    # Nor anything about the caller's own bookings beyond how many there are.
    for receipt in receipts:
        assert receipt["booking"]["id"] not in detail
        assert receipt["booking"]["starts_at"] not in detail
        assert receipt["manage_token"] not in detail
    assert email not in detail
