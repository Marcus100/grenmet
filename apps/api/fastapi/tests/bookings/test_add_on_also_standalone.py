"""A main service that is also offered as an add-on (issue #1862): bookable alone,
attachable only to the categories it is offered with, and add-on-only services
unchanged."""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from tests.bookings.booking_day import DAY
from tests.bookings.test_add_ons import _addon, _service, _slots_with
from tests.bookings.test_public_bookings import API, Studio, _book, _studio

WAX_PRICE = 3000
WAX_MINUTES = 30
LASH_PRICE = 21000
LASH_MINUTES = 120


async def _setup(
    db_async: AsyncSession, client: httpx.AsyncClient
) -> tuple[Studio, str, str]:
    """A studio whose main service is a Lashes service, plus a brow wax that is
    bookable alone and also offered with Lashes. Returns (studio, wax, facial)."""
    studio = await _studio(db_async, client, add_ons_enabled=True)
    patched = await client.patch(
        f"{API}/org/services/{studio.service_id}",
        headers=studio.headers,
        json={"category": "Lashes"},
    )
    assert patched.status_code == 200, patched.text
    wax = await _service(
        client,
        studio,
        name="Brow wax",
        category="Brows",
        duration_min=WAX_MINUTES,
        price_minor=WAX_PRICE,
        also_add_on=True,
        add_on_categories=["Lashes"],
    )
    facial = await _service(
        client,
        studio,
        name="Facial",
        category="Facials",
        duration_min=60,
        price_minor=9000,
    )
    linked = await client.patch(
        f"{API}/org/providers/{studio.provider_ids[0]}",
        headers=studio.headers,
        json={"service_ids": [studio.service_id, wax, facial]},
    )
    assert linked.status_code == 200, linked.text
    return studio, wax, facial


async def _slot_for(client: httpx.AsyncClient, studio: Studio, service_id: str) -> str:
    response = await client.get(
        f"{API}/public/{studio.slug}/availability",
        params={"service_id": service_id, "first_day": DAY, "last_day": DAY},
    )
    assert response.status_code == 200, response.text
    return str(response.json()["slots"][0]["starts_at"])


async def test_it_is_listed_as_a_main_service_and_as_an_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, facial = await _setup(db_async, async_client)
    store = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    service = next(s for s in store["services"] if s["id"] == wax)
    assert service["name"] == "Brow wax"
    offered = {a["id"]: a for a in store["add_ons"]}
    assert offered[wax]["service_ids"] == [studio.service_id]
    assert facial not in offered


async def test_booked_alone_it_is_a_main_service(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, _ = await _setup(db_async, async_client)
    slot = await _slot_for(async_client, studio, wax)
    response = await _book(async_client, studio, slot, service_id=wax)
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["price_minor"] == WAX_PRICE
    assert booking["add_ons"] == []


async def test_attached_to_a_lash_booking_it_is_an_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, _ = await _setup(db_async, async_client)
    slots = await _slots_with(async_client, studio, [wax])
    response = await _book(
        async_client, studio, slots[0]["starts_at"], add_on_ids=[wax]
    )
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["price_minor"] == LASH_PRICE + WAX_PRICE
    assert booking["add_ons"] == [
        {"name": "Brow wax", "duration_min": WAX_MINUTES, "price_minor": WAX_PRICE}
    ]


async def test_it_cannot_be_attached_to_a_category_it_is_not_offered_with(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, facial = await _setup(db_async, async_client)
    slot = await _slot_for(async_client, studio, facial)
    response = await _book(
        async_client, studio, slot, service_id=facial, add_on_ids=[wax]
    )
    assert response.status_code == 422, response.text
    availability = await async_client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": facial,
            "first_day": DAY,
            "last_day": DAY,
            "add_on_ids": [wax],
        },
    )
    assert availability.status_code == 422, availability.text


async def test_it_cannot_be_its_own_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, _ = await _setup(db_async, async_client)
    slot = await _slot_for(async_client, studio, wax)
    response = await _book(async_client, studio, slot, service_id=wax, add_on_ids=[wax])
    assert response.status_code == 422, response.text


async def test_an_add_on_only_service_is_unchanged(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _, _ = await _setup(db_async, async_client)
    only = await _addon(async_client, studio, name="Tint", also_add_on=True)
    stored = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    row = next(s for s in stored.json()["services"] if s["id"] == only)
    # `is_add_on` wins: the flag is not kept on an add-on-only service.
    assert row["is_add_on"] is True
    assert row["also_add_on"] is False
    store = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert only not in {s["id"] for s in store["services"]}
    assert only in {a["id"] for a in store["add_ons"]}
    slot = await _slot_for(async_client, studio, studio.service_id)
    refused = await _book(async_client, studio, slot, service_id=only)
    assert refused.status_code == 404


async def test_turning_it_off_keeps_categories_clean(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, wax, _ = await _setup(db_async, async_client)
    patched = await async_client.patch(
        f"{API}/org/services/{wax}", headers=studio.headers, json={"also_add_on": False}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["also_add_on"] is False
    assert patched.json()["add_on_categories"] is None
    store = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert wax not in {a["id"] for a in store["add_ons"]}
