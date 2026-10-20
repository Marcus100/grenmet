"""Bookings B5: studio actions, API-key writes, agenda."""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking, BookingEvent
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from tests.bookings.test_public_bookings import (
    API,
    DAY,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user
from tests.organisations.support import headers_for

KEYS = "/api/v1/organisations/org/api-keys"


async def _booked(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    studio: Studio | None = None,
    slot: int = 0,
    **profile: object,
) -> tuple[Studio, str]:
    studio = studio or await _studio(db, client, **profile)
    slots = await _slots(client, studio)
    response = await _book(client, studio, slots[slot])
    assert response.status_code == 201, response.text
    return studio, response.json()["booking"]["id"]


def _url(booking_id: str, action: str = "") -> str:
    return f"{API}/org/bookings/{booking_id}{action}"


async def _events(db: AsyncSession, booking_id: str) -> list[BookingEvent]:
    return list(
        await db.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == uuid.UUID(booking_id))
            .order_by(BookingEvent.created_at, BookingEvent.id)
            .execution_options(populate_existing=True)
        )
    )


async def _key(
    client: httpx.AsyncClient, studio: Studio, scopes: list[str]
) -> dict[str, str]:
    response = await client.post(
        KEYS, headers=studio.headers, json={"name": "Kiosk", "scopes": scopes}
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['secret']}"}


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


# --- detail ----------------------------------------------------------------------------


