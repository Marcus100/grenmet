"""The setup checklist and the go-live gate (ADR-0066 item 3).

``GET /bookings/org/setup-checklist`` lists services, hours and contact (required) and
branding (optional). A business that signed itself up cannot turn online booking on
until every required item is done: ``PUT /org/profile`` answers 409
``SETUP_INCOMPLETE`` naming the missing items. Businesses Barrels set up, and saves
that do not open booking, are never blocked.
"""

import uuid
from typing import Any

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import (
    BookingProfile,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
)
from src.organisations.models import Membership, MembershipRole, PlatformOrganisation
from tests.bookings.test_public_bookings import API, Studio, _studio

CHECKLIST = f"{API}/org/setup-checklist"


async def _closed(
    db: AsyncSession, client: httpx.AsyncClient, *, self_created: bool = True
) -> Studio:
    """A closed business with a service, a provider with hours and no contact."""
    studio = await _studio(db, client, enabled=False)
    if self_created:
        owner_id = await db.scalar(
            select(Membership.user_id).where(
                Membership.organisation_id == studio.org_id,
                Membership.role == MembershipRole.OWNER.value,
            )
        )
        await db.execute(
            update(PlatformOrganisation)
            .where(PlatformOrganisation.id == studio.org_id)
            .values(created_by_user_id=owner_id)
        )
        await db.commit()
    return studio


async def _put(
    client: httpx.AsyncClient, studio: Studio, **changes: object
) -> httpx.Response:
    body: dict[str, Any] = {
        "public_slug": studio.slug,
        "display_name": "Setup Salon",
        **changes,
    }
    return await client.put(f"{API}/org/profile", headers=studio.headers, json=body)


async def _checklist(client: httpx.AsyncClient, studio: Studio) -> dict[str, Any]:
    response = await client.get(CHECKLIST, headers=studio.headers)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _done(body: dict[str, Any]) -> dict[str, bool]:
    return {item["key"]: item["done"] for item in body["items"]}


async def test_the_checklist_shows_what_is_missing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)

    body = await _checklist(async_client, studio)

    assert [item["key"] for item in body["items"]] == [
        "services",
        "hours",
        "contact",
        "branding",
    ]
    assert [item["required"] for item in body["items"]] == [True, True, True, False]
    assert _done(body) == {
        "services": True,
        "hours": True,
        "contact": False,
        "branding": False,
    }
    assert body["missing"] == ["contact"]
    assert body["ready"] is False
    assert body["live"] is False


async def test_opening_booking_with_a_missing_item_is_409_naming_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)

    response = await _put(async_client, studio, enabled=True)

    assert response.status_code == 409, response.text
    body = response.json()
    assert body["code"] == "SETUP_INCOMPLETE"
    assert body["missing"] == ["contact"]
    db_async.expire_all()
    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == studio.org_id)
    )
    assert profile is not None
    assert profile.enabled is False


async def test_contact_given_in_the_same_save_lets_booking_open(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)

    response = await _put(
        async_client, studio, enabled=True, contact_whatsapp="14735551234"
    )

    assert response.status_code == 200, response.text
    assert response.json()["enabled"] is True
    body = await _checklist(async_client, studio)
    assert body["ready"] is True
    assert body["live"] is True


async def test_no_active_service_means_no_services_and_no_hours(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    await db_async.execute(
        update(Service)
        .where(Service.organisation_id == studio.org_id)
        .values(active=False)
    )
    await db_async.commit()

    body = await _checklist(async_client, studio)
    response = await _put(
        async_client, studio, enabled=True, contact_email="hello@example.com"
    )

    assert body["missing"] == ["services", "hours", "contact"]
    assert response.status_code == 409
    assert response.json()["missing"] == ["services", "hours"]


async def test_a_provider_without_hours_does_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    await db_async.execute(delete(WorkingHours))
    await db_async.commit()

    body = await _checklist(async_client, studio)

    assert _done(body)["services"] is True
    assert _done(body)["hours"] is False


async def test_branding_is_optional(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)

    response = await _put(
        async_client,
        studio,
        enabled=True,
        contact_phone="+14735551234",
        brand_color="#aa3366",
    )

    assert response.status_code == 200, response.text
    assert _done(await _checklist(async_client, studio))["branding"] is True


async def test_a_business_barrels_set_up_is_not_gated(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client, self_created=False)

    response = await _put(async_client, studio, enabled=True)

    assert response.status_code == 200, response.text
    assert (await _checklist(async_client, studio))["missing"] == ["contact"]


async def test_a_live_business_saving_other_settings_is_not_blocked(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    opened = await _put(async_client, studio, enabled=True, contact_email="a@b.co")
    assert opened.status_code == 200, opened.text

    cleared = await _put(async_client, studio, enabled=True, contact_email=None)

    assert cleared.status_code == 200, cleared.text
    assert (await _checklist(async_client, studio))["missing"] == ["contact"]


async def test_the_checklist_needs_a_member_of_the_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    other = await _closed(db_async, async_client)
    headers = {**studio.headers, "X-Barrels-Organisation": other.org_id}

    response = await async_client.get(CHECKLIST, headers=headers)

    assert response.status_code in (403, 404)


async def test_hours_alone_block_opening(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    await db_async.execute(delete(WorkingHours))
    await db_async.commit()

    response = await _put(
        async_client, studio, enabled=True, contact_email="hello@example.com"
    )

    assert response.status_code == 409
    assert response.json()["missing"] == ["hours"]


async def test_an_inactive_provider_does_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _closed(db_async, async_client)
    await db_async.execute(
        update(Provider)
        .where(Provider.organisation_id == studio.org_id)
        .values(active=False)
    )
    await db_async.commit()

    assert _done(await _checklist(async_client, studio))["hours"] is False


async def test_hours_and_a_service_on_different_providers_do_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Provider A has hours but no service; provider B offers the service but has no
    hours. Nobody can be booked, so ``hours`` is not done."""
    studio = await _closed(db_async, async_client)
    first = uuid.UUID(studio.provider_ids[0])
    await db_async.execute(
        delete(ProviderService).where(ProviderService.provider_id == first)
    )
    await db_async.commit()
    created = await async_client.post(
        f"{API}/org/providers",
        headers=studio.headers,
        json={"name": "No hours", "service_ids": [studio.service_id]},
    )
    assert created.status_code in (200, 201), created.text

    body = await _checklist(async_client, studio)

    assert _done(body)["services"] is True
    assert _done(body)["hours"] is False
