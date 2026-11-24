"""Bookings BK-20: whole-business closures (one closed day for every provider).

Closures are local (Grenada) calendar days, both ends inclusive. A closure
removes every provider's slots for those days, refuses a customer's create
into them with the plain slot-taken 409, lists the bookings that fall inside
for the studio to follow up (never cancelling them), and is admin-only to
change. Another business's closure is invisible.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.bookings.models import Booking, BookingStatus
from src.organisations.models import MembershipRole
from tests.bookings.booking_day import MONDAY, utc_iso
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/bookings"
SUNDAY = MONDAY - timedelta(days=1)
TUESDAY = MONDAY + timedelta(days=1)
HOURS = [
    {"weekday": 0, "start_time": "09:30", "end_time": "12:30"},
    {"weekday": 0, "start_time": "13:30", "end_time": "17:30"},
    {"weekday": 1, "start_time": "09:30", "end_time": "12:30"},
    {"weekday": 1, "start_time": "13:30", "end_time": "17:30"},
]


@dataclass
class Salon:
    org_id: str
    owner: User
    member: User
    headers: dict[str, str]
    slug: str
    service_id: str
    provider_ids: list[str]


async def _salon(db: AsyncSession, client: httpx.AsyncClient) -> Salon:
    owner = await make_user(db)
    member = await make_user(db)
    org = await make_org(
        db,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    slug = f"salon-{uuid.uuid4().hex[:10]}"
    profile = await client.put(
        f"{API}/org/profile",
        headers=headers,
        json={
            "public_slug": slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 365,
        },
    )
    assert profile.status_code == 200, profile.text
    service = await client.post(
        f"{API}/org/services",
        headers=headers,
        json={"name": "Classic full set", "duration_min": 120, "buffer_after_min": 15},
    )
    assert service.status_code == 201, service.text
    service_id = service.json()["id"]
    provider_ids = []
    for name in ("Jeriann", "Keisha"):
        provider = await client.post(
            f"{API}/org/providers",
            headers=headers,
            json={"name": name, "service_ids": [service_id]},
        )
        assert provider.status_code == 201, provider.text
        provider_id = provider.json()["id"]
        provider_ids.append(provider_id)
        hours = await client.put(
            f"{API}/org/providers/{provider_id}/hours",
            headers=headers,
            json={"periods": HOURS},
        )
        assert hours.status_code == 200, hours.text
    return Salon(org.id, owner, member, headers, slug, service_id, provider_ids)


async def _slots(client: httpx.AsyncClient, salon: Salon, first, last) -> list[str]:
    response = await client.get(
        f"{API}/public/{salon.slug}/availability",
        params={
            "service_id": salon.service_id,
            "first_day": first.isoformat(),
            "last_day": last.isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    return [slot["starts_at"] for slot in response.json()["slots"]]


async def _close(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    starts_on,
    ends_on,
    reason: str | None = "Public holiday",
) -> httpx.Response:
    body: dict[str, object] = {
        "starts_on": starts_on.isoformat(),
        "ends_on": ends_on.isoformat(),
    }
    if reason is not None:
        body["reason"] = reason
    return await client.post(f"{API}/org/closures", headers=headers, json=body)


async def _staff_book(
    client: httpx.AsyncClient,
    salon: Salon,
    starts_at: str,
    *,
    name: str = "Ada Lovelace",
    provider_index: int = 0,
) -> str:
    response = await client.post(
        f"{API}/org/bookings",
        headers={**salon.headers, "Idempotency-Key": uuid.uuid4().hex},
        json={
            "service_id": salon.service_id,
            "provider_id": salon.provider_ids[provider_index],
            "starts_at": starts_at,
            "customer_name": name,
            "customer_email": f"{uuid.uuid4().hex[:8]}@example.com",
        },
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _public_book(
    client: httpx.AsyncClient, salon: Salon, starts_at: str
) -> httpx.Response:
    return await client.post(
        f"{API}/public/{salon.slug}/bookings",
        headers={"Idempotency-Key": uuid.uuid4().hex},
        json={
            "service_id": salon.service_id,
            "starts_at": starts_at,
            "customer_name": "Grace Hopper",
            "customer_email": f"grace-{uuid.uuid4().hex[:8]}@example.com",
            "customer_phone": "+1 473 555 0100",
        },
    )


@pytest.mark.asyncio
async def test_closure_removes_every_providers_slots_on_its_days_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    monday_before = await _slots(async_client, salon, MONDAY, MONDAY)
    tuesday_before = await _slots(async_client, salon, TUESDAY, TUESDAY)
    assert monday_before and tuesday_before

    created = await _close(async_client, salon.headers, MONDAY, MONDAY)
    assert created.status_code == 201, created.text

    assert await _slots(async_client, salon, MONDAY, MONDAY) == []
    assert await _slots(async_client, salon, TUESDAY, TUESDAY) == tuesday_before


@pytest.mark.asyncio
async def test_closed_slot_creates_are_refused_with_the_plain_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    assert (
        await _close(async_client, salon.headers, MONDAY, MONDAY)
    ).status_code == 201

    refused = await _public_book(async_client, salon, utc_iso(9, 30, MONDAY))
    assert refused.status_code == 409, refused.text
    assert "no longer available" in refused.text

    open_day = await _public_book(async_client, salon, utc_iso(9, 30, TUESDAY))
    assert open_day.status_code == 201, open_day.text


@pytest.mark.asyncio
async def test_create_lists_existing_bookings_inside_and_never_cancels_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    inside_morning = await _staff_book(async_client, salon, utc_iso(10, 0, MONDAY))
    # 23:30 Monday local is 03:30 UTC Tuesday: inside, by the Grenada day.
    inside_late = await _staff_book(
        async_client, salon, utc_iso(23, 30, MONDAY), name="Ada Lovelace"
    )
    # Starts 23:30 Sunday and runs about two hours into Monday: it overlaps the closure.
    spills = await _staff_book(async_client, salon, utc_iso(23, 30, SUNDAY))
    # 20:00 Sunday local is 00:00 UTC Monday but still Sunday in Grenada: outside.
    before = await _staff_book(
        async_client, salon, utc_iso(20, 0, SUNDAY), provider_index=1
    )
    # 00:30 Tuesday local is 04:30 UTC: outside. Second provider, so no clash.
    after = await _staff_book(
        async_client, salon, utc_iso(0, 30, TUESDAY), provider_index=1
    )
    cancelled = await _staff_book(async_client, salon, utc_iso(14, 0, MONDAY))
    cancel = await async_client.post(
        f"{API}/org/bookings/{cancelled}/cancel",
        headers=salon.headers,
        json={"reason": "Moved"},
    )
    assert cancel.status_code == 200, cancel.text

    created = await _close(async_client, salon.headers, MONDAY, MONDAY)
    assert created.status_code == 201, created.text
    body = created.json()
    listed = [item["id"] for item in body["affected_bookings"]]
    assert listed == [spills, inside_morning, inside_late]
    for item in body["affected_bookings"]:
        assert set(item) == {"id", "starts_at", "customer_first_name"}
        assert item["customer_first_name"] == "Ada"
        assert "@" not in str(item)

    db_async.expire_all()
    statuses = dict(
        (
            await db_async.execute(
                select(Booking.id, Booking.status).where(
                    Booking.id.in_(
                        [
                            uuid.UUID(b)
                            for b in (
                                spills,
                                inside_morning,
                                inside_late,
                                before,
                                after,
                                cancelled,
                            )
                        ]
                    )
                )
            )
        ).all()
    )
    for kept in (spills, inside_morning, inside_late, before, after):
        assert statuses[uuid.UUID(kept)] == BookingStatus.CONFIRMED.value
    assert statuses[uuid.UUID(cancelled)] == BookingStatus.CANCELLED.value


@pytest.mark.asyncio
async def test_members_read_and_admins_write(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    member_headers = headers_for(salon.member, salon.org_id)
    created = await _close(async_client, salon.headers, MONDAY, MONDAY)
    assert created.status_code == 201, created.text
    closure_id = created.json()["id"]

    listed = await async_client.get(f"{API}/org/closures", headers=member_headers)
    assert listed.status_code == 200, listed.text
    assert [c["id"] for c in listed.json()] == [closure_id]

    assert (
        await _close(async_client, member_headers, TUESDAY, TUESDAY)
    ).status_code == 403
    deleted = await async_client.delete(
        f"{API}/org/closures/{closure_id}", headers=member_headers
    )
    assert deleted.status_code == 403
    assert (
        len(
            (
                await async_client.get(f"{API}/org/closures", headers=salon.headers)
            ).json()
        )
        == 1
    )


@pytest.mark.asyncio
async def test_another_organisations_closure_is_invisible(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    created = await _close(async_client, salon.headers, MONDAY, MONDAY)
    closure_id = created.json()["id"]
    rival = await _salon(db_async, async_client)
    rival_headers = headers_for(rival.owner, rival.org_id)

    assert (
        await async_client.get(f"{API}/org/closures", headers=rival_headers)
    ).json() == []
    gone = await async_client.delete(
        f"{API}/org/closures/{closure_id}", headers=rival_headers
    )
    assert gone.status_code == 404
    still = await async_client.get(f"{API}/org/closures", headers=salon.headers)
    assert [c["id"] for c in still.json()] == [closure_id]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("starts_on", "ends_on", "reason"),
    [
        (MONDAY, MONDAY - timedelta(days=1), None),  # end before start
        (MONDAY, MONDAY + timedelta(days=366), None),  # 367 days inclusive
        (MONDAY, MONDAY, "x" * 201),  # reason too long
    ],
)
async def test_invalid_closures_are_422(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    starts_on,
    ends_on,
    reason: str | None,
) -> None:
    salon = await _salon(db_async, async_client)
    response = await _close(async_client, salon.headers, starts_on, ends_on, reason)
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_a_year_long_closure_and_a_200_character_reason_are_accepted(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    response = await _close(
        async_client, salon.headers, MONDAY, MONDAY + timedelta(days=365), "x" * 200
    )
    assert response.status_code == 201, response.text
    assert response.json()["reason"] == "x" * 200


@pytest.mark.asyncio
async def test_overlapping_closures_each_hold_until_removed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    week = await _close(async_client, salon.headers, MONDAY, TUESDAY)
    tuesday = await _close(async_client, salon.headers, TUESDAY, TUESDAY)
    assert week.status_code == 201 and tuesday.status_code == 201

    assert await _slots(async_client, salon, TUESDAY, TUESDAY) == []
    removed = await async_client.delete(
        f"{API}/org/closures/{week.json()['id']}", headers=salon.headers
    )
    assert removed.status_code == 204
    assert await _slots(async_client, salon, TUESDAY, TUESDAY) == []
    assert await _slots(async_client, salon, MONDAY, MONDAY) != []


@pytest.mark.asyncio
async def test_delete_is_idempotent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    created = await _close(async_client, salon.headers, MONDAY, MONDAY)
    closure_id = created.json()["id"]

    for _ in range(2):
        response = await async_client.delete(
            f"{API}/org/closures/{closure_id}", headers=salon.headers
        )
        assert response.status_code == 204, response.text
    assert (
        await async_client.get(f"{API}/org/closures", headers=salon.headers)
    ).json() == []
    assert await _slots(async_client, salon, MONDAY, MONDAY) != []


@pytest.mark.asyncio
async def test_closure_list_is_paged_in_order(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    for offset in (2, 0, 1):
        day = MONDAY + timedelta(days=offset * 7)
        assert (await _close(async_client, salon.headers, day, day)).status_code == 201
    page = await async_client.get(
        f"{API}/org/closures", headers=salon.headers, params={"page": 1, "size": 2}
    )
    assert page.status_code == 200, page.text
    starts = [c["starts_on"] for c in page.json()]
    assert starts == sorted(starts)
    assert len(starts) == 2
    last = await async_client.get(
        f"{API}/org/closures", headers=salon.headers, params={"page": 2, "size": 2}
    )
    assert len(last.json()) == 1
    assert len(starts) + len(last.json()) == 3