async def test_studio_detail_shows_customer_and_history(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    response = await async_client.get(_url(booking_id), headers=studio.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["customer"]["name"] == "Ada Lovelace"
    assert body["customer"]["phone"] == "+1 473 555 0100"
    assert body["customer"]["email"].endswith("@example.com")
    assert body["status"] == "confirmed"
    assert [e["to_status"] for e in body["events"]] == ["confirmed"]
    assert body["deposit_intent_id"] is None


async def test_another_organisations_booking_is_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    other = await _studio(db_async, async_client)
    for method, suffix in (
        ("get", ""),
        ("post", "/confirm"),
        ("post", "/no-show"),
        ("post", "/complete"),
    ):
        response = await async_client.request(
            method, _url(booking_id, suffix), headers=other.headers
        )
        assert response.status_code == 404, suffix
    cancelled = await async_client.post(
        _url(booking_id, "/cancel"), headers=other.headers, json={"reason": "x"}
    )
    assert cancelled.status_code == 404
    assert (
        await async_client.get(_url(str(uuid.uuid4())), headers=studio.headers)
    ).status_code == 404
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"


# --- confirm / decline -------------------------------------------------------------------


async def test_confirm_moves_pending_to_confirmed_once(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    webhooks: list[tuple[str, dict[str, Any]]],
) -> None:
    studio, booking_id = await _booked(
        db_async, async_client, requires_confirmation=True
    )
    assert (await _booking_for(db_async, booking_id)).status == "pending"
    webhooks.clear()

    response = await async_client.post(
        _url(booking_id, "/confirm"), headers=studio.headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"
    assert webhooks == []  # confirm announces nothing new
    keys = [row.dedupe_key for row in await _emails(db_async, studio.org_id)]
    assert f"booking-confirmed:{booking_id}" in keys

    again = await async_client.post(
        _url(booking_id, "/confirm"), headers=studio.headers
    )
    assert again.status_code == 409
    events = await _events(db_async, booking_id)
    assert [e.to_status for e in events] == ["pending", "confirmed"]
    assert events[-1].actor_user_id is not None


async def test_decline_cancels_emails_once_and_releases_the_slot(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    webhooks: list[tuple[str, dict[str, Any]]],
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    _, booking_id = await _booked(db_async, async_client, studio=studio)
    assert slots[0] not in await _slots(async_client, studio)
    webhooks.clear()

    missing = await async_client.post(
        _url(booking_id, "/decline"), headers=studio.headers, json={}
    )
    assert missing.status_code == 422
    declined = await async_client.post(
        _url(booking_id, "/decline"),
        headers=studio.headers,
        json={"reason": "Fully booked that day"},
    )
    assert declined.status_code == 200, declined.text
    body = declined.json()
    assert body["status"] == "cancelled"
    assert body["cancel_reason"] == "Fully booked that day"
    assert [t for t, _ in webhooks] == ["booking.cancelled"]
    assert slots[0] in await _slots(async_client, studio)

    repeat = await async_client.post(
        _url(booking_id, "/decline"), headers=studio.headers, json={"reason": "again"}
    )
    assert repeat.status_code == 409
    rows = [
        row
        for row in await _emails(db_async, studio.org_id)
        if row.dedupe_key == f"booking-declined:{booking_id}"
    ]
    assert len(rows) == 1
    assert rows[0].payload["subject"].startswith("Your booking request")
    assert "Fully booked that day" in rows[0].payload["html"]


async def test_decline_of_a_confirmed_booking_is_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    response = await async_client.post(
        _url(booking_id, "/decline"), headers=studio.headers, json={"reason": "No"}
    )
    assert response.status_code == 409
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"


# --- cancel / no-show / complete -------------------------------------------------------------


async def test_studio_cancel_needs_a_reason_and_is_final(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    webhooks: list[tuple[str, dict[str, Any]]],
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    webhooks.clear()
    assert (
        await async_client.post(
            _url(booking_id, "/cancel"), headers=studio.headers, json={}
        )
    ).status_code == 422
    cancelled = await async_client.post(
        _url(booking_id, "/cancel"),
        headers=studio.headers,
        json={"reason": "Stylist is ill"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert [t for t, _ in webhooks] == ["booking.cancelled"]
    assert "customer_name" not in str(webhooks[0][1])
    keys = [row.dedupe_key for row in await _emails(db_async, studio.org_id)]
    assert f"booking-cancelled-by-studio:{booking_id}" in keys

    for action, body in (
        ("/cancel", {"reason": "again"}),
        ("/no-show", None),
        ("/complete", None),
        ("/confirm", None),
    ):
        response = await async_client.post(
            _url(booking_id, action), headers=studio.headers, json=body
        )
        assert response.status_code == 409, action
    assert len(webhooks) == 1


async def test_no_show_and_complete_only_from_confirmed(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rewarded: list[uuid.UUID] = []

    async def reward(_session: object, booking: Booking) -> None:
        rewarded.append(booking.id)

    monkeypatch.setattr("src.bookings.public._emit_completed_reward", reward)
    studio = await _studio(db_async, async_client, providers=2)
    _, first = await _booked(db_async, async_client, studio=studio, slot=0)
    _, second = await _booked(db_async, async_client, studio=studio, slot=0)

    done = await async_client.post(_url(first, "/complete"), headers=studio.headers)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"
    assert rewarded == [uuid.UUID(first)]
    missed = await async_client.post(_url(second, "/no-show"), headers=studio.headers)
    assert missed.json()["status"] == "no_show"

    for booking_id in (first, second):
        for action in ("/complete", "/no-show"):
            response = await async_client.post(
                _url(booking_id, action), headers=studio.headers
            )
            assert response.status_code == 409
    assert rewarded == [uuid.UUID(first)]

    pending = await _studio(db_async, async_client, requires_confirmation=True)
    _, waiting = await _booked(db_async, async_client, studio=pending)
    for action in ("/complete", "/no-show"):
        response = await async_client.post(
            _url(waiting, action), headers=pending.headers
        )
        assert response.status_code == 409


# --- who may act -------------------------------------------------------------------------------


async def test_member_cannot_write_but_can_read(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    member = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers = headers_for(member, studio.org_id)
    assert (
        await async_client.get(_url(booking_id), headers=headers)
    ).status_code == 200
    assert (
        await async_client.post(_url(booking_id, "/no-show"), headers=headers)
    ).status_code == 403
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"


async def test_api_key_with_write_scope_acts_without_a_user(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    writer = await _key(async_client, studio, ["bookings.write"])
    reader = await _key(async_client, studio, ["bookings.read"])

    denied = await async_client.post(_url(booking_id, "/complete"), headers=reader)
    assert denied.status_code == 403
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    assert (await async_client.get(_url(booking_id), headers=reader)).status_code == 200

    done = await async_client.post(_url(booking_id, "/complete"), headers=writer)
    assert done.status_code == 200, done.text
    events = await _events(db_async, booking_id)
    assert events[-1].to_status == "completed"
    assert events[-1].actor_user_id is None
    assert (await async_client.post(_url(booking_id, "/no-show"))).status_code == 401


async def test_api_key_cannot_reach_another_organisation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _booked(db_async, async_client)
    other = await _studio(db_async, async_client)
    other_key = await _key(async_client, other, ["bookings.write"])
    response = await async_client.post(_url(booking_id, "/no-show"), headers=other_key)
    assert response.status_code == 404
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    _ = studio


# --- agenda ----------------------------------------------------------------------------------------


async def test_agenda_groups_by_local_day_and_pages(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    slots = await _slots(async_client, studio)
    for slot in (0, 0, 3):
        await _booked(db_async, async_client, studio=studio, slot=slot)
    params = {"from_date": DAY, "to_date": "2027-01-10"}
    response = await async_client.get(
        f"{API}/org/agenda", headers=studio.headers, params=params
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 3
    assert body["timezone"] == "America/Grenada"
    assert [day["day"] for day in body["days"]] == [DAY]
    starts = [b["starts_at"] for b in body["days"][0]["bookings"]]
    assert starts == sorted(starts)
    assert starts[0] == slots[0]

    page = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={**params, "limit": 2, "offset": 2},
    )
    assert page.json()["total"] == 3
    assert sum(len(d["bookings"]) for d in page.json()["days"]) == 1

    provider = studio.provider_ids[0]
    only = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={**params, "provider_id": provider},
    )
    assert {b["provider_id"] for d in only.json()["days"] for b in d["bookings"]} == {
        provider
    }

    empty = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": "2027-02-01", "to_date": "2027-02-02"},
    )
    assert empty.json()["days"] == []
    none_cancelled = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={**params, "status": "cancelled"},
    )
    assert none_cancelled.json()["total"] == 0


async def test_agenda_is_capped_at_62_days_and_scoped(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _ = await _booked(db_async, async_client)
    ok = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": "2027-01-01", "to_date": "2027-03-03"},
    )
    assert ok.status_code == 200
    too_long = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": "2027-01-01", "to_date": "2027-03-04"},
    )
    assert too_long.status_code == 422
    backwards = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": "2027-01-05", "to_date": "2027-01-01"},
    )
    assert backwards.status_code == 422
    other = await _studio(db_async, async_client)
    theirs = await async_client.get(
        f"{API}/org/agenda",
        headers=other.headers,
        params={"from_date": DAY, "to_date": DAY},
    )
    assert theirs.json()["total"] == 0
    assert (
        await async_client.get(
            f"{API}/org/agenda", params={"from_date": DAY, "to_date": DAY}
        )
    ).status_code == 401
