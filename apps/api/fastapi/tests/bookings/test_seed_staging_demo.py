"""The staging demo seed: refuses outside staging, and is safe to run twice."""

import importlib.util
import sys
from types import ModuleType

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking, BookingProfile, Provider, Service
from src.config import settings
from src.events.models import Listing, Order, Organiser, Ticket
from src.organisations.models import OrganisationApp, PlatformOrganisation
from src.outbox import Outbox
from tests.events.support import ROOT


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "seed_staging_demo", ROOT / "scripts/seed_staging_demo.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


seed = _load()


@pytest.mark.parametrize("environment", ["local", "production", ""])
def test_refuses_outside_staging(environment: str) -> None:
    with pytest.raises(seed.DemoSeedRefusedError, match="ENVIRONMENT"):
        seed.check_allowed(environment, "true")


@pytest.mark.parametrize("flag", [None, "", "false", "1", "yes"])
def test_refuses_without_the_explicit_flag(flag: str | None) -> None:
    with pytest.raises(seed.DemoSeedRefusedError, match="DEMO_SEED_ENABLED"):
        seed.check_allowed("staging", flag)


def test_allows_staging_with_the_flag() -> None:
    seed.check_allowed("staging", "true")
    seed.check_allowed("staging", " TRUE ")


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["production", "local"])
async def test_run_refuses_and_writes_nothing(
    environment: str, monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    with pytest.raises(seed.DemoSeedRefusedError):
        await seed.run(apply=True, member_email=None)
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_run_refuses_staging_without_the_flag(
    monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.delenv("DEMO_SEED_ENABLED", raising=False)
    with pytest.raises(seed.DemoSeedRefusedError):
        await seed.run(apply=True, member_email=None)
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_preview_writes_nothing(
    monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    assert await seed.run(apply=False, member_email=None) == 0
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


async def _snapshot(db: AsyncSession) -> dict[str, object]:
    async def count(model: type) -> int:
        return await db.scalar(select(func.count()).select_from(model)) or 0

    statuses = (
        await db.execute(
            select(Booking.status, func.count())
            .where(Booking.organisation_id == seed.STUDIO_ID)
            .group_by(Booking.status)
        )
    ).all()
    return {
        "bookings": {row[0]: row[1] for row in statuses},
        "services": await count(Service),
        "providers": await count(Provider),
        "profiles": await count(BookingProfile),
        "organisers": await count(Organiser),
        "listings": await count(Listing),
        "orders": await count(Order),
        "tickets": await count(Ticket),
        "outbox": await count(Outbox),
    }


@pytest.mark.asyncio
async def test_seed_builds_the_demo_and_a_second_run_adds_nothing(
    db_async: AsyncSession,
) -> None:
    first = await seed.seed_demo(db_async)
    after_first = await _snapshot(db_async)
    second = await seed.seed_demo(db_async)
    after_second = await _snapshot(db_async)

    assert first.created
    assert second.created == []
    assert after_first == after_second

    assert after_first["bookings"] == {
        "confirmed": 3,  # two upcoming, one with a paid deposit
        "completed": 1,
        "no_show": 1,
        "cancelled": 1,
        "pending": 1,
        "pending_payment": 1,
    }
    assert after_first["services"] == 3
    assert after_first["providers"] == 2
    assert after_first["listings"] == 2
    assert after_first["orders"] == 3
    assert after_first["tickets"] == 3  # 2 General + 1 Entry; the VIP order is unpaid

    apps = set(
        await db_async.scalars(
            select(OrganisationApp.app_key).where(
                OrganisationApp.organisation_id == seed.STUDIO_ID
            )
        )
    )
    assert {"bookings", "events", "payments"} <= apps

    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == seed.STUDIO_ID)
    )
    assert profile is not None
    assert (profile.timezone, profile.currency) == ("America/Grenada", "XCD")
    deposits = await db_async.scalar(
        select(func.count())
        .select_from(Service)
        .where(Service.organisation_id == seed.STUDIO_ID, Service.deposit_minor > 0)
    )
    assert deposits == 1

    verified = await db_async.scalar(
        select(PlatformOrganisation.verified_at)
        .join(Organiser, Organiser.organisation_id == PlatformOrganisation.id)
        .where(Organiser.slug == seed.ORGANISER_SLUG)
    )
    pending = await db_async.scalar(
        select(PlatformOrganisation.verified_at)
        .join(Organiser, Organiser.organisation_id == PlatformOrganisation.id)
        .where(Organiser.slug == seed.PENDING_ORGANISER_SLUG)
    )
    assert verified is not None
    assert pending is None


@pytest.mark.asyncio
async def test_nothing_is_left_to_email_a_demo_address(db_async: AsyncSession) -> None:
    await seed.seed_demo(db_async)
    waiting = await db_async.scalars(select(Outbox).where(Outbox.status == "pending"))
    for row in waiting:
        assert "example.com" not in str(row.payload)
        assert row.organisation_id != seed.STUDIO_ID
