"""B4: the Babydoll tenant seed is complete, repeatable and bookable."""

import argparse
import json
from datetime import timedelta

import httpx
import pytest
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
    # The manage page lives in the bookings app under the studio's slug; the
    # Babydoll site redirects /booking/* away, so a link there would be dead.
    assert profile.manage_url_template == seed._manage_url_template()
    assert profile.manage_url_template.startswith("https://")
    assert profile.manage_url_template.endswith("/babydoll-beauty-bar/booking/{token}")

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


def test_manage_link_points_at_the_bookings_app(monkeypatch) -> None:
    monkeypatch.setattr(
        seed.bookings_settings, "APP_URL", "https://bookings.staging.barrels.gd/"
    )
    assert seed._manage_url_template() == (
        "https://bookings.staging.barrels.gd/babydoll-beauty-bar/booking/{token}"
    )
    # A local http address cannot be used in an emailed link.
    monkeypatch.setattr(seed.bookings_settings, "APP_URL", "http://localhost:3015")
    assert seed._manage_url_template() == (
        "https://bookings.barrels.gd/babydoll-beauty-bar/booking/{token}"
    )


async def test_seeded_services_keep_fifteen_minutes_after_each_appointment(
    db_async: AsyncSession,
) -> None:
    await seed.seed_babydoll(db_async)
    await db_async.commit()

    buffers = set(await db_async.scalars(select(Service.buffer_after_min)))
    assert buffers == {15}


async def test_seeded_buffer_is_honoured_by_slots(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await seed.seed_babydoll(db_async)
    await db_async.commit()
    storefront = await async_client.get(f"{API}/public/babydoll-beauty-bar")
    service_id = next(
        s["id"]
        for s in storefront.json()["services"]
        if s["name"] == "Signature brow sculpt & wax"  # 30 minutes, 15 after
    )
    day = (utc_now() + timedelta(days=5)).date()
    day += timedelta(days=(1 - day.weekday()) % 7)  # a Tuesday
    params = {"service_id": service_id, "first_day": str(day), "last_day": str(day)}
    url = f"{API}/public/babydoll-beauty-bar/availability"

    def starts(body: dict[str, list[dict[str, str]]]) -> list[str]:
        return [slot["starts_at"] for slot in body["slots"]]

    before = starts((await async_client.get(url, params=params)).json())
    ten = f"{day}T14:00"  # 10:00 local (UTC-4)
    assert any(s.startswith(ten) for s in before)

    booked = await async_client.post(
        f"{API}/public/babydoll-beauty-bar/bookings",
        headers={"Idempotency-Key": "seed-buffer-check"},
        json={
            "service_id": service_id,
            "starts_at": f"{ten}:00Z",
            "customer_name": "Buffer Check",
            "customer_email": "buffer-check@example.com",
            "customer_phone": "+1 473 555 0100",
        },
    )
    assert booked.status_code == 201, booked.text

    after = starts((await async_client.get(url, params=params)).json())
    # 10:00-10:30 plus 15 minutes after: 10:30 is inside the buffer, 11:00 is free.
    assert not any(s.startswith(ten) for s in after)
    assert not any(s.startswith(f"{day}T14:30") for s in after)
    assert any(s.startswith(f"{day}T15:00") for s in after)


async def test_notify_email_sets_the_profile_on_a_fresh_seed(
    db_async: AsyncSession,
) -> None:
    result = await seed.seed_babydoll(db_async, notify_email="studio@example.com")
    await db_async.commit()

    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == "babydoll")
    )
    assert profile is not None
    assert profile.notify_email == "studio@example.com"
    assert "profile" in result.created
    assert result.notes == []


async def test_notify_email_is_ignored_when_the_profile_exists(
    db_async: AsyncSession,
) -> None:
    await seed.seed_babydoll(db_async)
    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == "babydoll")
    )
    assert profile is not None
    profile.notify_email = "studio-kept@example.com"
    await db_async.commit()

    result = await seed.seed_babydoll(db_async, notify_email="other@example.com")
    await db_async.commit()
    await db_async.refresh(profile)

    assert profile.notify_email == "studio-kept@example.com"
    assert not result.changed
    assert len(result.notes) == 1
    assert "kept" in result.notes[0]


async def test_invalid_notify_email_is_refused_and_nothing_is_written(
    db_async: AsyncSession,
) -> None:
    with pytest.raises(ValueError):
        await seed.seed_babydoll(db_async, notify_email="not-an-email")
    with pytest.raises(argparse.ArgumentTypeError):
        seed._notify_email_arg("not-an-email")
    with pytest.raises(SystemExit) as exit_info:
        seed.build_parser().parse_args(["--notify-email", "not-an-email"])
    assert exit_info.value.code == 2

    assert await db_async.get(PlatformOrganisation, "babydoll") is None
    assert await db_async.scalar(select(func.count()).select_from(Service)) == 0


async def test_dry_run_with_notify_email_rolls_back(
    db_async: AsyncSession, capsys: pytest.CaptureFixture[str]
) -> None:
    await db_async.commit()

    assert await seed.run(dry_run=True, notify_email="studio@example.com") == 0
    output = json.loads(capsys.readouterr().out)
    assert output["dry_run"] is True
    assert "profile" in output["created"]

    db_async.expire_all()
    assert await db_async.get(PlatformOrganisation, "babydoll") is None
    profiles = await db_async.scalar(
        select(func.count())
        .select_from(BookingProfile)
        .where(BookingProfile.organisation_id == "babydoll")
    )
    assert profiles == 0
