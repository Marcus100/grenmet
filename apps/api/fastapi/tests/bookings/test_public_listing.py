"""Barrels Bookings home page: the public list of businesses that opted in.

``GET /bookings/public/businesses`` shows only businesses that switched listing on
(``profile.listed``, off by default) and are open for booking: enabled, entitled to
bookings, in an active organisation, with at least one active service. Each card
carries the public fields only (no contact details, owner data or emails). The list
is filtered, counted and paged in SQL, 24 to a page.
"""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.organisations import service as organisation_service
from src.organisations.models import PlatformOrganisation
from src.storage.models import OrgUpload
from tests.bookings.test_brand import API_BASE, _logo
from tests.bookings.test_public_bookings import API, MANAGE, Studio, _studio

LISTING = f"{API}/public/businesses"
CARD_KEYS = {
    "slug",
    "name",
    "category",
    "short_description",
    "city",
    "brand_color",
    "logo_url",
}
PAGE_KEYS = {"items", "page", "has_more", "categories"}


async def _business(
    db: AsyncSession, client: httpx.AsyncClient, **profile: Any
) -> Studio:
    """A studio that has opted in to the listing, with one active service."""
    return await _studio(db, client, **({"listed": True} | profile))


async def _page(client: httpx.AsyncClient, **params: object) -> dict[str, Any]:
    response = await client.get(LISTING, params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    assert set(body) == PAGE_KEYS
    return body


def _slugs(body: dict[str, Any]) -> set[str]:
    return {item["slug"] for item in body["items"]}


def _card(body: dict[str, Any], slug: str) -> dict[str, Any]:
    [card] = [item for item in body["items"] if item["slug"] == slug]
    return card


async def test_a_business_is_not_listed_unless_it_opts_in(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    quiet = await _studio(db_async, async_client, display_name="Quiet Salon")
    open_salon = await _business(db_async, async_client, display_name="Open Salon")

    profile = await async_client.get(f"{API}/org/profile", headers=quiet.headers)
    assert profile.json()["listed"] is False

    slugs = _slugs(await _page(async_client))
    assert open_salon.slug in slugs
    assert quiet.slug not in slugs


async def test_a_listed_card_carries_only_the_public_fields(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(
        db_async,
        async_client,
        display_name="Tide Barbers",
        category="Barbers",
        short_description="Fades and beards, walk-ins welcome",
        city="Gouyave",
        brand_color="#0B63EE",
        notify_email="owner-private@example.com",
        contact_phone="+14734401234",
        contact_email="front-desk-private@example.com",
        contact_instagram="tidebarbers",
        manage_url_template=MANAGE,
    )

    body = await _page(async_client)
    card = _card(body, studio.slug)

    assert set(card) == CARD_KEYS
    assert card == {
        "slug": studio.slug,
        "name": "Tide Barbers",
        "category": "Barbers",
        "short_description": "Fades and beards, walk-ins welcome",
        "city": "Gouyave",
        "brand_color": "#0b63ee",
        "logo_url": None,
    }
    raw = str(body)
    for private in (
        "owner-private@example.com",
        "front-desk-private@example.com",
        "+14734401234",
        "tidebarbers",
        studio.org_id,
        "manage_url_template",
    ):
        assert private not in raw


@pytest.mark.parametrize(
    "mode",
    ["disabled", "not_entitled", "no_active_service", "suspended_org", "switched_off"],
)
async def test_a_business_that_cannot_take_bookings_is_hidden(
    db_async: AsyncSession, async_client: httpx.AsyncClient, mode: str
) -> None:
    control = await _business(db_async, async_client, display_name="Open Salon")
    extra = {"enabled": False} if mode == "disabled" else {}
    studio = await _business(
        db_async, async_client, display_name="Closed Salon", **extra
    )
    if mode != "disabled":
        assert studio.slug in _slugs(await _page(async_client))

    if mode == "not_entitled":
        await organisation_service.set_app_enabled(
            db_async, organisation_id=studio.org_id, app_key="bookings", enabled=False
        )
        await db_async.commit()
    elif mode == "no_active_service":
        response = await async_client.patch(
            f"{API}/org/services/{studio.service_id}",
            headers=studio.headers,
            json={"active": False},
        )
        assert response.status_code == 200, response.text
    elif mode == "suspended_org":
        await db_async.execute(
            update(PlatformOrganisation)
            .where(PlatformOrganisation.id == studio.org_id)
            .values(status="suspended")
        )
        await db_async.commit()
    elif mode == "switched_off":
        response = await async_client.put(
            f"{API}/org/profile",
            headers=studio.headers,
            json={
                "public_slug": studio.slug,
                "display_name": "Closed Salon",
                "listed": False,
            },
        )
        assert response.status_code == 200, response.text

    slugs = _slugs(await _page(async_client))
    assert control.slug in slugs
    assert studio.slug not in slugs


async def test_search_matches_name_category_description_and_city(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    token = uuid.uuid4().hex[:8]
    by_name = await _business(db_async, async_client, display_name=f"Salon {token}")
    by_category = await _business(
        db_async, async_client, display_name="Plain Name", category=f"Cat{token}"
    )
    by_city = await _business(
        db_async, async_client, display_name="Another Name", city=f"City{token}"
    )
    by_description = await _business(
        db_async,
        async_client,
        display_name="Third Name",
        short_description=f"Walk-ins {token}",
    )
    unrelated = await _business(db_async, async_client, display_name="Unrelated")

    found = _slugs(await _page(async_client, q=token))
    assert found == {
        by_name.slug,
        by_category.slug,
        by_city.slug,
        by_description.slug,
    }
    assert _slugs(await _page(async_client, q=token.upper())) == found
    assert unrelated.slug not in found


async def test_search_treats_wildcards_as_plain_text(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _business(db_async, async_client, display_name="Salon Ordinary")
    for query in ("%", "_", "\\"):
        body = await _page(async_client, q=query)
        assert body["items"] == []


async def test_category_filter_is_exact_and_ignores_case(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    nails = await _business(
        db_async, async_client, display_name="Nail Bar", category="Nails"
    )
    await _business(db_async, async_client, display_name="Hair Bar", category="Hair")

    assert _slugs(await _page(async_client, category="nails")) == {nails.slug}
    assert _slugs(await _page(async_client, category="NAILS")) == {nails.slug}
    assert _slugs(await _page(async_client, category="Nai")) == set()


async def test_categories_list_the_listed_businesses_once_each(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _business(db_async, async_client, display_name="One", category="Hair")
    await _business(db_async, async_client, display_name="Two", category="hair")
    await _business(db_async, async_client, display_name="Three", category="Nails")
    await _studio(db_async, async_client, display_name="Hidden", category="Massage")

    categories = (await _page(async_client))["categories"]
    assert sorted(category.lower() for category in categories) == ["hair", "nails"]


async def test_pages_hold_24_businesses_and_say_when_more_follow(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    token = uuid.uuid4().hex[:8]
    slugs = {
        (
            await _business(
                db_async,
                async_client,
                display_name=f"Listing {number:02d}",
                category=f"Paged{token}",
            )
        ).slug
        for number in range(25)
    }

    first = await _page(async_client, category=f"Paged{token}", page=1)
    second = await _page(async_client, category=f"Paged{token}", page=2)

    assert len(first["items"]) == 24
    assert first["has_more"] is True
    assert first["page"] == 1
    assert len(second["items"]) == 1
    assert second["has_more"] is False
    assert _slugs(first) | _slugs(second) == slugs
    assert not _slugs(first) & _slugs(second)


@pytest.mark.usefixtures("db_async")
@pytest.mark.parametrize("page", [0, 1001, -1])
async def test_page_numbers_are_bounded(
    async_client: httpx.AsyncClient, page: int
) -> None:
    response = await async_client.get(LISTING, params={"page": page})
    assert response.status_code == 422, response.text


@pytest.mark.usefixtures("db_async")
async def test_a_long_search_is_refused(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get(LISTING, params={"q": "x" * 81})
    assert response.status_code == 422, response.text


async def test_the_listing_needs_no_sign_in_and_the_word_is_reserved(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": "businesses", "display_name": "Taken"},
    )
    assert response.status_code == 422, response.text
    assert (await async_client.get(LISTING)).status_code == 200


async def test_a_save_without_listing_fields_keeps_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(
        db_async,
        async_client,
        category="Barbers",
        short_description="Walk-ins welcome",
        city="Gouyave",
    )
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": studio.slug, "display_name": "Renamed Salon"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["listed"] is True
    assert body["category"] == "Barbers"
    assert body["short_description"] == "Walk-ins welcome"
    assert body["city"] == "Gouyave"


async def test_blank_listing_text_clears_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, category="Barbers", city="Gouyave")
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "category": "   ",
            "city": "",
            "short_description": None,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["category"] is None
    assert body["city"] is None
    assert body["short_description"] is None


async def test_a_logo_shows_only_while_it_is_a_finished_upload(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", API_BASE)
    studio = await _business(db_async, async_client)
    logo = await _logo(db_async, studio.org_id)
    saved = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "logo_file_id": str(logo),
        },
    )
    assert saved.status_code == 200, saved.text
    body = await _page(async_client)
    assert _card(body, studio.slug)["logo_url"] == (
        f"{API_BASE}/api/v1/storage/public/{logo}"
    )

    await db_async.execute(
        update(OrgUpload).where(OrgUpload.id == logo).values(status="pending")
    )
    await db_async.commit()
    body = await _page(async_client)
    assert _card(body, studio.slug)["logo_url"] is None
