"""Booking hygiene (#1808): the two profile settings. ``pending_expiry_hours`` (1..168,
default 24, null = only at the start time) and ``max_open_per_customer`` (1..20,
default 3). Both are validated (422 out of range), returned by GET, and kept when a
PUT leaves them out, the same as the other kept profile fields."""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from tests.bookings.test_public_bookings import API, _studio


async def _profile(client: httpx.AsyncClient, headers: dict[str, str]) -> dict:
    response = await client.get(f"{API}/org/profile", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_new_profiles_get_the_defaults(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    body = await _profile(async_client, studio.headers)
    assert body["pending_expiry_hours"] == 24
    assert body["max_open_per_customer"] == 3


async def test_the_settings_round_trip_and_a_put_without_them_keeps_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async, async_client, pending_expiry_hours=6, max_open_per_customer=7
    )
    body = await _profile(async_client, studio.headers)
    assert (body["pending_expiry_hours"], body["max_open_per_customer"]) == (6, 7)

    # A client that does not know the fields leaves them out: nothing changes.
    kept = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": studio.slug, "display_name": "Renamed"},
    )
    assert kept.status_code == 200, kept.text
    body = await _profile(async_client, studio.headers)
    assert (body["pending_expiry_hours"], body["max_open_per_customer"]) == (6, 7)
    assert body["display_name"] == "Renamed"


async def test_null_clears_the_expiry_window_to_start_time_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, pending_expiry_hours=None)
    body = await _profile(async_client, studio.headers)
    assert body["pending_expiry_hours"] is None

    restored = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Salon",
            "pending_expiry_hours": 168,
        },
    )
    assert restored.status_code == 200, restored.text
    assert (await _profile(async_client, studio.headers))["pending_expiry_hours"] == 168


async def test_expiry_window_bounds_are_enforced(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for value in (0, 169, -1):
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json={
                "public_slug": studio.slug,
                "display_name": "Salon",
                "pending_expiry_hours": value,
            },
        )
        assert response.status_code == 422, (value, response.text)
    for value in (1, 168):
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json={
                "public_slug": studio.slug,
                "display_name": "Salon",
                "pending_expiry_hours": value,
            },
        )
        assert response.status_code == 200, (value, response.text)


async def test_open_cap_bounds_are_enforced(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for value in (0, 21, None):
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json={
                "public_slug": studio.slug,
                "display_name": "Salon",
                "max_open_per_customer": value,
            },
        )
        assert response.status_code == 422, (value, response.text)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Salon",
            "max_open_per_customer": 20,
        },
    )
    assert response.status_code == 200, response.text
    assert (await _profile(async_client, studio.headers))["max_open_per_customer"] == 20
