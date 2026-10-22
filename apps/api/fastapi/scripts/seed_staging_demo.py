"""Staging-only demo data for Barrels Bookings and Barrels Events.

Creates one synthetic studio (``demo-glow-studio``: profile, two providers with
weekly hours, three services one of which takes a deposit, bookings in every
state), one verified events organiser with two listings, ticket tiers and paid
and unpaid orders, and one pending organiser for the moderation queue. Everything
goes through the same service-layer functions the API uses.

It is for the staging dry-run of a cutover (docs/operations/babydoll-cutover.md)
and for demos. Staging is throwaway; production must never get this data.

Guards (both must hold, checked before anything is opened or written):

* ``ENVIRONMENT`` (the API's own setting) is exactly ``staging``. ``local`` and
  ``production`` are refused; local dev has ``seed_events_demo.py``.
* ``DEMO_SEED_ENABLED`` is ``true`` in the environment of this command.

Synthetic data only: fake names, addresses ``demo-*@example.com`` (RFC 2606
reserved; ``example.test`` is refused by the API's email validation), accounts
with random passwords nobody knows. No mail is sent to them: the run marks the
outbox rows it generates as done. No secrets are read or written.

Idempotent: every item is looked up by a stable key first, so a second run
creates nothing and never overwrites edits. Unpaid bookings and orders are
released by the platform's own expiry jobs after about 30 minutes (that is the
behaviour under test); they are not recreated on a re-run.

Usage, from ``apps/api/fastapi`` inside the staging ``api`` container::

    DEMO_SEED_ENABLED=true python scripts/seed_staging_demo.py            # preview
    DEMO_SEED_ENABLED=true python scripts/seed_staging_demo.py --apply [--member-email you@host]

``--member-email`` adds an existing staging account as owner of the demo studio
and of the verified demo organiser so a tester can sign in to both.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
import uuid
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, time, timedelta
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Iterator

    from sqlalchemy import CursorResult
    from sqlalchemy.ext.asyncio import AsyncSession

    from src.auth.models import User
    from src.organisations.models import MembershipRole

ENABLE_VAR = "DEMO_SEED_ENABLED"
ALLOWED_ENVIRONMENT = "staging"

STUDIO_ID = "demo-glow-studio"
STUDIO_NAME = "Demo Glow Studio (synthetic)"
STUDIO_SLUG = "demo-glow-studio"
ORGANISER_SLUG = "demo-island-events"
PENDING_ORGANISER_SLUG = "demo-pending-promoters"
EMAIL_DOMAIN = "example.com"
GRENADA_OFFSET = timedelta(hours=-4)
_LOCK_ID = 73190508
NOTE_PREFIX = "[demo] "

USERS: dict[str, tuple[str, str]] = {
    "studio": ("Demo", "Studio-Owner"),
    "organiser": ("Demo", "Organiser"),
    "pending": ("Demo", "Pending-Organiser"),
    "buyer1": ("Demo", "Buyer-One"),
    "buyer2": ("Demo", "Buyer-Two"),
    "buyer3": ("Demo", "Buyer-Three"),
}

# (category, name, minutes, price whole XCD, deposit whole XCD)
SERVICES = (
    ("Demo lashes", "Demo classic set", 120, 200, 50),
    ("Demo brows", "Demo brow shape", 30, 40, 0),
    ("Demo facials", "Demo express facial", 45, 90, 0),
)
PROVIDERS = (("Demo Ana", 0), ("Demo Bea", 1))  # name, weekly-hours variant

# key, service index, provider index, day offset, local hour, kind, customer
BOOKINGS = (
    ("confirmed-1", 1, 0, 1, 10, "confirmed", "ca"),
    ("confirmed-2", 2, 1, 2, 14, "confirmed", "cb"),
    ("completed", 1, 0, -3, 11, "completed", "cc"),
    ("no-show", 2, 1, -5, 15, "no_show", "cd"),
    ("cancelled", 1, 1, -2, 9, "cancelled", "ce"),
    ("pending", 1, 0, 3, 10, "pending", "cf"),
    ("deposit-unpaid", 0, 0, 4, 9, "pending_payment", "cg"),
    ("deposit-paid", 0, 1, 5, 9, "deposit_paid", "ch"),
)

# title, summary, category, venue, day offset, tiers (name, minor XCD, allocation)
LISTINGS = (
    (
        "Demo Sunset Fete",
        "A synthetic sunset fete used to test ticketing.",
        "fete",
        "Demo Grounds",
        10,
        (("General", 5000, 100), ("VIP", 12000, 20)),
    ),
    (
        "Demo Night Market",
        "A synthetic night market used to test ticketing.",
        "food",
        "Demo Waterfront",
        14,
        (("Entry", 2500, 200),),
    ),
)

# listing index, tier name, quantity, buyer, paid
ORDERS = (
    (0, "General", 2, "buyer1", True),
    (0, "VIP", 1, "buyer2", False),
    (1, "Entry", 1, "buyer3", True),
)


class DemoSeedRefusedError(RuntimeError):
    """The environment or flag does not allow demo data."""


def check_allowed(environment: str, enabled: str | None) -> None:
    """Raise unless this is staging and the flag is explicitly on."""
    if environment != ALLOWED_ENVIRONMENT:
        raise DemoSeedRefusedError(
            f"Refusing to seed demo data: ENVIRONMENT is '{environment}', "
            f"it must be '{ALLOWED_ENVIRONMENT}'"
        )
    if (enabled or "").strip().lower() != "true":
        raise DemoSeedRefusedError(
            f"Refusing to seed demo data: set {ENABLE_VAR}=true to opt in"
        )


@dataclass
class SeedResult:
    created: list[str] = field(default_factory=list)

    def add(self, what: str) -> None:
        self.created.append(what)


def email_for(key: str) -> str:
    return f"demo-{key}@{EMAIL_DOMAIN}"


def at(now: datetime, days: int, hour: int) -> datetime:
    """Grenada wall-clock ``hour`` on the day ``days`` from today, as aware UTC."""
    today = (now + GRENADA_OFFSET).date()
    local = datetime(today.year, today.month, today.day, hour) + timedelta(days=days)
    return (local - GRENADA_OFFSET).replace(tzinfo=UTC)


@contextmanager
def manual_rail_only() -> Iterator[None]:
    """No Stripe network calls: deposits and orders use the manual rail."""
    from src.payments.config import payments_settings

    before = payments_settings.STRIPE_SECRET_KEY
    payments_settings.STRIPE_SECRET_KEY = None
    try:
        yield
    finally:
        payments_settings.STRIPE_SECRET_KEY = before


async def _user(session: AsyncSession, key: str) -> User:
    from sqlalchemy import select

    from src.auth.models import User
    from src.auth.schemas import UserCreate
    from src.auth.service import create_user
    from src.utils.datetime import utc_now

    email = email_for(key)
    user = await session.scalar(select(User).where(User.email == email))
    if user is not None:
        return user
    first, last = USERS[key]
    user = await create_user(
        session=session,
        user_create=UserCreate(
            email=email,
            username=f"demo_{key}",
            # Random and thrown away: nobody can sign in as a demo account.
            password=secrets.token_urlsafe(24),
            first_name=first,
            last_name=last,
        ),
    )
    user.email_verified_at = utc_now()
    await session.commit()
    return user


async def _entitle(
    session: AsyncSession, organisation_id: str, apps: tuple[str, ...]
) -> list[str]:
    from src.organisations import service as organisations
    from src.organisations.models import OrganisationApp

    made = []
    for key in apps:
        if await session.get(OrganisationApp, (organisation_id, key)) is None:
            await organisations.set_app_enabled(
                session, organisation_id=organisation_id, app_key=key, enabled=True
            )
            made.append(key)
    return made


async def _member(
    session: AsyncSession, organisation_id: str, user: User, role: MembershipRole
) -> bool:
    from sqlalchemy import select

    from src.organisations import service as organisations
    from src.organisations.models import Membership

    if await session.scalar(
        select(Membership.id).where(
            Membership.organisation_id == organisation_id,
            Membership.user_id == user.id,
        )
    ):
        return False
    await organisations.add_member(
        session,
        organisation_id=organisation_id,
        user_id=user.id,
        role=role,
    )
    return True


async def seed_studio(
    session: AsyncSession,
    owner: User,
    member: User | None,
    result: SeedResult,
) -> None:
    from sqlalchemy import select

    from src.bookings import service
    from src.bookings.models import BookingProfile, Provider, Service
    from src.bookings.schemas import (
        BookingProfileUpdate,
        BookingProviderCreate,
        BookingServiceCreate,
        BookingWorkingHoursUpdate,
        BookingWorkingPeriodIn,
    )
    from src.organisations import service as organisations
    from src.organisations.models import (
        MembershipRole,
        OrganisationKind,
        PlatformOrganisation,
    )

    if await session.get(PlatformOrganisation, STUDIO_ID) is None:
        await organisations.create_organisation(
            session,
            name=STUDIO_NAME,
            kind=OrganisationKind.CLIENT,
            slug=STUDIO_SLUG,
            organisation_id=STUDIO_ID,
        )
        result.add("studio:organisation")
    for key in await _entitle(
        session, STUDIO_ID, ("bookings", "contacts", "events", "payments")
    ):
        result.add(f"studio:entitlement:{key}")
    if await _member(session, STUDIO_ID, owner, MembershipRole.OWNER):
        result.add("studio:owner")
    if member is not None and await _member(
        session, STUDIO_ID, member, MembershipRole.OWNER
    ):
        result.add("studio:member")

    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == STUDIO_ID)
    )
    if profile is None:
        await service.upsert_profile(
            session,
            organisation_id=STUDIO_ID,
            payload=BookingProfileUpdate(
                public_slug=STUDIO_SLUG,
                display_name=STUDIO_NAME,
                enabled=True,
                timezone="America/Grenada",
                currency="XCD",
                slot_step_min=30,
                lead_time_min=60,
                horizon_days=60,
                cancel_cutoff_hours=24,
                requires_confirmation=True,
            ),
        )
        result.add("studio:profile")

    existing = set(
        await session.scalars(
            select(Service.name).where(Service.organisation_id == STUDIO_ID)
        )
    )
    for order, (category, name, minutes, price, deposit) in enumerate(SERVICES):
        if name in existing:
            continue
        await service.create_service(
            session,
            organisation_id=STUDIO_ID,
            payload=BookingServiceCreate(
                name=name,
                category=category,
                duration_min=minutes,
                price_minor=price * 100,
                deposit_minor=deposit * 100,
                sort_order=order,
            ),
        )
        result.add(f"studio:service:{name}")

    service_ids = list(
        await session.scalars(
            select(Service.id).where(Service.organisation_id == STUDIO_ID)
        )
    )
    for name, variant in PROVIDERS:
        if await session.scalar(
            select(Provider.id).where(
                Provider.organisation_id == STUDIO_ID, Provider.name == name
            )
        ):
            continue
        created = await service.create_provider(
            session,
            organisation_id=STUDIO_ID,
            payload=BookingProviderCreate(name=name, service_ids=service_ids),
        )
        provider = await session.get(Provider, created["id"])
        assert provider is not None
        # Ana: Mon-Fri 09:00-17:00. Bea: Tue-Sat 10:00-18:00.
        days = range(0, 5) if variant == 0 else range(1, 6)
        start, end = (time(9), time(17)) if variant == 0 else (time(10), time(18))
        await service.replace_working_hours(
            session,
            provider,
            BookingWorkingHoursUpdate(
                periods=[
                    BookingWorkingPeriodIn(weekday=d, start_time=start, end_time=end)
                    for d in days
                ]
            ),
        )
        result.add(f"studio:provider:{name}")
    await session.flush()


async def seed_bookings(
    session: AsyncSession, actor: User, now: datetime, result: SeedResult
) -> None:
    from sqlalchemy import select

    from src.bookings import deposit_payments, public, studio
    from src.bookings.models import (
        Booking,
        BookingSource,
        BookingStatus,
        Provider,
    )
    from src.bookings.models import Service as ServiceRow
    from src.bookings.schemas import BookingStudioCreate
    from src.payments import schemas as payment_schemas
    from src.payments import service as payments_service

    services = [
        await session.scalar(
            select(ServiceRow).where(
                ServiceRow.organisation_id == STUDIO_ID, ServiceRow.name == name
            )
        )
        for _category, name, *_rest in SERVICES
    ]
    providers = [
        await session.scalar(
            select(Provider).where(
                Provider.organisation_id == STUDIO_ID, Provider.name == name
            )
        )
        for name, _variant in PROVIDERS
    ]
    done = set(
        await session.scalars(
            select(Booking.notes).where(
                Booking.organisation_id == STUDIO_ID,
                Booking.notes.like(f"{NOTE_PREFIX}%"),
            )
        )
    )
    for key, s_idx, p_idx, days, hour, kind, who in BOOKINGS:
        note = f"{NOTE_PREFIX}{key}"
        if note in done:
            continue
        svc, provider = services[s_idx], providers[p_idx]
        assert svc is not None
        assert provider is not None
        _status, detail = await studio.create_booking(
            session,
            STUDIO_ID,
            BookingStudioCreate(
                service_id=svc.id,
                provider_id=provider.id,
                starts_at=at(now, days, hour),
                customer_name=f"Demo Customer {who.upper()}",
                customer_email=email_for(f"customer-{who}"),
                customer_phone="+1 473 555 0100",
                notes=note,
            ),
            actor_user_id=None,
            now=now,
        )
        managed = await public.load_by_id(
            session, uuid.UUID(str(detail["id"])), STUDIO_ID, lock=True
        )
        booking = managed.booking
        if kind == "completed":
            await public.transition(
                session, booking, BookingStatus.COMPLETED, note="Demo: done"
            )
        elif kind == "no_show":
            await public.transition(
                session, booking, BookingStatus.NO_SHOW, note="Demo: no show"
            )
        elif kind == "cancelled":
            await public.transition(
                session,
                booking,
                BookingStatus.CANCELLED,
                note="Demo: cancelled by the customer",
            )
        elif kind in ("pending", "pending_payment", "deposit_paid"):
            # studio.create_booking makes confirmed, deposit-free staff entries.
            # Online states are set on the fresh row so that no email and no
            # Stripe call is made; the history says what happened.
            booking.source = BookingSource.ONLINE.value
            target = (
                BookingStatus.PENDING
                if kind == "pending"
                else BookingStatus.PENDING_PAYMENT
            )
            if kind != "pending":
                booking.deposit_minor = svc.deposit_minor
            booking.status = target.value
            public.record_event(
                session,
                booking,
                BookingStatus.CONFIRMED,
                target,
                note="Demo: booked online",
            )
            await session.flush()
            if kind != "pending":
                await deposit_payments.start_manual_deposit(session, booking)
            if kind == "deposit_paid":
                intent = await payments_service.find_by_source(
                    session,
                    organisation_id=STUDIO_ID,
                    source_type=deposit_payments.SOURCE_TYPE,
                    source_id=str(booking.id),
                )
                assert intent is not None
                await payments_service.record_manual_payment(
                    session,
                    organisation_id=STUDIO_ID,
                    intent_id=intent.id,
                    actor=actor,
                    payload=payment_schemas.ManualPaymentCreate(
                        method=payment_schemas.ManualMethod.CASH,
                        reference="demo deposit",
                    ),
                )
                await public.transition(
                    session,
                    booking,
                    BookingStatus.CONFIRMED,
                    note="Demo: deposit received",
                )
        await session.commit()
        result.add(f"studio:booking:{key}")


async def seed_events(
    session: AsyncSession,
    organiser_user: User,
    pending_user: User,
    buyers: dict[str, User],
    member: User | None,
    result: SeedResult,
    now: datetime,
) -> None:
    from sqlalchemy import select

    from src.events import order_fulfilment, order_payments, schemas
    from src.events.models import Listing, Order, Organiser, TicketTier
    from src.events.service import create_listing, create_organiser, ticketing
    from src.organisations import service as organisations
    from src.organisations import verification
    from src.organisations.models import MembershipRole, PlatformOrganisation
    from src.payments import schemas as payment_schemas
    from src.payments import service as payments_service

    organiser = await session.scalar(
        select(Organiser).where(Organiser.slug == ORGANISER_SLUG)
    )
    if organiser is None:
        organiser = await create_organiser(
            session,
            organiser_user,
            name="Demo Island Events",
            slug=ORGANISER_SLUG,
            bio="Synthetic organiser for staging demos.",
        )
        result.add("events:organiser")
    assert organiser.organisation_id is not None
    org_id = organiser.organisation_id
    for key in await _entitle(session, org_id, ("payments",)):
        result.add(f"events:entitlement:{key}")
    if member is not None and await _member(
        session, org_id, member, MembershipRole.OWNER
    ):
        result.add("events:member")
    platform = await session.get(PlatformOrganisation, org_id)
    assert platform is not None
    if platform.verified_at is None:
        # The one write path for decisions; it notifies nobody by itself.
        await organisations.admin_set_verified(
            session,
            organiser_user,
            org_id,
            verified=True,
            reason="Demo seed: synthetic organiser",
        )
        organiser.verified = True
        result.add("events:organiser-verified")
    await session.commit()
    verification.clear_cache(org_id)

    if (
        await session.scalar(
            select(Organiser.id).where(Organiser.slug == PENDING_ORGANISER_SLUG)
        )
        is None
    ):
        await create_organiser(
            session,
            pending_user,
            name="Demo Pending Promoters",
            slug=PENDING_ORGANISER_SLUG,
            bio="Waiting in the moderation queue.",
        )
        await session.commit()
        result.add("events:pending-organiser")

    listings: list[Listing] = []
    for title, summary, category, venue, days, tiers in LISTINGS:
        listing = await session.scalar(
            select(Listing).where(
                Listing.organiser_id == organiser.id, Listing.title == title
            )
        )
        if listing is None:
            starts = at(now, days, 18)
            created = await create_listing(
                session,
                organiser_user,
                schemas.ListingUpsert(
                    title=title,
                    summary=summary,
                    description=summary,
                    category=cast("schemas.Category", category),
                    parish="st-george",
                    venue=venue,
                    starts_at=starts,
                    ends_at=starts + timedelta(hours=5),
                    admission="ticketed",
                    capacity=300,
                    status="published",
                    tiers=[
                        schemas.TierInput(name=n, price_minor=p, allocation=a)
                        for n, p, a in tiers
                    ],
                ),
                [org_id],
            )
            listing = await session.scalar(
                select(Listing).where(Listing.slug == created.slug)
            )
            result.add(f"events:listing:{title}")
        assert listing is not None
        listings.append(listing)

    for l_idx, tier_name, quantity, buyer_key, paid in ORDERS:
        buyer = buyers[buyer_key]
        listing = listings[l_idx]
        if await session.scalar(
            select(Order.id).where(
                Order.listing_id == listing.id, Order.user_id == buyer.id
            )
        ):
            continue
        tier = await session.scalar(
            select(TicketTier).where(
                TicketTier.listing_id == listing.id, TicketTier.name == tier_name
            )
        )
        assert tier is not None
        order = await ticketing.claim_tickets(
            session,
            buyer,
            listing.slug,
            schemas.OrderCreate(
                items=[schemas.OrderItemInput(tier_id=tier.id, quantity=quantity)]
            ),
            idempotency_key=f"demo-seed:{listing.slug}:{buyer_key}",
        )
        if paid:
            intent = await order_payments.intent_for(
                session, organisation_id=org_id, order_id=order.id
            )
            assert intent is not None
            await payments_service.record_manual_payment(
                session,
                organisation_id=org_id,
                intent_id=intent.id,
                actor=organiser_user,
                payload=payment_schemas.ManualPaymentCreate(
                    method=payment_schemas.ManualMethod.CASH,
                    reference="demo order",
                ),
            )
            await order_fulfilment.fulfil_paid(
                session,
                organisation_id=org_id,
                order_id=order.id,
                intent_id=intent.id,
            )
            await session.commit()
        state = "paid" if paid else "unpaid"
        result.add(f"events:order:{listing.slug}:{buyer_key}:{state}")


async def silence_outbox(
    session: AsyncSession, started: datetime, org_ids: list[str]
) -> int:
    """Mark this run's undelivered outbox rows done so no mail or notification
    reaches a demo address and no handler replays demo money events."""
    from sqlalchemy import or_, update

    from src.outbox import Outbox, OutboxStatus

    outcome = await session.execute(
        update(Outbox)
        .where(
            Outbox.status == OutboxStatus.PENDING.value,
            Outbox.created_at >= started,
            or_(
                Outbox.organisation_id.in_(org_ids),
                Outbox.topic == "events.notify",
                Outbox.payload["to_email"].astext.like(f"demo-%@{EMAIL_DOMAIN}"),
            ),
        )
        .values(status=OutboxStatus.DONE.value, last_error="demo seed: not delivered")
    )
    return int(cast("CursorResult[Any]", outcome).rowcount or 0)


async def seed_demo(
    session: AsyncSession, *, member_email: str | None = None
) -> SeedResult:
    """Create what is missing, committing as it goes. Call ``check_allowed``
    first; this function does not know which environment it is in."""
    from sqlalchemy import select

    from src.auth.models import User
    from src.organisations.models import PlatformOrganisation
    from src.utils.datetime import utc_now

    started = utc_now()
    now = started  # naive UTC, like every service-layer timestamp
    result = SeedResult()
    member = None
    if member_email:
        member = await session.scalar(select(User).where(User.email == member_email))
        if member is None:
            raise DemoSeedRefusedError(f"No account with email {member_email}")
    users = {key: await _user(session, key) for key in USERS}
    with manual_rail_only():
        await seed_studio(session, users["studio"], member, result)
        await session.commit()
        await seed_bookings(session, users["studio"], now, result)
        await seed_events(
            session,
            users["organiser"],
            users["pending"],
            {key: users[key] for key in ("buyer1", "buyer2", "buyer3")},
            member,
            result,
            now,
        )
    org_ids = [STUDIO_ID] + list(
        await session.scalars(
            select(PlatformOrganisation.id).where(
                PlatformOrganisation.slug.in_([ORGANISER_SLUG, PENDING_ORGANISER_SLUG])
            )
        )
    )
    silenced = await silence_outbox(session, started, org_ids)
    if silenced:
        result.add(f"outbox:silenced:{silenced}")
    await session.commit()
    return result


def preview() -> dict[str, object]:
    return {
        "dry_run": True,
        "would_create": {
            "studio": STUDIO_ID,
            "services": [s[1] for s in SERVICES],
            "providers": [p[0] for p in PROVIDERS],
            "bookings": [b[0] for b in BOOKINGS],
            "organisers": [ORGANISER_SLUG, PENDING_ORGANISER_SLUG],
            "listings": [spec[0] for spec in LISTINGS],
            "orders": len(ORDERS),
        },
        "note": "pass --apply to write; items already present are skipped",
    }


async def run(*, apply: bool, member_email: str | None) -> int:
    from src.config import settings

    check_allowed(settings.ENVIRONMENT, os.environ.get(ENABLE_VAR))
    if not apply:
        sys.stdout.write(json.dumps(preview(), indent=2) + "\n")
        return 0
    from src.database import async_session_factory

    async with async_session_factory() as session:
        result = await seed_demo(session, member_email=member_email)
    sys.stdout.write(json.dumps({"dry_run": False, **asdict(result)}) + "\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the demo rows")
    parser.add_argument("--member-email", help="existing account to add as owner")
    args = parser.parse_args()
    try:
        return asyncio.run(run(apply=args.apply, member_email=args.member_email))
    except DemoSeedRefusedError as error:
        sys.stderr.write(f"{error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
