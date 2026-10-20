"""Babydoll Beauty Bar tenant seed (B4), run on demand and never at startup.

Creates the ``babydoll`` client organisation, its ``bookings`` and ``contacts``
entitlements, the booking profile (``babydoll-beauty-bar``), the services the
site lists, one provider with weekly hours and the ``babydoll`` public site.

Idempotent and create-only: a second run adds nothing and never overwrites what
the studio has edited since. Run it from ``apps/api/fastapi``::

    uv run --frozen --package fast-back python -m src.bookings.seed --dry-run
    uv run --frozen --package fast-back python -m src.bookings.seed

``--dry-run`` reports what would be created and rolls back. The site address
comes from ``BOOKINGS_BABYDOLL_SITE_URL`` (default ``https://babydoll.barrels.gd``).
"""

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import time

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import service as organisation_service
from src.organisations.models import (
    OrganisationApp,
    OrganisationKind,
    PlatformOrganisation,
    PublicSite,
    TurnstileMode,
    new_public_site_id,
)

from . import service
from .config import bookings_settings
from .models import BookingProfile, Provider, Service
from .schemas import (
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingServiceCreate,
    BookingWorkingHoursUpdate,
    BookingWorkingPeriodIn,
)

ORGANISATION_ID = "babydoll"
ORGANISATION_NAME = "Babydoll Beauty Bar"
PUBLIC_SLUG = "babydoll-beauty-bar"
SITE_KEY = "babydoll"
PROVIDER_NAME = "Jeriann"
ENTITLEMENTS = ("bookings", "contacts")
_LOCK_ID = 73190507

#: Services mirror ``SERVICE_MENU`` in apps/web/babydoll/src/data/site.ts (names
#: and XCD prices; add-ons are booked with another service and are left out).
#: The site publishes no durations: the minutes below are working assumptions
#: for the studio to correct. (category, name, minutes, price in whole XCD, note)
_MENU: tuple[tuple[str, str, int, int, str | None], ...] = (
    ("Lashes", "Luxe Classic", 120, 210, "Consultation required."),
    ("Lashes", "Hybrid", 135, 225, None),
    ("Lashes", "Volume", 150, 245, None),
    ("Lashes", "Lash touch-up", 45, 65, "At one week."),
    ("Lashes", "Refill, 2–3 weeks", 90, 130, "Book while 40%+ of extensions remain."),
    ("Lashes", "Professional removal", 30, 45, None),
    ("Brows", "Signature brow sculpt & wax", 30, 40, None),
    ("Brows", "Hybrid brow tint / stain", 30, 60, None),
    ("Brows", "Hybrid brow tint & wax", 45, 100, None),
    ("Brows", "Brow lamination", 75, 180, None),
    ("Brows", "Lamination maintenance", 45, 100, "At 2–3 weeks."),
    ("Facials & waxing", "Custom facial", 75, 180, None),
    ("Facials & waxing", "Upper lip", 15, 15, None),
    ("Facials & waxing", "Chin", 15, 25, None),
)

#: Published hours (``HOURS`` in site.ts): Mon-Fri 9:30-17:30, Sat 9:00-17:30.
_HOURS = [
    BookingWorkingPeriodIn(weekday=day, start_time=time(9, 30), end_time=time(17, 30))
    for day in range(5)
] + [BookingWorkingPeriodIn(weekday=5, start_time=time(9, 0), end_time=time(17, 30))]


@dataclass
class SeedResult:
    created: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.created)


def _site_url() -> str:
    return bookings_settings.BABYDOLL_SITE_URL.rstrip("/")


async def seed_babydoll(session: AsyncSession) -> SeedResult:
    """Create what is missing for Babydoll. Flushes; the caller commits."""
    await session.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _LOCK_ID})
    result = SeedResult()
    site_url = _site_url()

    if await session.get(PlatformOrganisation, ORGANISATION_ID) is None:
        await organisation_service.create_organisation(
            session,
            name=ORGANISATION_NAME,
            kind=OrganisationKind.CLIENT,
            slug="babydoll",
            organisation_id=ORGANISATION_ID,
        )
        result.created.append("organisation")

    for key in ENTITLEMENTS:
        if await session.get(OrganisationApp, (ORGANISATION_ID, key)) is None:
            await organisation_service.set_app_enabled(
                session, organisation_id=ORGANISATION_ID, app_key=key, enabled=True
            )
            result.created.append(f"entitlement:{key}")

    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == ORGANISATION_ID)
    )
    if profile is None:
        await service.upsert_profile(
            session,
            organisation_id=ORGANISATION_ID,
            payload=BookingProfileUpdate(
                public_slug=PUBLIC_SLUG,
                display_name=ORGANISATION_NAME,
                enabled=True,
                timezone="America/Grenada",
                currency="XCD",
                slot_step_min=30,
                lead_time_min=24 * 60,
                horizon_days=60,
                cancel_cutoff_hours=24,
                requires_confirmation=True,
                manage_url_template=f"{site_url}/booking/{{token}}",
            ),
        )
        result.created.append("profile")

    existing = set(
        await session.scalars(
            select(Service.name).where(Service.organisation_id == ORGANISATION_ID)
        )
    )
    for order, (category, name, minutes, price, note) in enumerate(_MENU):
        if name in existing:
            continue
        await service.create_service(
            session,
            organisation_id=ORGANISATION_ID,
            payload=BookingServiceCreate(
                name=name,
                category=category,
                description=note,
                duration_min=minutes,
                price_minor=price * 100,
                sort_order=order,
            ),
        )
        result.created.append(f"service:{name}")

    provider = await session.scalar(
        select(Provider).where(
            Provider.organisation_id == ORGANISATION_ID,
            Provider.name == PROVIDER_NAME,
        )
    )
    if provider is None:
        service_ids = list(
            await session.scalars(
                select(Service.id).where(Service.organisation_id == ORGANISATION_ID)
            )
        )
        created = await service.create_provider(
            session,
            organisation_id=ORGANISATION_ID,
            payload=BookingProviderCreate(name=PROVIDER_NAME, service_ids=service_ids),
        )
        provider = await session.get(Provider, created["id"])
        if provider is None:
            raise RuntimeError("Provider vanished inside its own transaction")
        await service.replace_working_hours(
            session, provider, BookingWorkingHoursUpdate(periods=_HOURS)
        )
        result.created.append("provider")

    site = await session.scalar(select(PublicSite).where(PublicSite.key == SITE_KEY))
    if site is None:
        session.add(
            PublicSite(
                id=new_public_site_id(),
                organisation_id=ORGANISATION_ID,
                key=SITE_KEY,
                name=ORGANISATION_NAME,
                site_url=site_url,
                accepts_contact=False,
                accepts_subscriptions=False,
                turnstile_mode=TurnstileMode.INHERIT.value,
            )
        )
        result.created.append("public_site")
    elif site.organisation_id != ORGANISATION_ID:
        raise ValueError(f"Public site '{SITE_KEY}' belongs to another organisation")
    await session.flush()
    return result


async def run(*, dry_run: bool) -> int:
    from src.database import async_session_factory

    async with async_session_factory() as session:
        result = await seed_babydoll(session)
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
    sys.stdout.write(
        json.dumps({"dry_run": dry_run, **asdict(result)}, ensure_ascii=False) + "\n"
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    raise SystemExit(asyncio.run(run(dry_run=parser.parse_args().dry_run)))
