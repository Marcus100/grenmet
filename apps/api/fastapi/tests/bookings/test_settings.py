"""Bookings A1.2: settings snapshot and reordering for the studio settings screen."""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole
from tests.bookings.test_public_bookings import API, _studio
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org


async def _second_service(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        f"{API}/org/services",
        headers=headers,
        json={"name": "Brow wax", "duration_min": 30},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.asyncio
async def test_settings_returns_everything_in_one_call(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["profile"]["public_slug"] == studio.slug
    assert [s["id"] for s in body["services"]] == [studio.service_id]
    provider = body["providers"][0]
    assert provider["id"] == studio.provider_ids[0]
    assert provider["service_ids"] == [studio.service_id]
    assert [(p["weekday"], p["start_time"]) for p in provider["working_hours"]] == [
        (0, "09:30:00"),
        (0, "13:30:00"),
    ]
    # The default studio holds only the bookings entitlement.
    assert body["deposits_available"] is False


@pytest.mark.asyncio
async def test_settings_reports_deposits_available_with_payments(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "payments"))
    body = (
        await async_client.get(f"{API}/org/settings", headers=studio.headers)
    ).json()
    assert body["deposits_available"] is True


@pytest.mark.asyncio
async def test_settings_before_a_profile_exists(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    response = await async_client.get(
        f"{API}/org/settings", headers=headers_for(owner, org.id)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["profile"] is None
    assert body["services"] == []
    assert body["providers"] == []


@pytest.mark.asyncio
async def test_a_member_reads_settings_but_cannot_reorder(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("bookings",),
    )
    headers = headers_for(member, org.id)
    read = await async_client.get(f"{API}/org/settings", headers=headers)
    assert read.status_code == 200
    for kind in ("services", "providers"):
        order = await async_client.put(
            f"{API}/org/{kind}/order",
            headers=headers,
            json={"ids": [str(uuid.uuid4())]},
        )
        assert order.status_code == 403


@pytest.mark.asyncio
async def test_reorder_services_and_providers(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    second = await _second_service(async_client, studio.headers)

    services = await async_client.put(
        f"{API}/org/services/order",
        headers=studio.headers,
        json={"ids": [second, studio.service_id]},
    )
    assert services.status_code == 200, services.text
    assert [s["id"] for s in services.json()] == [second, studio.service_id]
    assert [s["sort_order"] for s in services.json()] == [0, 1]

    reversed_ids = list(reversed(studio.provider_ids))
    providers = await async_client.put(
        f"{API}/org/providers/order",
        headers=studio.headers,
        json={"ids": reversed_ids},
    )
    assert providers.status_code == 200, providers.text
    assert [p["id"] for p in providers.json()] == reversed_ids
    listed = await async_client.get(f"{API}/org/providers", headers=studio.headers)
    assert [p["id"] for p in listed.json()] == reversed_ids


@pytest.mark.asyncio
async def test_reorder_rejects_foreign_unknown_and_duplicate_ids(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    mine = await _studio(db_async, async_client)
    theirs = await _studio(db_async, async_client)

    foreign = await async_client.put(
        f"{API}/org/services/order",
        headers=mine.headers,
        json={"ids": [mine.service_id, theirs.service_id]},
    )
    assert foreign.status_code == 404
    unknown = await async_client.put(
        f"{API}/org/providers/order",
        headers=mine.headers,
        json={"ids": [str(uuid.uuid4())]},
    )
    assert unknown.status_code == 404
    duplicate = await async_client.put(
        f"{API}/org/services/order",
        headers=mine.headers,
        json={"ids": [mine.service_id, mine.service_id]},
    )
    assert duplicate.status_code == 422
    empty = await async_client.put(
        f"{API}/org/services/order", headers=mine.headers, json={"ids": []}
    )
    assert empty.status_code == 422
