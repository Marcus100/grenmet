"""Business type on the booking profile (a fixed list, for the home page filter).

``profile.business_type`` takes one value of ``BookingBusinessType`` or null (not
chosen). It is set through ``PUT /bookings/org/profile`` (left out keeps it, null
clears it), read back on the profile, carried by the storefront and each home page
card, and offered as the ``type`` filter of the public listing. ``types_available``
lists the types that at least one visible listed business has, in enum order, and
counts only businesses the listing shows.
"""

from typing import Any

import httpx
import pytest
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingBusinessType, BookingProfile
from tests.bookings.test_public_bookings import API, Studio, _studio
from tests.bookings.test_public_listing import (
    LISTING,
    _business,
    _card,
    _page,
    _slugs,
)

FIXED_LIST = [
    "beauty",
    "hair",
    "health",
    "fitness",
    "auto",
    "home_services",
    "lessons",
    "professional",
    "other",
]


def _put(studio: Studio, **fields: object) -> dict[str, Any]:
    return {"public_slug": studio.slug, "display_name": "Babydoll Beauty Bar", **fields}


def test_the_fixed_list_is_the_nine_agreed_types() -> None:
    assert [member.value for member in BookingBusinessType] == FIXED_LIST


async def test_a_business_type_is_stored_and_read_back(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, business_type="hair")
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["business_type"] == "hair"

    settings = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    assert settings.status_code == 200, settings.text
    assert settings.json()["profile"]["business_type"] == "hair"


@pytest.mark.parametrize("bad", ["salon", "HAIR", "home-services", "", "  "])
async def test_an_unknown_business_type_is_422(
    db_async: AsyncSession, async_client: httpx.AsyncClient, bad: str
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, business_type=bad),
    )
    assert response.status_code == 422, response.text
    assert "business_type" in response.text


async def test_leaving_the_type_out_keeps_it_and_null_clears_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.json()["business_type"] is None

    chosen = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, business_type="lessons"),
    )
    assert chosen.json()["business_type"] == "lessons"

    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=_put(studio)
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["business_type"] == "lessons"

    cleared = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json=_put(studio, business_type=None),
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["business_type"] is None


async def test_the_database_check_names_exactly_the_fixed_list(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _studio(db_async, async_client)
    definition = (
        await db_async.execute(
            text(
                "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
                "JOIN pg_class t ON t.oid = c.conrelid "
                "JOIN pg_namespace n ON n.oid = t.relnamespace "
                "WHERE n.nspname = 'bookings' AND t.relname = 'profile' "
                "AND c.conname = 'profile_business_type_check'"
            )
        )
    ).scalar_one()
    for value in FIXED_LIST:
        assert f"'{value}'" in definition
    assert definition.count("'") == 2 * len(FIXED_LIST)


async def test_the_storefront_and_each_card_carry_the_type(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, business_type="fitness")
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert storefront.json()["business_type"] == "fitness"

    card = _card(await _page(async_client), studio.slug)
    assert card["business_type"] == "fitness"


async def test_the_listing_keeps_only_the_chosen_type(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    hair = await _business(db_async, async_client, business_type="hair")
    fitness = await _business(db_async, async_client, business_type="fitness")
    unset = await _business(db_async, async_client)

    body = await _page(async_client, type="hair")
    assert _slugs(body) == {hair.slug}
    assert fitness.slug not in _slugs(body)
    assert unset.slug not in _slugs(body)


async def test_an_unknown_type_filter_is_422(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get(LISTING, params={"type": "salon"})
    assert response.status_code == 422, response.text


async def test_types_available_is_distinct_and_in_enum_order(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _business(db_async, async_client, business_type="other")
    await _business(db_async, async_client, business_type="hair")
    await _business(db_async, async_client, business_type="hair")
    await _business(db_async, async_client, business_type="beauty")
    await _business(db_async, async_client)  # unset adds nothing

    body = await _page(async_client)
    assert body["types_available"] == ["beauty", "hair", "other"]


async def test_types_available_is_not_narrowed_by_the_filters(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _business(db_async, async_client, business_type="hair")
    await _business(db_async, async_client, business_type="auto")

    body = await _page(async_client, type="hair", q="zzz-no-match")
    assert body["items"] == []
    assert body["types_available"] == ["hair", "auto"]


async def test_types_available_counts_only_businesses_the_listing_shows(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _business(db_async, async_client, business_type="beauty")
    # Not listed: opted out of the home page.
    await _studio(db_async, async_client, business_type="auto")
    # Listed but switched off: not open for booking.
    await _business(db_async, async_client, business_type="fitness", enabled=False)
    # Listed, enabled, but its only service is inactive.
    hidden = await _business(db_async, async_client, business_type="lessons")
    patched = await async_client.get(f"{API}/org/settings", headers=hidden.headers)
    services = patched.json()["services"]
    for service in services:
        response = await async_client.patch(
            f"{API}/org/services/{service['id']}",
            headers=hidden.headers,
            json={"active": False},
        )
        assert response.status_code == 200, response.text

    body = await _page(async_client)
    assert body["types_available"] == ["beauty"]


async def test_a_type_change_moves_the_business_in_the_filter(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, business_type="hair")
    await db_async.execute(
        update(BookingProfile)
        .where(BookingProfile.public_slug == studio.slug)
        .values(business_type=BookingBusinessType.AUTO.value)
    )
    await db_async.commit()
    assert _slugs(await _page(async_client, type="auto")) == {studio.slug}
    assert _slugs(await _page(async_client, type="hair")) == set()
