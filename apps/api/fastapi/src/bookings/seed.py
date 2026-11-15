"""Babydoll Beauty Bar tenant seed (B4), run on demand and never at startup.

Creates the ``babydoll`` client organisation, its ``bookings`` and ``contacts``
entitlements, the booking profile (``babydoll-beauty-bar``), the services the
site lists, one provider with weekly hours and the ``babydoll`` public site.

Idempotent and create-only: a second run adds nothing and never overwrites what
the studio has edited since. Run it from ``apps/api/fastapi``::

    uv run --frozen --package fast-back python -m src.bookings.seed --dry-run
    uv run --frozen --package fast-back python -m src.bookings.seed
    uv run --frozen --package fast-back python -m src.bookings.seed --notify-email <address>

``--dry-run`` reports what would be created and rolls back. ``--notify-email``
sets the studio's notification address, but only when this run creates the
profile; an existing profile keeps its value and the output says so. The address
is never defaulted or read from the environment. The site address
comes from ``BOOKINGS_BABYDOLL_SITE_URL`` (default ``https://babydoll.barrels.gd``);
the manage link in emails points at the bookings app (``BOOKINGS_APP_URL``),
where the manage-booking page lives.
"""

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import time

from pydantic import EmailStr, TypeAdapter, ValidationError
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
PRODUCTION_APP_URL = "https://bookings.barrels.gd"
SITE_KEY = "babydoll"
PROVIDER_NAME = "Jeriann"
ENTITLEMENTS = ("bookings", "contacts")
_LOCK_ID = 73190507

#: Services mirror ``SERVICE_MENU`` in apps/web/babydoll/src/data/site.ts (names
#: and XCD prices; add-ons are booked with another service and are left out).
#: The services, prices and durations were confirmed by the studio on 14 Nov 2026.
#: (category, name, minutes, price in whole XCD, note)
_MENU: tuple[tuple[str, str, int, int, str | None], ...] = (
    ("Lashes", "Luxe Classic", 150, 210, "Consultation required."),
    ("Lashes", "Hybrid", 150, 225, None),
    ("Lashes", "Volume", 150, 245, None),
    ("Lashes", "Lash touch-up", 60, 65, "At one week."),
    ("Lashes", "Refill, 2–3 weeks", 120, 130, "Book while 40%+ of extensions remain."),
    ("Lashes", "Professional removal", 40, 45, None),
    ("Brows", "Signature brow sculpt & wax", 30, 40, None),
    ("Brows", "Hybrid brow tint / stain", 20, 60, None),
    ("Brows", "Hybrid brow tint & wax", 60, 100, None),
    ("Brows", "Brow lamination", 60, 180, None),
    ("Brows", "Lamination maintenance", 45, 100, "At 2–3 weeks."),
    ("Facials & waxing", "Custom facial", 60, 180, None),
    ("Facials & waxing", "Upper lip", 15, 15, None),
    ("Facials & waxing", "Chin", 30, 25, None),
)

#: Published hours (``HOURS`` in site.ts): Mon-Fri 9:30-17:30, Sat 9:00-17:30.
_HOURS = [
    BookingWorkingPeriodIn(weekday=day, start_time=time(9, 30), end_time=time(17, 30))
    for day in range(5)
] + [BookingWorkingPeriodIn(weekday=5, start_time=time(9, 0), end_time=time(17, 30))]

#: Minutes kept free after each seeded service for clean-up (studio request).
SERVICE_BUFFER_AFTER_MIN = 15


@dataclass
class SeedResult:
    created: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.created)


def _check_notify_email(value: str) -> str:
    """Return ``value`` if it is a valid email address, else raise ValueError."""
    try:
        return TypeAdapter(EmailStr).validate_python(value)
    except ValidationError as error:
        raise ValueError("notify email must be a valid email address") from error


def _notify_email_arg(value: str) -> str:
    """argparse type for ``--notify-email``: a clean usage error, before any write."""
    try:
        return _check_notify_email(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def _site_url() -> str:
    return bookings_settings.BABYDOLL_SITE_URL.rstrip("/")


def _manage_url_template() -> str:
    """Manage link for emails: the bookings app's page for this studio."""
    app_url = bookings_settings.APP_URL.rstrip("/")
    if not app_url.startswith("https://"):
        # Local development sets an http address; a manage link must be https.
        app_url = PRODUCTION_APP_URL
    return f"{app_url}/{PUBLIC_SLUG}/booking/{{token}}"


async def seed_babydoll(
    session: AsyncSession, *, notify_email: str | None = None
) -> SeedResult:
    """Create what is missing for Babydoll. Flushes; the caller commits.

    ``notify_email`` is applied only when this call creates the profile.
    """
    checked_email = None if notify_email is None else _check_notify_email(notify_email)
    await session.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _LOCK_ID})
    result = SeedResult()
    site_url = _site_url()

    if await session.get(PlatformOrganisation, ORGANISATION_ID) is None:
        await organisation_service.create_organisation(
            session,
            name=ORGANISATION_NAME,
            kind=OrganisationKind.CLIENT,
            slug="babydoll",
            reserved_ok=True,
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
                notify_email=checked_email,
                manage_url_template=_manage_url_template(),
            ),
        )
        result.created.append("profile")
    elif checked_email is not None:
        result.notes.append(
            "notify_email not applied: the profile already exists, so the "
            "studio's value is kept"
        )

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
                buffer_after_min=SERVICE_BUFFER_AFTER_MIN,
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


async def run(*, dry_run: bool, notify_email: str | None = None) -> int:
    from src.database import async_session_factory

    async with async_session_factory() as session:
        result = await seed_babydoll(session, notify_email=notify_email)
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
    sys.stdout.write(
        json.dumps({"dry_run": dry_run, **asdict(result)}, ensure_ascii=False) + "\n"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--notify-email",
        type=_notify_email_arg,
        metavar="<address>",
        default=None,
        help="studio notification address, applied only when this run creates the profile",
    )
    return parser


if __name__ == "__main__":
    args = build_parser().parse_args()
    raise SystemExit(
        asyncio.run(run(dry_run=args.dry_run, notify_email=args.notify_email))
    )
