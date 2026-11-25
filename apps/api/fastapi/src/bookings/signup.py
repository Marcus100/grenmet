"""Businesses sign themselves up (ADR-0066 slice 2).

``router.create_my_organisation`` runs this module. The order matters:

1. ``require_self_signup_enabled`` answers 404 while the switch is off, before any work.
2. ``prepare_organisation`` locks the account, then creates the organisation for this
   key if it is not there yet. The idempotency claim is a foreign key to the organisation,
   so the row must exist before the claim. The row is deterministic
   (``organisation_id_for``), so a replay finds the same row. A refused request rolls it
   back with the rest of the transaction (``get_db`` never commits on an error).
3. ``create_business`` runs once per key inside the idempotency claim: one business per
   account, the profile (closed and unlisted), the owner, the entitlements (source
   ``trial``), the starter services, the owner's provider with default hours, the trial
   with its end stored, and the sender-name review flag.
"""

import hashlib
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.billing import app_subscriptions as billing_subscriptions
from src.config import settings
from src.email import business_sender_name
from src.organisations import grants
from src.organisations import service as organisation_service
from src.organisations.models import (
    EntitlementSource,
    MembershipRole,
    OrganisationKind,
    PlatformOrganisation,
)
from src.turnstile import FixedPolicy, SitePolicy, turnstile_settings
from src.utils.datetime import utc_now
from src.utils.reserved_names import is_reserved

from . import service
from .config import bookings_settings
from .exceptions import BookingConflictError, SelfSignupDisabledError
from .models import BookingProfile, Provider
from .schemas import (
    LISTING_PATH_WORDS,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingServiceCreate,
    BookingSignupCreate,
    BookingSignupReceipt,
    BookingWorkingHoursUpdate,
    BookingWorkingPeriodIn,
)
from .templates import (
    DEFAULT_CLOSE,
    DEFAULT_OPEN,
    DEFAULT_WEEKDAYS,
    STARTER_TEMPLATES,
    StarterTemplate,
)

logger = logging.getLogger(__name__)

#: The trial a self-created business gets, on the bookings plan (ADR-0066 item 5).
TRIAL_DAYS = 30
PLAN_KEY = "bookings-monthly"
BOOKINGS_APP = "bookings"
#: Grenada: every self-created business starts on this time zone and currency.
COUNTRY_TIMEZONE = "America/Grenada"
COUNTRY_CURRENCY = "XCD"
SIGNUP_SCOPE = "bookings.signup"
#: The account-level right every signed-in account holds (granted on first sign-in).
BOOKINGS_ACCESS_KEY = "app.bookings.access"
_MIN_SLUG_LENGTH = 3
_MAX_SLUG_LENGTH = 60


def require_self_signup_enabled() -> None:
    """Refuse while ``BOOKINGS_SELF_SIGNUP_ENABLED`` is off: 404, like a missing route."""
    if not bookings_settings.SELF_SIGNUP_ENABLED:
        raise SelfSignupDisabledError()


def signup_turnstile_policy() -> SitePolicy | None:
    """Outside local development the check always runs with the global secret, whatever
    the global switch says (ADR-0066 item 1). Local follows the global switch."""
    if settings.ENVIRONMENT == "local":
        return None
    return FixedPolicy("enforce", turnstile_settings.TURNSTILE_SECRET_KEY)


def organisation_id_for(user_id: uuid.UUID, key: str) -> str:
    """The organisation a sign-up key creates: ``org_<16 hex>``, derived from the account
    and the key, so a replay of the same key finds the same row."""
    digest = hashlib.sha256(f"bookings-signup|{user_id}|{key}".encode()).hexdigest()
    return f"org_{digest[:16]}"


async def prepare_organisation(
    session: AsyncSession, *, user: User, key: str, name: str
) -> PlatformOrganisation:
    """Lock the account, then create this key's organisation unless it already exists.
    Flushes; the caller's transaction decides whether it is kept."""
    await grants.lock_user(session, user.id)
    await lock_name(session, name)
    organisation_id = organisation_id_for(user.id, key)
    existing = await session.get(PlatformOrganisation, organisation_id)
    if existing is not None:
        return existing
    return await organisation_service.create_organisation(
        session,
        name=name,
        kind=OrganisationKind.BUSINESS,
        organisation_id=organisation_id,
        created_by_user_id=user.id,
    )


async def lock_name(session: AsyncSession, name: str) -> None:
    """Serialise sign-ups whose names make the same address. Both slugs (the
    organisation's and the booking page's) are chosen by a read and then inserted into
    a unique column, so two accounts signing up as "Nail Bar" at once would both pick
    ``nail-bar`` and the second would fail. Under this transaction-scoped lock the second
    waits, then sees the first's row and takes ``nail-bar-2``. Taken after the account
    lock, so the lock order is always account, then name."""
    base = organisation_service.slugify(name)[:_MAX_SLUG_LENGTH].strip("-")
    await session.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(f"bookings-signup-name:{base}", 0)
            )
        )
    )


