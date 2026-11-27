"""Reason codes on the booking history: the Studio decline and cancel actions take an
optional ``reason_code`` from a fixed list, it is stored on the ``BookingEvent`` and
read back in the studio detail. The free-text ``reason`` still goes to the customer's
email and to the booking, not to the event. Assertions read the database.
"""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingEvent
from tests.bookings.test_public_bookings import API
from tests.bookings.test_studio import _booked, _events, _url


def _history(detail: dict[str, object]) -> list[dict[str, object]]:
    events = detail["events"]
    assert isinstance(events, list)
    return events


async def test_decline_stores_the_reason_code_and_reads_it_back(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(
        db_async, async_client, requires_confirmation=True
    )
    declined = await async_client.post(
        _url(booking_id, "/decline"),
        headers=studio.headers,
        json={"reason": "Clinic closed that day", "reason_code": "business_closed"},
    )
    assert declined.status_code == 200, declined.text

    detail = await async_client.get(_url(booking_id), headers=studio.headers)
    assert detail.status_code == 200, detail.text
    cancelled = [e for e in _history(detail.json()) if e["to_status"] == "cancelled"]
    assert [e["reason"] for e in cancelled] == ["business_closed"]

    rows = await _events(db_async, booking_id)
    assert [r.reason for r in rows if r.to_status == "cancelled"] == ["business_closed"]


async def test_cancel_without_a_code_leaves_the_reason_empty(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    cancelled = await async_client.post(
        _url(booking_id, "/cancel"),
        headers=studio.headers,
        json={"reason": "Van broke down"},
    )
    assert cancelled.status_code == 200, cancelled.text

    detail = await async_client.get(_url(booking_id), headers=studio.headers)
    assert detail.status_code == 200, detail.text
    history = _history(detail.json())
    assert [e["reason"] for e in history] == [None] * len(history)
    assert history[-1]["to_status"] == "cancelled"

    rows = await _events(db_async, booking_id)
    assert all(r.reason is None for r in rows)


async def test_free_text_reason_is_not_written_to_the_event(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    cancelled = await async_client.post(
        _url(booking_id, "/cancel"),
        headers=studio.headers,
        json={"reason": "Provider swapped at short notice", "reason_code": "weather"},
    )
    assert cancelled.status_code == 200, cancelled.text

    rows = await _events(db_async, booking_id)
    cancel_row = next(r for r in rows if r.to_status == "cancelled")
    assert isinstance(cancel_row, BookingEvent)
    assert cancel_row.reason == "weather"
    assert cancel_row.note == "Cancelled by the business"


async def test_a_code_outside_the_fixed_list_is_422(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    rejected = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Ill", "reason_code": "made_up"},
    )
    assert rejected.status_code == 422, rejected.text

    rows = await _events(db_async, booking_id)
    assert [r.to_status for r in rows] == ["confirmed"]
