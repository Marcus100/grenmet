"""Public availability is scoped to one organisation and to the selected service.

Regression tests for ``GET /bookings/public/{slug}/availability``: another
organisation's providers, hours, time off, closures and bookings never change a
slug's slots; a service from another organisation is refused; a provider that
does not offer the selected service never contributes slots; a switched-off
page answers 404.
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


@pytest.mark.asyncio
async def test_another_organisations_hours_bookings_and_closures_never_leak(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug_a, slug_b = _slug(), _slug()
    owner_a, _, org_a = await _studio(db_async)
    service_a, provider_a = await _configure(async_client, owner_a, org_a, slug_a)

    owner_b, _, org_b = await _studio(db_async)
    await _profile(async_client, owner_b, org_b, slug_b)
    service_b = await _service(
        async_client, owner_b, org_b, name="Gel nails", duration_min=60
    )
    provider_b = await _provider(
        async_client,
        owner_b,
        org_b,
        name="Other",
        service_ids=[service_b],
        periods=[(0, "08:00", "10:00")],
    )

    before = await _slots(async_client, slug_a, service_a)
    assert _starts(before)[0] == utc_iso(9, 30)
    assert utc_iso(8) not in _starts(before)
    assert all(slot["provider_ids"] == [provider_a] for slot in before)

    b_slots = await _slots(async_client, slug_b, service_b)
    assert _starts(b_slots)[0] == utc_iso(8)
    assert all(slot["provider_ids"] == [provider_b] for slot in b_slots)

    # Organisation B's time off (extra hours), booking and closure, each in turn.
    extra = await async_client.post(
        f"{API}/org/providers/{provider_b}/exceptions",
        headers=headers_for(owner_b, org_b),
        json={
            "kind": "extra_hours",
            "starts_at": utc_iso(14),
            "ends_at": utc_iso(18),
        },
    )
    assert extra.status_code == 201, extra.text
    await _booking(
        db_async,
        org_id=org_b,
        service_id=service_b,
        provider_id=provider_b,
        starts_at=utc_at(8),
        minutes=60,
    )
    closure = await async_client.post(
        f"{API}/org/closures",
        headers=headers_for(owner_b, org_b),
        json={"starts_on": MONDAY.isoformat(), "ends_on": MONDAY.isoformat()},
    )
    assert closure.status_code == 201, closure.text

    after = await _slots(async_client, slug_a, service_a)
    assert after == before
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
