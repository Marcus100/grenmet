"""Public availability is scoped to one organisation and to the selected service.

Regression tests for ``GET /bookings/public/{slug}/availability``. Another
organisation's providers, hours, time off, extra hours, closures and bookings
never change a slug's slots; a service from another organisation is refused; a
provider who does not offer the selected service adds no slots; a switched-off
page answers 404.

Which filter each assertion guards: the closure step fails if the closure query
loses its ``organisation_id`` filter (checked by hand, see the PR). The booking,
time-off, extra-hours and hours steps, and the providers query, are defence in
depth: the engine reads those rows per provider id, and the provider ids come only
from this organisation's services, so removing one filter would not, by itself,
change the answer. Those steps stay as regression guards, not as proof of the
filter.
"""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from tests.bookings.booking_day import MONDAY, utc_at, utc_iso
from tests.bookings.test_bookings_api import (
    API,
    _booking,
    _configure,
    _studio,
)
from tests.organisations.support import headers_for


def _slug() -> str:
    return f"salon-{uuid.uuid4().hex[:6]}"


async def _service(
    client: httpx.AsyncClient,
    owner: User,
    org_id: str,
    *,
    name: str,
    duration_min: int,
) -> str:
    created = await client.post(
        f"{API}/org/services",
        headers=headers_for(owner, org_id),
        json={"name": name, "duration_min": duration_min, "price_minor": 1000},
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


async def _provider(
    client: httpx.AsyncClient,
    owner: User,
    org_id: str,
    *,
    name: str,
    service_ids: list[str],
    periods: list[tuple[int, str, str]],
) -> str:
    headers = headers_for(owner, org_id)
    created = await client.post(
        f"{API}/org/providers",
        headers=headers,
        json={"name": name, "service_ids": service_ids},
    )
    assert created.status_code == 201, created.text
    provider_id = str(created.json()["id"])
    hours = await client.put(
        f"{API}/org/providers/{provider_id}/hours",
        headers=headers,
        json={
            "periods": [
                {"weekday": weekday, "start_time": start, "end_time": end}
                for weekday, start, end in periods
            ]
        },
    )
    assert hours.status_code == 200, hours.text
    return provider_id


async def _profile(
    client: httpx.AsyncClient,
    owner: User,
    org_id: str,
    slug: str,
    *,
    enabled: bool = True,
) -> None:
    response = await client.put(
        f"{API}/org/profile",
        headers=headers_for(owner, org_id),
        json={
            "public_slug": slug,
            "display_name": "Salon",
            "enabled": enabled,
            "lead_time_min": 0,
            "horizon_days": 365,
        },
    )
    assert response.status_code == 200, response.text


async def _availability(
    client: httpx.AsyncClient, slug: str, service_id: str
) -> httpx.Response:
    return await client.get(
        f"{API}/public/{slug}/availability",
        params={
            "service_id": service_id,
            "first_day": MONDAY.isoformat(),
            "last_day": MONDAY.isoformat(),
        },
    )


async def _slots(
    client: httpx.AsyncClient, slug: str, service_id: str
) -> list[dict[str, object]]:
    response = await _availability(client, slug, service_id)
    assert response.status_code == 200, response.text
    return list(response.json()["slots"])


def _starts(slots: list[dict[str, object]]) -> list[object]:
    return [slot["starts_at"] for slot in slots]


async def _add_exception(
    client: httpx.AsyncClient,
    owner: User,
    org_id: str,
    provider_id: str,
    *,
    kind: str,
    starts_at: str,
    ends_at: str,
) -> None:
    response = await client.post(
        f"{API}/org/providers/{provider_id}/exceptions",
        headers=headers_for(owner, org_id),
        json={"kind": kind, "starts_at": starts_at, "ends_at": ends_at},
    )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_another_organisations_data_never_changes_this_slug(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Each step adds one kind of another organisation's data that overlaps this
    organisation's Monday windows (09:30-12:30 and 13:30-17:30 local), then
    checks this slug's slots are exactly as they were before the step."""
    slug_a, slug_b = _slug(), _slug()
    owner_a, _, org_a = await _studio(db_async)
    service_a, provider_a = await _configure(async_client, owner_a, org_a, slug_a)

    owner_b, _, org_b = await _studio(db_async)
    await _profile(async_client, owner_b, org_b, slug_b)
    service_b = await _service(
        async_client, owner_b, org_b, name="Gel nails", duration_min=120
    )
    provider_b = await _provider(
        async_client,
        owner_b,
        org_b,
        name="Other",
        service_ids=[service_b],
        periods=[(0, "09:30", "12:30")],
    )

    # Hours and providers: B's provider works the same window as A's and must
    # never appear in A's answer. Defence in depth: the providers query is
    # filtered by organisation, and A's service only links A's providers.
    before = await _slots(async_client, slug_a, service_a)
    assert _starts(before)[0] == utc_iso(9, 30)
    assert all(slot["provider_ids"] == [provider_a] for slot in before)

    # Bookings: a 10:00 booking for 120 minutes on B's provider overlaps A's
    # 09:30-12:30 slots. Defence in depth: the busy list is keyed by provider id.
    await _booking(
        db_async,
        org_id=org_b,
        service_id=service_b,
        provider_id=provider_b,
        starts_at=utc_at(10),
        minutes=120,
    )
    assert await _slots(async_client, slug_a, service_a) == before

    # Time off: B's provider cannot work 09:30-12:30 on Monday. Defence in depth:
    # exceptions are read per provider id.
    await _add_exception(
        async_client,
        owner_b,
        org_b,
        provider_b,
        kind="time_off",
        starts_at=utc_iso(9, 30),
        ends_at=utc_iso(12, 30),
    )
    assert await _slots(async_client, slug_a, service_a) == before

    # Extra hours: B's provider works 14:00-18:00 on Monday, inside A's afternoon
    # window. Defence in depth, as for time off.
    await _add_exception(
        async_client,
        owner_b,
        org_b,
        provider_b,
        kind="extra_hours",
        starts_at=utc_iso(14),
        ends_at=utc_iso(18),
    )
    assert await _slots(async_client, slug_a, service_a) == before

    # Closure: B closes Monday for the whole business. The closure query is
    # filtered by organisation_id, so this step is the one that fails if that
    # filter is removed (checked by hand, see the PR).
    closure = await async_client.post(
        f"{API}/org/closures",
        headers=headers_for(owner_b, org_b),
        json={"starts_on": MONDAY.isoformat(), "ends_on": MONDAY.isoformat()},
    )
    assert closure.status_code == 201, closure.text
    assert await _slots(async_client, slug_a, service_a) == before
    assert await _slots(async_client, slug_b, service_b) == []


@pytest.mark.asyncio
async def test_a_service_from_another_organisation_is_not_found(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug_a = _slug()
    owner_a, _, org_a = await _studio(db_async)
    service_a, _ = await _configure(async_client, owner_a, org_a, slug_a)

    owner_b, _, org_b = await _studio(db_async)
    service_b = await _service(
        async_client, owner_b, org_b, name="Gel nails", duration_min=60
    )

    assert (await _availability(async_client, slug_a, service_b)).status_code == 404
    assert (
        await _availability(async_client, slug_a, str(uuid.uuid4()))
    ).status_code == 404
    assert (await _availability(async_client, slug_a, service_a)).status_code == 200


@pytest.mark.asyncio
async def test_a_provider_who_does_not_offer_the_service_adds_no_slots(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = _slug()
    owner, _, org_id = await _studio(db_async)
    long_service, long_provider = await _configure(async_client, owner, org_id, slug)
    short_service = await _service(
        async_client, owner, org_id, name="Quick trim", duration_min=60
    )
    # Works 08:00-10:00 on Monday, which fits the 120-minute service exactly,
    # but this provider offers only the 60-minute service.
    short_provider = await _provider(
        async_client,
        owner,
        org_id,
        name="Trimmer",
        service_ids=[short_service],
        periods=[(0, "08:00", "10:00")],
    )

    long_slots = await _slots(async_client, slug, long_service)
    assert utc_iso(8) not in _starts(long_slots)
    assert all(slot["provider_ids"] == [long_provider] for slot in long_slots)

    short_slots = await _slots(async_client, slug, short_service)
    assert _starts(short_slots)[0] == utc_iso(8)
    assert all(slot["provider_ids"] == [short_provider] for slot in short_slots)


@pytest.mark.asyncio
async def test_a_switched_off_page_has_no_availability(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = _slug()
    owner, _, org_id = await _studio(db_async)
    service_id, _ = await _configure(async_client, owner, org_id, slug)
    assert (await _availability(async_client, slug, service_id)).status_code == 200

    await _profile(async_client, owner, org_id, slug, enabled=False)
    off = await _availability(async_client, slug, service_id)
    unknown = await _availability(async_client, "nobody-here-xyz", service_id)
    assert off.status_code == 404
    assert unknown.status_code == 404
    assert off.json() == unknown.json()

    await _profile(async_client, owner, org_id, slug, enabled=True)
    assert (await _availability(async_client, slug, service_id)).status_code == 200
