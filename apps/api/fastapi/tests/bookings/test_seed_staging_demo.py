"""The staging demo seed: refuses outside staging, and is safe to run twice."""

import importlib.util
import sys
from types import ModuleType

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.bookings import transitions
from src.bookings.models import (
    Booking,
    BookingEvent,
    BookingProfile,
    BookingStatus,
    Provider,
    Service,
    WorkingHours,
)
from src.config import settings
from src.events.models import Activity, Listing, Order, Organiser, Ticket
from src.organisations.models import (
    Membership,
    OrganisationApp,
    PlatformOrganisation,
)
from src.outbox import Outbox
from tests.events.support import ROOT
from tests.factories import make_user


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
        seed.check_allowed(environment, "true", "app_staging")


@pytest.mark.parametrize("flag", [None, "", "false", "1", "yes"])
def test_refuses_without_the_explicit_flag(flag: str | None) -> None:
    with pytest.raises(seed.DemoSeedRefusedError, match="DEMO_SEED_ENABLED"):
        seed.check_allowed("staging", flag, "app_staging")


def test_allows_staging_with_the_flag() -> None:
    seed.check_allowed("staging", "true", "app_staging")
    seed.check_allowed("staging", " TRUE ", "grenmet_staging")


@pytest.mark.parametrize(
    "database", ["app", "grenmet", "app_production", "staging", ""]
)
def test_refuses_a_database_that_is_not_a_staging_one(database: str) -> None:
    with pytest.raises(seed.DemoSeedRefusedError, match="staging database"):
        seed.check_allowed("staging", "true", database)


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["production", "local"])
async def test_run_refuses_and_writes_nothing(
    environment: str, monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "POSTGRES_DB", "app_staging")
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    with pytest.raises(seed.DemoSeedRefusedError):
        await seed.run(apply=True, member_email=None)
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_run_refuses_staging_without_the_flag(
    monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.setattr(settings, "POSTGRES_DB", "app_staging")
    monkeypatch.delenv("DEMO_SEED_ENABLED", raising=False)
    with pytest.raises(seed.DemoSeedRefusedError):
        await seed.run(apply=True, member_email=None)
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_preview_writes_nothing(
    monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.setattr(settings, "POSTGRES_DB", "app_staging")
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


@pytest.mark.asyncio
async def test_run_refuses_a_non_staging_database_and_writes_nothing(
    monkeypatch: pytest.MonkeyPatch, db_async: AsyncSession
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    monkeypatch.setattr(settings, "POSTGRES_DB", "app")
    monkeypatch.setenv("DEMO_SEED_ENABLED", "true")
    with pytest.raises(seed.DemoSeedRefusedError, match="staging database"):
        await seed.run(apply=True, member_email=None)
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_every_booking_history_uses_only_legal_transitions(
    db_async: AsyncSession,
) -> None:
    await seed.seed_demo(db_async)
    bookings = (
        await db_async.scalars(
            select(Booking).where(Booking.organisation_id == seed.STUDIO_ID)
        )
    ).all()
    assert len(bookings) == len(seed.BOOKINGS)
    for booking in bookings:
        events = (
            await db_async.scalars(
                select(BookingEvent)
                .where(BookingEvent.booking_id == booking.id)
                .order_by(BookingEvent.created_at, BookingEvent.id)
            )
        ).all()
        assert events
        assert events[0].from_status is None
        previous = None
        for event in events:
            if previous is not None:
                assert event.from_status == previous
            if event.from_status is not None and event.from_status != event.to_status:
                assert transitions.can_transition(
                    BookingStatus(event.from_status), BookingStatus(event.to_status)
                ), (booking.notes, event.from_status, event.to_status)
            previous = event.to_status
        assert previous == booking.status


@pytest.mark.asyncio
async def test_every_booking_sits_inside_its_providers_hours(
    db_async: AsyncSession,
) -> None:
    await seed.seed_demo(db_async)
    rows = (
        await db_async.execute(
            select(Booking, Provider.id)
            .join(Provider, Provider.id == Booking.provider_id)
            .where(Booking.organisation_id == seed.STUDIO_ID)
        )
    ).all()
    assert rows
    for booking, provider_id in rows:
        local_start = booking.starts_at + seed.GRENADA_OFFSET
        local_end = booking.ends_at + seed.GRENADA_OFFSET
        periods = (
            await db_async.scalars(
                select(WorkingHours).where(
                    WorkingHours.provider_id == provider_id,
                    WorkingHours.weekday == local_start.weekday(),
                )
            )
        ).all()
        assert any(
            p.start_time <= local_start.time() and local_end.time() <= p.end_time
            for p in periods
        ), (booking.notes, local_start)


@pytest.mark.asyncio
async def test_online_bookings_come_from_the_public_path(
    db_async: AsyncSession,
) -> None:
    await seed.seed_demo(db_async)
    rows = (
        await db_async.scalars(
            select(Booking).where(
                Booking.organisation_id == seed.STUDIO_ID,
                Booking.source == "online",
            )
        )
    ).all()
    by_note = {row.notes: row for row in rows}
    assert set(by_note) == {
        "[demo] pending",
        "[demo] deposit-unpaid",
        "[demo] deposit-paid",
    }
    assert by_note["[demo] deposit-unpaid"].status == "pending_payment"
    assert by_note["[demo] deposit-unpaid"].deposit_minor > 0
    assert by_note["[demo] deposit-paid"].status == "confirmed"


@pytest.mark.asyncio
async def test_member_email_becomes_owner_of_both_demo_organisations(
    db_async: AsyncSession,
) -> None:
    member = await make_user(db_async, email="Tester.Mixed@Example.org")
    await seed.seed_demo(db_async, member_email="  tester.mixed@example.ORG ")
    organiser_org = await db_async.scalar(
        select(Organiser.organisation_id).where(Organiser.slug == seed.ORGANISER_SLUG)
    )
    for organisation_id in (seed.STUDIO_ID, organiser_org):
        role = await db_async.scalar(
            select(Membership.role).where(
                Membership.organisation_id == organisation_id,
                Membership.user_id == member.id,
            )
        )
        assert role == "owner"


@pytest.mark.asyncio
async def test_unknown_member_email_is_refused_before_anything_is_written(
    db_async: AsyncSession,
) -> None:
    with pytest.raises(seed.DemoSeedRefusedError, match="No account"):
        await seed.seed_demo(db_async, member_email="nobody@example.org")
    assert await db_async.get(PlatformOrganisation, seed.STUDIO_ID) is None


@pytest.mark.asyncio
async def test_the_organiser_is_approved_by_the_demo_moderator(
    db_async: AsyncSession,
) -> None:
    await seed.seed_demo(db_async)
    actor = await db_async.scalar(
        select(Activity.actor_id)
        .join(Organiser, Organiser.id == Activity.organiser_id)
        .where(
            Organiser.slug == seed.ORGANISER_SLUG,
            Activity.action == "organiser.verified",
        )
    )
    moderator = await db_async.scalar(
        select(User.id).where(User.email == seed.email_for("moderator"))
    )
    organiser_owner = await db_async.scalar(
        select(User.id).where(User.email == seed.email_for("organiser"))
    )
    assert actor == moderator
    assert actor != organiser_owner
