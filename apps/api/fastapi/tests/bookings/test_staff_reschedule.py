"""Staff reschedule: ``POST /bookings/org/bookings/{id}/reschedule``.

The business moves a pending or confirmed booking; the customer is emailed. Like
entering a booking by hand it skips the availability engine, so only the future
check and the no-overlap constraint apply.
"""

from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import emails
from src.bookings.models import BookingEvent
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from src.utils.timezones import zone
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
from tests.factories import make_user
from tests.organisations.support import headers_for


@pytest.fixture
def webhooks(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, dict[str, Any], str | None]]:
    sent: list[tuple[str, dict[str, Any], str | None]] = []

    async def record(
        _session: object,
        _organisation_id: str,
        event_type: str,
        data: dict[str, Any],
        *,
        event_id: str | None = None,
    ) -> int:
        sent.append((event_type, data, event_id))
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


def _when(starts_at: datetime) -> str:
    """How the mail words a start time, on the business's clock."""
    return emails.BookingEmail(
        business="",
        customer_name="",
        service_name="",
        provider_name="",
        starts_at=starts_at,
        tz=zone("America/Grenada"),
    ).when


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
    webhooks: list[tuple[str, dict[str, Any], str | None]],
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
    # The body names the NEW time (on the business's clock), not the old one.
    assert _when(moved.starts_at) in mail["html"]
    assert _when(old_start) not in mail["html"]
    assert "not confirmed" not in mail["html"]
    assert "please contact Babydoll Beauty Bar" in mail["html"]
    assert "href=" not in mail["html"]  # no manage link: the token is only a hash

    [(kind, data, _)] = [w for w in webhooks if w[0] == "booking.rescheduled"]
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


async def test_moving_a_booking_away_and_back_notifies_every_time(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    webhooks: list[tuple[str, dict[str, Any], str | None]],
) -> None:
    """Keys built from the new start would make the third notification (back to
    the first time) collide with the first and be swallowed."""
    studio, booking_id = await _booked(db_async, async_client)
    original = (await _booking_for(db_async, booking_id)).starts_at
    first = original.strftime("%Y-%m-%dT%H:%M:%SZ")
    other = (await _slots(async_client, studio))[-1]

    for target in (other, first, other, first):
        response = await _move(async_client, studio, booking_id, target)
        assert response.status_code == 200, response.text

    rows = [
        row
        for row in await _emails(db_async, studio.org_id)
        if row.dedupe_key.startswith(f"booking-rescheduled-by-studio:{booking_id}")
    ]
    assert len(rows) == 4
    assert len({row.dedupe_key for row in rows}) == 4
    moved = [w for w in webhooks if w[0] == "booking.rescheduled"]
    assert len(moved) == 4
    assert len({w[2] for w in moved}) == 4
    # Each key names its own history row.
    events = await _events(db_async, booking_id)
    last_four = {str(event.id) for event in events[-4:]}
    assert {row.dedupe_key.rsplit(":", 1)[1] for row in rows} == last_four
    assert {str(w[2]).rsplit(":", 1)[1] for w in moved} == last_four


async def test_a_time_with_seconds_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    late = utc_iso(23).replace(":00Z", ":30Z")
    response = await _move(async_client, studio, booking_id, late)
    assert response.status_code == 422, response.text
    assert "whole minute" in response.text
    assert await _moves_mail(db_async, studio, booking_id) == []


async def test_a_pending_booking_mail_says_it_is_still_unconfirmed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    created = await _book(async_client, studio, slots[0])
    booking_id = created.json()["booking"]["id"]
    assert created.json()["booking"]["status"] == "pending"
    response = await _move(async_client, studio, booking_id, slots[-1])
    assert response.status_code == 200, response.text

    [mail] = await _moves_mail(db_async, studio, booking_id)
    moved = await _booking_for(db_async, booking_id)
    assert _when(moved.starts_at) in mail["html"]
    assert "has not confirmed this booking yet" in mail["html"]
    assert "as soon as they do" in mail["html"]


async def test_a_member_cannot_move_a_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    slots = await _slots(async_client, studio)
    member = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers = headers_for(member, studio.org_id)
    before = (await _booking_for(db_async, booking_id)).starts_at
    response = await _move(async_client, studio, booking_id, slots[-1], headers)
    assert response.status_code == 403, response.text
    assert (await _booking_for(db_async, booking_id)).starts_at == before
    assert await _moves_mail(db_async, studio, booking_id) == []
