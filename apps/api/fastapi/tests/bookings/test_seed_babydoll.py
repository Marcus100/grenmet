"""B4: the Babydoll tenant seed is complete, repeatable and bookable."""

from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import seed
from src.bookings.models import (
    BookingProfile,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
)
from src.organisations.models import (
    OrganisationApp,
    OrganisationKind,
    PlatformOrganisation,
    PublicSite,
)
from src.utils.datetime import utc_now

API = "/api/v1/bookings"


async def _counts(db_async: AsyncSession) -> dict[str, int]:
    org = seed.ORGANISATION_ID
    mine = select(Provider.id).where(Provider.organisation_id == org)
    queries = {
        "profile": select(func.count())
        .select_from(BookingProfile)
        .where(BookingProfile.organisation_id == org),
        "service": select(func.count())
        .select_from(Service)
        .where(Service.organisation_id == org),
        "provider": select(func.count())
        .select_from(Provider)
        .where(Provider.organisation_id == org),
        "link": select(func.count())
        .select_from(ProviderService)
        .where(ProviderService.provider_id.in_(mine)),
        "hours": select(func.count())
        .select_from(WorkingHours)
        .where(WorkingHours.provider_id.in_(mine)),
        "apps": select(func.count())
        .select_from(OrganisationApp)
        .where(OrganisationApp.organisation_id == org),
        "site": select(func.count())
        .select_from(PublicSite)
        .where(PublicSite.organisation_id == org),
    }
    return {name: await db_async.scalar(query) or 0 for name, query in queries.items()}


async def test_seed_creates_everything(db_async: AsyncSession) -> None:
    result = await seed.seed_babydoll(db_async)
    await db_async.commit()

    assert result.changed
    org = await db_async.get(PlatformOrganisation, "babydoll")
    assert org is not None
    assert org.kind == OrganisationKind.CLIENT.value
    apps = set(
        await db_async.scalars(
            select(OrganisationApp.app_key).where(
                OrganisationApp.organisation_id == "babydoll",
                OrganisationApp.enabled.is_(True),
            )
        )
    )
    assert apps == {"bookings", "contacts"}

    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == "babydoll")
    )
    assert profile is not None
    assert profile.public_slug == "babydoll-beauty-bar"
    assert profile.timezone == "America/Grenada"
    assert profile.requires_confirmation is True
    assert profile.enabled is True
    assert profile.manage_url_template
    assert profile.manage_url_template.endswith("/booking/{token}")

    rows = (await db_async.execute(select(Service.name, Service.price_minor))).all()
    prices = {row.name: row.price_minor for row in rows}
    assert prices["Luxe Classic"] == 21000
    assert prices["Chin"] == 2500
    counts = await _counts(db_async)
    assert counts["service"] == 14
    assert counts["provider"] == 1
    assert counts["link"] == 14
    assert counts["hours"] == 6

    site = await db_async.scalar(select(PublicSite).where(PublicSite.key == "babydoll"))
    assert site is not None
    assert site.organisation_id == "babydoll"
    assert site.accepts_contact is False
    assert site.accepts_subscriptions is False
    assert site.turnstile_mode == "inherit"
    assert site.site_url


async def test_seed_twice_changes_nothing(db_async: AsyncSession) -> None:
    await seed.seed_babydoll(db_async)
    await db_async.commit()
    before = await _counts(db_async)

    second = await seed.seed_babydoll(db_async)
    await db_async.commit()

    assert not second.changed
    assert await _counts(db_async) == before


async def test_seed_keeps_studio_edits(db_async: AsyncSession) -> None:
    await seed.seed_babydoll(db_async)
    chin = await db_async.scalar(select(Service).where(Service.name == "Chin"))
    assert chin is not None
    chin.price_minor = 3000
    await db_async.commit()

    await seed.seed_babydoll(db_async)
    await db_async.commit()
    await db_async.refresh(chin)

    assert chin.price_minor == 3000


async def test_seeded_service_has_public_slots(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await seed.seed_babydoll(db_async)
    await db_async.commit()

    storefront = await async_client.get(f"{API}/public/babydoll-beauty-bar")
    assert storefront.status_code == 200
    body = storefront.json()
    assert len(body["services"]) == 14
    service_id = next(s["id"] for s in body["services"] if s["name"] == "Hybrid")

    # A Tuesday beyond the 24 h lead time and inside the 60 day horizon.
    day = (utc_now() + timedelta(days=5)).date()
    day += timedelta(days=(1 - day.weekday()) % 7)
    availability = await async_client.get(
        f"{API}/public/babydoll-beauty-bar/availability",
        params={"service_id": service_id, "first_day": str(day), "last_day": str(day)},
    )
    assert availability.status_code == 200, availability.text
    slots = availability.json()["slots"]
    assert slots
    # 09:30 local (UTC-4, no daylight saving) is 13:30Z.
    assert slots[0]["starts_at"].startswith(f"{day}T13:30")
