"""Staff reschedule: ``POST /bookings/org/bookings/{id}/reschedule``.

The business moves a pending or confirmed booking; the customer is emailed. Like
entering a booking by hand it skips the availability engine, so only the future
check and the no-overlap constraint apply.
"""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingEvent
from tests.bookings.booking_day import utc_iso
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.bookings.test_studio import _booked, _events, _key, _url


@pytest.fixture
def webhooks(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    sent: list[tuple[str, dict[str, Any]]] = []

    async def record(
        _session: object,
        _organisation_id: str,
        event_type: str,
        data: dict[str, Any],
        *,
        event_id: str | None = None,
    ) -> int:
        _ = event_id
        sent.append((event_type, data))
        return 1

    monkeypatch.setattr("src.webhooks_out.service.emit_event_safely", record)
    return sent


async def _move(
    client: httpx.AsyncClient,
    studio: Studio,
    booking_id: str,
    starts_at: str,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        _url(booking_id, "/reschedule"),
        headers=headers or studio.headers,
        json={"starts_at": starts_at},
    )


async def _moves_mail(
    db: AsyncSession, studio: Studio, booking_id: str
) -> list[dict[str, Any]]:
    return [
        row.payload
        for row in await _emails(db, studio.org_id)
        if row.dedupe_key.startswith(f"booking-rescheduled-by-studio:{booking_id}")
    ]


async def test_staff_move_a_booking_and_the_customer_is_told(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    webhooks: list[tuple[str, dict[str, Any]]],
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    before = await _booking_for(db_async, booking_id)
    old_start = before.starts_at
    slots = await _slots(async_client, studio)
    target = slots[-1]

    response = await _move(async_client, studio, booking_id, target)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["starts_at"].startswith(target.removesuffix("Z")[:16])

    moved = await _booking_for(db_async, booking_id)
    assert moved.starts_at > old_start
    assert moved.ends_at - moved.starts_at == timedelta(minutes=120)
    # Buffers travel with the booking: 15 minutes after the service.
    assert moved.blocked_until - moved.ends_at == timedelta(minutes=15)
    assert moved.provider_id == before.provider_id
    assert moved.service_id == before.service_id

    events = await _events(db_async, booking_id)
    last = events[-1]
    assert (last.from_status, last.to_status) == ("confirmed", "confirmed")
    assert last.note is not None and last.note.startswith("Rescheduled from")
    assert last.note.endswith("by the business")
    assert last.actor_user_id is not None

    [mail] = await _moves_mail(db_async, studio, booking_id)
    assert mail["subject"] == "Your booking at Babydoll Beauty Bar has a new time"
    assert "has moved your booking to a new time" in mail["html"]
    assert "please contact Babydoll Beauty Bar" in mail["html"]
    assert "href=" not in mail["html"]  # no manage link: the token is only a hash

    [(kind, data)] = [w for w in webhooks if w[0] == "booking.rescheduled"]
    assert kind == "booking.rescheduled"
    assert data["previous_starts_at"] == old_start.isoformat()
    assert "customer" not in repr(data).lower()


async def test_a_pending_booking_can_be_moved_and_the_customers_link_still_works(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    created = await _book(async_client, studio, slots[0])
    assert created.status_code == 201, created.text
    booking_id = created.json()["booking"]["id"]
    token = created.json()["manage_token"]
    assert created.json()["booking"]["status"] == "pending"

    response = await _move(async_client, studio, booking_id, slots[-1])
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"
    seen = await async_client.get(f"{API}/public/bookings/{token}")
    assert seen.status_code == 200, seen.text
    assert seen.json()["starts_at"].startswith(slots[-1][:16])


async def test_moving_to_the_same_time_changes_and_sends_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    current = await _booking_for(db_async, booking_id)
    same = current.starts_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    events_before = len(await _events(db_async, booking_id))

    response = await _move(async_client, studio, booking_id, same)
    assert response.status_code == 200, response.text
    assert len(await _events(db_async, booking_id)) == events_before
    assert await _moves_mail(db_async, studio, booking_id) == []


async def test_staff_may_move_outside_opening_hours_but_not_onto_another_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    first = await _book(async_client, studio, slots[0])
    second = await _book(async_client, studio, slots[-1])
    assert first.status_code == second.status_code == 201
    first_id = first.json()["booking"]["id"]
    second_id = second.json()["booking"]["id"]

    # 23:00 UTC is 19:00 in Grenada, after the 17:30 close: staff may.
    late = await _move(async_client, studio, first_id, utc_iso(23))
    assert late.status_code == 200, late.text

    # Onto the second booking's time: refused, nothing changes, nothing is sent.
    taken = (await _booking_for(db_async, second_id)).starts_at
    before = await _booking_for(db_async, first_id)
    start = before.starts_at
    clash = await _move(
        async_client, studio, first_id, taken.strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    assert clash.status_code == 409, clash.text
    assert (await _booking_for(db_async, first_id)).starts_at == start
    assert len(await _moves_mail(db_async, studio, first_id)) == 1  # only the late move


async def test_only_pending_and_confirmed_bookings_can_be_moved(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    slots = await _slots(async_client, studio)
    done = await async_client.post(
        _url(booking_id, "/complete"), headers=studio.headers
    )
    assert done.status_code == 200, done.text
    assert (await _move(async_client, studio, booking_id, slots[-1])).status_code == 409

    other, other_id = await _booked(db_async, async_client)
    cancelled = await async_client.post(
        _url(other_id, "/cancel"), headers=other.headers, json={"reason": "Ill"}
    )
    assert cancelled.status_code == 200, cancelled.text
    later = (await _slots(async_client, other))[-1]
    assert (await _move(async_client, other, other_id, later)).status_code == 409
    assert await _moves_mail(db_async, other, other_id) == []


async def test_a_time_in_the_past_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    past = (await _booking_for(db_async, booking_id)).starts_at - timedelta(days=30)
    response = await _move(
        async_client, studio, booking_id, past.strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    assert response.status_code == 422, response.text
    assert await _moves_mail(db_async, studio, booking_id) == []


async def test_another_organisation_cannot_move_it_and_keys_follow_their_scope(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    slots = await _slots(async_client, studio)
    other = await _studio(db_async, async_client)
    assert (await _move(async_client, other, booking_id, slots[-1])).status_code == 404

    reader = await _key(async_client, studio, ["bookings.read"])
    writer = await _key(async_client, studio, ["bookings.write"])
    denied = await _move(async_client, studio, booking_id, slots[-1], reader)
    assert denied.status_code == 403
    allowed = await _move(async_client, studio, booking_id, slots[-1], writer)
    assert allowed.status_code == 200, allowed.text
    events: list[BookingEvent] = await _events(db_async, booking_id)
    assert events[-1].actor_user_id is None
    anonymous = await async_client.post(
        _url(booking_id, "/reschedule"), json={"starts_at": slots[-1]}
    )
    assert anonymous.status_code == 401
