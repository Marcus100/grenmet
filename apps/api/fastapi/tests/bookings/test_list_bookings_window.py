"""`GET /org/bookings` returns full agenda items (#2039).

It built its items by hand, left out the required `payment_kind`, and answered 500 for
any window that held a booking. Its tests only ever asked about an empty 2027 window and
checked the status code, so no item was ever serialised.
"""

from datetime import date, datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from tests.bookings.booking_day import MONDAY
from tests.bookings.test_deposits import (
    DEPOSIT,
    _cancel,
    _paid_booking,
)
from tests.bookings.test_public_bookings import API, Studio, _book, _slots, _studio


def _stamp(day: date) -> str:
    return datetime(day.year, day.month, day.day).isoformat() + "Z"


async def _window(
    client: httpx.AsyncClient,
    studio: Studio,
    *,
    before_days: int = 1,
    after_days: int = 1,
) -> httpx.Response:
    return await client.get(
        f"{API}/org/bookings",
        headers=studio.headers,
        params={
            "starts_from": _stamp(MONDAY - timedelta(days=before_days)),
            "ends_before": _stamp(MONDAY + timedelta(days=after_days)),
        },
    )


async def _agenda_item(
    client: httpx.AsyncClient, studio: Studio, booking_id: str
) -> dict:
    response = await client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": MONDAY.isoformat(), "to_date": MONDAY.isoformat()},
    )
    assert response.status_code == 200, response.text
    items = {b["id"]: b for day in response.json()["days"] for b in day["bookings"]}
    return items[booking_id]


async def _book_one(client: httpx.AsyncClient, studio: Studio, slot: int = 0) -> str:
    starts_at = (await _slots(client, studio))[slot]
    response = await _book(client, studio, starts_at)
    assert response.status_code == 201, response.text
    return str(response.json()["booking"]["id"])


async def test_a_window_holding_a_booking_answers_200_not_500(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The regression: any non-empty window used to raise a ResponseValidationError."""
    studio = await _studio(db_async, async_client)
    booking_id = await _book_one(async_client, studio)

    response = await _window(async_client, studio)

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()] == [booking_id]


async def test_it_returns_the_same_item_the_agenda_does(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The two routes build their items in one place, so they cannot drift apart."""
    studio = await _studio(db_async, async_client)
    booking_id = await _book_one(async_client, studio)

    listed = {item["id"]: item for item in (await _window(async_client, studio)).json()}

    assert listed[booking_id] == await _agenda_item(async_client, studio, booking_id)
    assert listed[booking_id]["payment_kind"] is not None


async def test_a_cancelled_paid_booking_shows_the_refund_state_here_too(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The review of #2038 noticed this route left the new amounts at their default 0."""
    studio, booking_id = await _paid_booking(db_async, async_client)
    assert (await _cancel(async_client, studio, booking_id)).status_code == 200

    item = {i["id"]: i for i in (await _window(async_client, studio)).json()}[
        booking_id
    ]

    assert item["status"] == "cancelled"
    assert item["deposit_captured_minor"] == DEPOSIT
    assert item["deposit_refunded_minor"] == DEPOSIT


async def test_a_window_with_nothing_in_it_is_empty(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _book_one(async_client, studio)

    empty = await async_client.get(
        f"{API}/org/bookings",
        headers=studio.headers,
        params={
            "starts_from": "2031-01-01T00:00:00Z",
            "ends_before": "2031-02-01T00:00:00Z",
        },
    )

    assert empty.status_code == 200
    assert empty.json() == []


async def test_bookings_come_back_earliest_first(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for slot in (1, 0):
        await _book_one(async_client, studio, slot)

    items = (await _window(async_client, studio)).json()

    starts = [item["starts_at"] for item in items]
    assert len(starts) == 2
    assert starts == sorted(starts)


async def test_another_organisations_bookings_are_not_listed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    mine = await _studio(db_async, async_client)
    theirs = await _studio(db_async, async_client)
    await _book_one(async_client, theirs)

    assert (await _window(async_client, mine)).json() == []