async def create_business(
    session: AsyncSession,
    *,
    user: User,
    organisation: PlatformOrganisation,
    payload: BookingSignupCreate,
) -> dict[str, Any]:
    """Everything a sign-up creates, in the caller's transaction. Returns the JSON-safe
    receipt that the idempotency row stores."""
    now = utc_now()
    if await session.scalar(
        select(BookingProfile.id).where(
            BookingProfile.organisation_id == organisation.id
        )
    ):
        # The key's stored answer was purged (its TTL passed) after the first run made the
        # business. A repeat must not build it again.
        raise BookingConflictError(
            "This sign-up already made a business; open it in Studio."
        )
    await _refuse_a_second_business(session, user.id, organisation.id)
    public_slug = await public_slug_for(session, payload.name)
    profile = await service.upsert_profile(
        session,
        organisation_id=organisation.id,
        payload=BookingProfileUpdate(
            public_slug=public_slug,
            display_name=payload.name,
            enabled=False,
            listed=False,
            timezone=COUNTRY_TIMEZONE,
            currency=COUNTRY_CURRENCY,
            requires_confirmation=True,
            city=payload.town,
            business_type=payload.business_type,
        ),
    )
    await organisation_service.add_member(
        session,
        organisation_id=organisation.id,
        user_id=user.id,
        role=MembershipRole.OWNER,
    )
    await organisation_service.set_app_enabled(
        session,
        organisation_id=organisation.id,
        app_key=BOOKINGS_APP,
        enabled=True,
        source=EntitlementSource.TRIAL,
    )

    template = STARTER_TEMPLATES[payload.template] if payload.template else None
    service_ids = await _starter_services(session, organisation.id, template)
    created = await service.create_provider(
        session,
        organisation_id=organisation.id,
        payload=BookingProviderCreate(name=_owner_name(user), service_ids=service_ids),
    )
    provider = await session.get(Provider, created["id"])
    if provider is None:
        raise RuntimeError("Provider vanished inside its own transaction")
    await service.replace_working_hours(session, provider, _default_hours())
    profile.owner_provider_id = provider.id

    trial_ends_at = now + timedelta(days=TRIAL_DAYS)
    await billing_subscriptions.grant_trial(
        session,
        organisation_id=organisation.id,
        plan_key=PLAN_KEY,
        trial_days=TRIAL_DAYS,
        trial_ends_at=trial_ends_at,
    )

    flagged = _flag_sender_name(profile, payload.name, now)
    await session.flush()
    receipt = BookingSignupReceipt(
        organisation_id=organisation.id,
        slug=organisation.slug,
        public_slug=public_slug,
        display_name=payload.name,
        business_type=payload.business_type,
        template=payload.template,
        trial_ends_at=trial_ends_at,
        name_flagged=flagged,
    )
    return receipt.model_dump(mode="json")


async def public_slug_for(session: AsyncSession, name: str) -> str:
    """A free booking address for the name. A reserved word, a listing path word or a
    taken address gets a numeric suffix, as organisation slugs do."""
    base = organisation_service.slugify(name)[:_MAX_SLUG_LENGTH].strip("-")
    if len(base) < _MIN_SLUG_LENGTH:
        base = f"{base or 'business'}-business"
    candidate, number = base, 1
    while await _slug_taken(session, candidate):
        number += 1
        suffix = f"-{number}"
        candidate = f"{base[: _MAX_SLUG_LENGTH - len(suffix)]}{suffix}"
    return candidate


async def _slug_taken(session: AsyncSession, candidate: str) -> bool:
    if is_reserved(candidate) or candidate in LISTING_PATH_WORDS:
        return True
    taken = await session.scalar(
        select(BookingProfile.id).where(BookingProfile.public_slug == candidate)
    )
    return taken is not None


async def _refuse_a_second_business(
    session: AsyncSession, user_id: uuid.UUID, organisation_id: str
) -> None:
    """One self-created business per account. The account row is locked by
    ``prepare_organisation``, so two racing sign-ups cannot both pass this count."""
    count = await session.scalar(
        select(func.count(PlatformOrganisation.id)).where(
            PlatformOrganisation.created_by_user_id == user_id,
            PlatformOrganisation.id != organisation_id,
        )
    )
    if count:
        raise BookingConflictError(
            "This account already has a business. Barrels staff can add another."
        )


async def _starter_services(
    session: AsyncSession, organisation_id: str, template: StarterTemplate | None
) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    for order, item in enumerate(template.services if template else ()):
        created = await service.create_service(
            session,
            organisation_id=organisation_id,
            payload=BookingServiceCreate(
                name=item.name,
                duration_min=item.duration_min,
                price_minor=item.price_ec * 100,
                sort_order=order,
            ),
        )
        ids.append(created.id)
    return ids


def _default_hours() -> BookingWorkingHoursUpdate:
    return BookingWorkingHoursUpdate(
        periods=[
            BookingWorkingPeriodIn(
                weekday=day, start_time=DEFAULT_OPEN, end_time=DEFAULT_CLOSE
            )
            for day in DEFAULT_WEEKDAYS
        ]
    )


def _owner_name(user: User) -> str:
    return user.full_name.strip()[:120] or "Owner"


def _flag_sender_name(profile: BookingProfile, name: str, now: datetime) -> bool:
    """A name the sender-name guard refuses still creates the business; staff review it."""
    if business_sender_name(name):
        return False
    profile.sender_name_flagged_at = now
    logger.info(
        "Self sign-up name refused by the sender-name guard; flagged for review",
        extra={"organisation_id": profile.organisation_id},
    )
    return True


def template_view(template: StarterTemplate) -> dict[str, Any]:
    """A starter template as the API shows it (prices in XCD minor units)."""
    return {
        "key": template.key,
        "label": template.label,
        "business_type": template.business_type,
        "services": [
            {
                "name": item.name,
                "duration_min": item.duration_min,
                "price_minor": item.price_ec * 100,
            }
            for item in template.services
        ],
    }
