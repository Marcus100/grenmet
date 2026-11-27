"""Bookings service: studio configuration and public availability.

Service functions flush; routers commit. Every query is filtered by
``organisation_id`` so one business never sees another's data.
"""

import logging
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import ColumnElement, delete, func, null, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.auth.models import User
from src.contacts.models import Contact
from src.organisations import service as organisation_service
from src.organisations.exceptions import OrganisationAppNotEntitledError
from src.organisations.models import (
    Membership,
    MembershipStatus,
    OrganisationApp,
    OrganisationStatus,
    PlatformOrganisation,
)
from src.pagination import PaginationParams
from src.storage import uploads
from src.storage.models import OrgUpload, UploadStatus
from src.storage.public_url import public_file_url
from src.utils.datetime import utc_now
from src.utils.timezones import local_to_utc, zone

from . import add_ons, availability, deposit_payments, go_live
from .exceptions import (
    BookingConflictError,
    BookingNotFoundError,
    BookingValidationError,
    BusinessPausedError,
)
from .models import (
    ACTIVE_STATUSES,
    AvailabilityException,
    Booking,
    BookingAddOn,
    BookingBusinessType,
    BookingDepositCollection,
    BookingDepositMode,
    BookingProfile,
    BookingStatus,
    BusinessClosure,
    Customer,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
)
from .schemas import (
    BookingClosureCreate,
    BookingExceptionCreate,
    BookingLateFee,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingProviderUpdate,
    BookingPublicService,
    BookingServiceCreate,
    BookingServiceUpdate,
    BookingWorkingHoursUpdate,
)

MAX_AVAILABILITY_DAYS = 14


def as_naive_utc(moment: datetime) -> datetime:
    """Aware input from the API as the naive UTC the database stores."""
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None)


# --- profile -----------------------------------------------------------------------


async def get_profile(session: AsyncSession, organisation_id: str) -> BookingProfile:
    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == organisation_id)
    )
    if profile is None:
        raise BookingNotFoundError("Booking profile")
    return profile


CONTACT_FIELDS = frozenset(
    {"contact_phone", "contact_whatsapp", "contact_instagram", "contact_email"}
)
logger = logging.getLogger(__name__)

#: The logo's and the cover photo's upload purposes (``src/storage/uploads.py``).
LOGO_PURPOSE = "booking-logo"
COVER_PURPOSE = "booking-cover"
#: Profile fields an older client (or the seed) may not send; a PUT that leaves
#: one out keeps the stored value.
KEPT_UNLESS_NAMED = CONTACT_FIELDS | {
    "add_ons_enabled",
    "payment_at_booking",
    "pending_expiry_hours",
    "max_open_per_customer",
    "deposit_mode",
    "deposit_percent",
    "deposit_fixed_minor",
    "deposit_min_price_minor",
    "deposit_non_refundable",
    "booking_policy",
    "deposit_collection",
    "deposit_instructions",
    "deposit_hold_minutes",
    "late_fee_minor",
    "late_grace_min",
    "brand_color",
    "logo_file_id",
    "cover_file_id",
    "business_type",
    "listed",
    "category",
    "short_description",
    "city",
}


async def upsert_profile(
    session: AsyncSession, *, organisation_id: str, payload: BookingProfileUpdate
) -> BookingProfile:
    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == organisation_id)
    )
    taken = await session.scalar(
        select(BookingProfile.id).where(
            BookingProfile.public_slug == payload.public_slug,
            BookingProfile.organisation_id != organisation_id,
        )
    )
    if taken is not None:
        raise BookingConflictError("That booking address is already in use")
    # Contact options, the payment setting and the brand are kept unless the request
    # names them: a client (or a seed) that does not know them must not erase them.
    # An explicit blank or null still clears a contact option or the brand.
    values = payload.model_dump(
        mode="json",
        exclude={
            name
            for name in KEPT_UNLESS_NAMED
            if name not in payload.model_fields_set and profile is not None
        },
    )
    _require_deposit_rule(profile, values)
    was_enabled = profile is not None and profile.enabled
    if "logo_file_id" in values:
        # JSON gives a string; the column takes the UUID the request validated.
        values["logo_file_id"] = payload.logo_file_id
        await _require_logo(organisation_id, payload.logo_file_id, profile)
    if "cover_file_id" in values:
        values["cover_file_id"] = payload.cover_file_id
        await _require_cover(organisation_id, payload.cover_file_id, profile)
    if profile is None:
        if "pending_expiry_hours" in values and values["pending_expiry_hours"] is None:
            # The ORM leaves a None out of an INSERT, so the column's server default
            # (24) would win. A null window is written as SQL NULL here.
            values["pending_expiry_hours"] = null()
        profile = BookingProfile(organisation_id=organisation_id, **values)
        session.add(profile)
    else:
        for key, value in values.items():
            setattr(profile, key, value)
    await go_live.require_ready_to_open(
        session,
        organisation_id=organisation_id,
        profile=profile,
        was_enabled=was_enabled,
    )
    await session.flush()
    return profile


def _require_deposit_rule(
    profile: BookingProfile | None, values: dict[str, Any]
) -> None:
    """A request that leaves one deposit field out keeps the stored one, so the mode
    and its amount can disagree (a percentage mode with no percentage). Refuse that
    as 422 rather than let the database check fail."""
    mode = values.get("deposit_mode", profile.deposit_mode if profile else "none")
    percent = values.get(
        "deposit_percent", profile.deposit_percent if profile else None
    )
    fixed = values.get(
        "deposit_fixed_minor", profile.deposit_fixed_minor if profile else None
    )
    if mode == BookingDepositMode.PERCENT.value and not (
        percent is not None and 1 <= percent <= 100
    ):
        raise BookingValidationError(
            "A percentage deposit needs deposit_percent (1 to 100)"
        )
    if mode == BookingDepositMode.FIXED.value and not (fixed is not None and fixed > 0):
        raise BookingValidationError(
            "A fixed deposit needs deposit_fixed_minor (above 0)"
        )


async def _require_logo(
    organisation_id: str, file_id: uuid.UUID | None, profile: BookingProfile | None
) -> None:
    """A new logo must be a finished upload of this business."""
    await _require_image(
        organisation_id,
        file_id,
        current=profile.logo_file_id if profile is not None else None,
        purpose=LOGO_PURPOSE,
        noun="logo",
    )


async def _require_cover(
    organisation_id: str, file_id: uuid.UUID | None, profile: BookingProfile | None
) -> None:
    """A new cover photo must be a finished upload of this business."""
    await _require_image(
        organisation_id,
        file_id,
        current=profile.cover_file_id if profile is not None else None,
        purpose=COVER_PURPOSE,
        noun="cover photo",
    )


async def _require_image(
    organisation_id: str,
    file_id: uuid.UUID | None,
    *,
    current: uuid.UUID | None,
    purpose: str,
    noun: str,
) -> None:
    """An unchanged image is not checked again, so one stored before a later rule
    stays valid."""
    if file_id is None or current == file_id:
        return
    if not await uploads.file_is_usable(
        file_id, organisation_id=organisation_id, purpose=purpose
    ):
        raise BookingConflictError(
            f"That {noun} is not a finished upload for this business"
        )


# --- services ----------------------------------------------------------------------


async def list_services(
    session: AsyncSession, organisation_id: str, *, active_only: bool = False
) -> list[Service]:
    query = select(Service).where(Service.organisation_id == organisation_id)
    if active_only:
        query = query.where(Service.active.is_(True))
    return list(await session.scalars(query.order_by(Service.sort_order, Service.name)))


async def get_service(
    session: AsyncSession, service_id: uuid.UUID, *, organisation_id: str
) -> Service:
    service = await session.scalar(
        select(Service).where(
            Service.id == service_id, Service.organisation_id == organisation_id
        )
    )
    if service is None:
        raise BookingNotFoundError("Service")
    return service


async def create_service(
    session: AsyncSession, *, organisation_id: str, payload: BookingServiceCreate
) -> Service:
    values = payload.model_dump()
    values["also_add_on"] = values["also_add_on"] and not values["is_add_on"]
    values["add_on_categories"] = _add_on_restriction(
        values["is_add_on"] or values["also_add_on"], values["add_on_categories"]
    )
    service = Service(organisation_id=organisation_id, **values)
    _require_main_service_for_new_clients(service)
    _first_visit_rule(service)
    session.add(service)
    await session.flush()
    return service


def _add_on_restriction(
    is_add_on: bool, categories: Sequence[str] | None
) -> list[str] | None:
    """Categories restrict add-ons (add-on only, or also offered) only: any other
    main service keeps none."""
    return add_ons.normalised_categories(categories) if is_add_on else None


def _require_main_service_for_new_clients(service: Service) -> None:
    """A new-clients-only service is held for staff when booked alone; as an add-on
    it would ride along on another booking unchecked, so the two do not combine."""
    if service.new_clients_only and (service.is_add_on or service.also_add_on):
        raise BookingValidationError(
            "A new-clients-only service cannot also be an add-on"
        )


def _first_visit_rule(service: Service) -> None:
    """The lead time and its categories only mean something on a new-clients-only
    service; any other service keeps none."""
    if not service.new_clients_only:
        service.first_visit_lead_days = None
        service.first_visit_categories = None
    else:
        service.first_visit_categories = add_ons.normalised_categories(
            service.first_visit_categories
        )


async def update_service(
    session: AsyncSession, service: Service, payload: BookingServiceUpdate
) -> Service:
    if payload.is_add_on and not service.is_add_on:
        # Customers reschedule through the main-service availability check, which
        # refuses add-ons; a service with upcoming bookings must stay a main service.
        upcoming = await session.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.service_id == service.id,
                Booking.status.in_([s.value for s in ACTIVE_STATUSES]),
                Booking.starts_at > as_naive_utc(utc_now()),
            )
        )
        if upcoming:
            raise BookingConflictError(
                "This service has upcoming bookings, so it cannot become an add-on yet"
            )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
    if service.deposit_minor > service.price_minor:
        raise BookingValidationError("The deposit cannot exceed the price")
    _require_main_service_for_new_clients(service)
    if service.is_add_on:
        service.also_add_on = False
    service.add_on_categories = _add_on_restriction(
        service.is_add_on or service.also_add_on, service.add_on_categories
    )
    _first_visit_rule(service)
    await session.flush()
    return service


async def resolve_add_ons(
    session: AsyncSession,
    profile: BookingProfile,
    main: Service,
    add_on_ids: Sequence[uuid.UUID],
) -> list[Service]:
    """The add-ons a customer picked, checked on the server: switched on for the
    business, each once, at most ``add_ons.MAX_PER_BOOKING``, active add-ons of
    this organisation, offered with ``main``. Foreign, inactive and unknown ids
    give the same answer, so nothing about another business leaks."""
    if not add_on_ids:
        return []
    if not profile.add_ons_enabled:
        raise BookingValidationError("This business does not offer add-ons")
    if len(set(add_on_ids)) != len(add_on_ids):
        raise BookingValidationError("Choose each add-on once")
    if len(add_on_ids) > add_ons.MAX_PER_BOOKING:
        raise BookingValidationError(
            f"A booking takes at most {add_ons.MAX_PER_BOOKING} add-ons"
        )
    if main.id in add_on_ids:
        raise BookingValidationError("A service cannot be its own add-on")
    rows = await session.scalars(
        select(Service).where(
            Service.id.in_(add_on_ids),
            Service.organisation_id == profile.organisation_id,
            or_(Service.is_add_on.is_(True), Service.also_add_on.is_(True)),
            Service.active.is_(True),
        )
    )
    by_id = {row.id: row for row in rows}
    if len(by_id) != len(add_on_ids):
        raise BookingValidationError("One of the add-ons is not available")
    chosen = [by_id[add_on_id] for add_on_id in add_on_ids]
    for add_on_service in chosen:
        if not add_ons.offered_with(add_on_service.add_on_categories, main.category):
            raise BookingValidationError(
                f"{add_on_service.name} is not offered with this service"
            )
    return chosen


async def booking_add_on_minutes(session: AsyncSession, booking_id: uuid.UUID) -> int:
    """Total length of a booking's stored add-on lines (SQL sum)."""
    total = await session.scalar(
        select(func.coalesce(func.sum(BookingAddOn.duration_min), 0)).where(
            BookingAddOn.booking_id == booking_id
        )
    )
    return int(total or 0)


async def booking_add_on_lines(
    session: AsyncSession, booking_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[BookingAddOn]]:
    """The add-on lines of several bookings, one query, in name order."""
    if not booking_ids:
        return {}
    lines: dict[uuid.UUID, list[BookingAddOn]] = defaultdict(list)
    for line in await session.scalars(
        select(BookingAddOn)
        .where(BookingAddOn.booking_id.in_(booking_ids))
        .order_by(BookingAddOn.name, BookingAddOn.id)
    ):
        lines[line.booking_id].append(line)
    return lines


# --- providers ---------------------------------------------------------------------


async def _service_ids_by_provider(
    session: AsyncSession, provider_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    result: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    if not provider_ids:
        return result
    rows = await session.execute(
        select(ProviderService.provider_id, ProviderService.service_id).where(
            ProviderService.provider_id.in_(provider_ids)
        )
    )
    for provider_id, service_id in rows:
        result[provider_id].append(service_id)
    return result


async def list_providers(
    session: AsyncSession, organisation_id: str, *, active_only: bool = False
) -> list[dict[str, Any]]:
    query = select(Provider).where(Provider.organisation_id == organisation_id)
    if active_only:
        query = query.where(Provider.active.is_(True))
    providers = list(
        await session.scalars(query.order_by(Provider.sort_order, Provider.name))
    )
    services = await _service_ids_by_provider(session, [p.id for p in providers])
    return [_provider_out(p, services.get(p.id, [])) for p in providers]


def _provider_out(provider: Provider, service_ids: list[uuid.UUID]) -> dict[str, Any]:
    return {
        "id": provider.id,
        "name": provider.name,
        "user_id": provider.user_id,
        "active": provider.active,
        "sort_order": provider.sort_order,
        "service_ids": sorted(service_ids),
    }


async def get_provider(
    session: AsyncSession, provider_id: uuid.UUID, *, organisation_id: str
) -> Provider:
    provider = await session.scalar(
        select(Provider).where(
            Provider.id == provider_id, Provider.organisation_id == organisation_id
        )
    )
    if provider is None:
        raise BookingNotFoundError("Provider")
    return provider


async def _set_provider_services(
    session: AsyncSession,
    provider: Provider,
    service_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    wanted = set(service_ids)
    if wanted:
        found = set(
            await session.scalars(
                select(Service.id).where(
                    Service.id.in_(wanted),
                    Service.organisation_id == provider.organisation_id,
                )
            )
        )
        if found != wanted:
            raise BookingNotFoundError("Service")
    await session.execute(
        delete(ProviderService).where(ProviderService.provider_id == provider.id)
    )
    session.add_all(
        ProviderService(provider_id=provider.id, service_id=sid) for sid in wanted
    )
    await session.flush()
    return sorted(wanted)


async def create_provider(
    session: AsyncSession, *, organisation_id: str, payload: BookingProviderCreate
) -> dict[str, Any]:
    provider = Provider(
        organisation_id=organisation_id,
        **payload.model_dump(exclude={"service_ids"}),
    )
    session.add(provider)
    await session.flush()
    service_ids = await _set_provider_services(session, provider, payload.service_ids)
    return _provider_out(provider, service_ids)


async def update_provider(
    session: AsyncSession, provider: Provider, payload: BookingProviderUpdate
) -> dict[str, Any]:
    for key, value in payload.model_dump(
        exclude_unset=True, exclude={"service_ids"}
    ).items():
        setattr(provider, key, value)
    await session.flush()
    if payload.service_ids is not None:
        service_ids = await _set_provider_services(
            session, provider, payload.service_ids
        )
    else:
        service_ids = (await _service_ids_by_provider(session, [provider.id])).get(
            provider.id, []
        )
    return _provider_out(provider, service_ids)


async def get_working_hours(
    session: AsyncSession, provider: Provider
) -> list[WorkingHours]:
    return list(
        await session.scalars(
            select(WorkingHours)
            .where(WorkingHours.provider_id == provider.id)
            .order_by(WorkingHours.weekday, WorkingHours.start_time)
        )
    )


async def replace_working_hours(
    session: AsyncSession, provider: Provider, payload: BookingWorkingHoursUpdate
) -> list[WorkingHours]:
    await session.execute(
        delete(WorkingHours).where(WorkingHours.provider_id == provider.id)
    )
    session.add_all(
        WorkingHours(provider_id=provider.id, **period.model_dump())
        for period in payload.periods
    )
    await session.flush()
    return await get_working_hours(session, provider)


async def list_exceptions(
    session: AsyncSession,
    provider: Provider,
    *,
    starts_from: datetime | None = None,
    ends_before: datetime | None = None,
) -> list[AvailabilityException]:
    query = select(AvailabilityException).where(
        AvailabilityException.provider_id == provider.id
    )
    if starts_from is not None:
        query = query.where(AvailabilityException.ends_at > as_naive_utc(starts_from))
    if ends_before is not None:
        query = query.where(AvailabilityException.starts_at < as_naive_utc(ends_before))
    return list(await session.scalars(query.order_by(AvailabilityException.starts_at)))


async def create_exception(
    session: AsyncSession, provider: Provider, payload: BookingExceptionCreate
) -> AvailabilityException:
    row = AvailabilityException(
        provider_id=provider.id,
        kind=payload.kind.value,
        starts_at=as_naive_utc(payload.starts_at),
        ends_at=as_naive_utc(payload.ends_at),
        reason=payload.reason,
    )
    session.add(row)
    await session.flush()
    return row


async def delete_exception(
    session: AsyncSession, exception_id: uuid.UUID, *, organisation_id: str
) -> None:
    row = await session.scalar(
        select(AvailabilityException)
        .join(Provider, Provider.id == AvailabilityException.provider_id)
        .where(
            AvailabilityException.id == exception_id,
            Provider.organisation_id == organisation_id,
        )
    )
    if row is None:
        raise BookingNotFoundError("Time off or extra hours")
    await session.delete(row)
    await session.flush()


# --- business closures (BK-20) ----------------------------------------------------------


def _first_name(name: str | None) -> str | None:
    words = (name or "").split()
    return words[0] if words else None


async def _bookings_inside(
    session: AsyncSession,
    organisation_id: str,
    *,
    window_start: datetime,
    window_end: datetime,
) -> list[dict[str, Any]]:
    """Active bookings overlapping ``[window_start, window_end)``: id, start and
    the customer's first name only. Filtered and ordered in SQL."""
    rows = await session.execute(
        select(
            Booking.id,
            Booking.starts_at,
            func.coalesce(Booking.booked_name, Contact.name),
        )
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Booking.organisation_id == organisation_id,
            Booking.status.in_([s.value for s in ACTIVE_STATUSES]),
            Booking.starts_at < window_end,
            Booking.ends_at > window_start,
        )
        .order_by(Booking.starts_at, Booking.id)
    )
    return [
        {
            "id": booking_id,
            "starts_at": booking_start,
            "customer_first_name": _first_name(name),
        }
        for booking_id, booking_start, name in rows.all()
    ]


async def create_closure(
    session: AsyncSession, organisation_id: str, payload: BookingClosureCreate
) -> dict[str, Any]:
    """Close the business on whole local days. Existing bookings are reported,
    never cancelled."""
    profile = await get_profile(session, organisation_id)
    row = BusinessClosure(
        organisation_id=organisation_id,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        reason=payload.reason,
    )
    session.add(row)
    await session.flush()
    window_start, window_end = availability.closure_interval(
        row.starts_on, row.ends_on, zone(profile.timezone)
    )
    affected = await _bookings_inside(
        session, organisation_id, window_start=window_start, window_end=window_end
    )
    logger.info(
        "Business closure created",
        extra={"organisation_id": organisation_id, "affected_count": len(affected)},
    )
    return {
        "id": row.id,
        "starts_on": row.starts_on,
        "ends_on": row.ends_on,
        "reason": row.reason,
        "created_at": row.created_at,
        "affected_bookings": affected,
    }


async def list_closures(
    session: AsyncSession,
    organisation_id: str,
    *,
    skip: int,
    limit: int,
    ends_on_from: date | None = None,
) -> list[BusinessClosure]:
    query = select(BusinessClosure).where(
        BusinessClosure.organisation_id == organisation_id
    )
    if ends_on_from is not None:
        query = query.where(BusinessClosure.ends_on >= ends_on_from)
    query = (
        query.order_by(BusinessClosure.starts_on, BusinessClosure.id)
        .offset(skip)
        .limit(limit)
    )
    return list(await session.scalars(query))


async def delete_closure(
    session: AsyncSession, closure_id: uuid.UUID, *, organisation_id: str
) -> None:
    """Remove a closure. Deleting one already gone is a no-op (idempotent). Another
    business's closure answers 404 and is never touched."""
    row = await session.scalar(
        select(BusinessClosure).where(
            BusinessClosure.id == closure_id,
            BusinessClosure.organisation_id == organisation_id,
        )
    )
    if row is None:
        elsewhere = await session.scalar(
            select(BusinessClosure.id).where(BusinessClosure.id == closure_id)
        )
        if elsewhere is not None:
            raise BookingNotFoundError("Closure")
        return
    await session.delete(row)
    await session.flush()


# --- studio agenda -------------------------------------------------------------------


async def list_bookings(
    session: AsyncSession,
    organisation_id: str,
    *,
    starts_from: datetime,
    ends_before: datetime,
) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(
            Booking,
            Service.name,
            func.coalesce(Booking.booked_name, Contact.name, ""),
        )
        .join(Service, Service.id == Booking.service_id)
        .join(Customer, Customer.id == Booking.customer_id)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Booking.organisation_id == organisation_id,
            Booking.starts_at < as_naive_utc(ends_before),
            Booking.ends_at > as_naive_utc(starts_from),
        )
        .order_by(Booking.starts_at)
    )
    return [
        {
            "id": booking.id,
            "provider_id": booking.provider_id,
            "service_id": booking.service_id,
            "service_name": service_name,
            "customer_id": booking.customer_id,
            "customer_name": customer_name,
            "starts_at": booking.starts_at,
            "ends_at": booking.ends_at,
            "status": booking.status,
            "source": booking.source,
            "price_minor": booking.price_minor,
            "deposit_minor": booking.deposit_minor,
            "currency": booking.currency,
            "pay_after_acceptance": booking.pay_after_acceptance,
            "accepted_at": booking.accepted_at,
        }
        for booking, service_name, customer_name in rows
    ]


# --- public storefront and availability ---------------------------------------------


async def get_public_profile(session: AsyncSession, slug: str) -> BookingProfile:
    """An enabled profile by slug. Disabled and unknown answer the same 404."""
    profile = await session.scalar(
        select(BookingProfile).where(
            BookingProfile.public_slug == slug, BookingProfile.enabled.is_(True)
        )
    )
    if profile is None:
        raise BookingNotFoundError("Booking page")
    await require_bookings_entitlement(session, profile)
    return profile


def require_taking_bookings(profile: BookingProfile) -> None:
    """409 while the business is paused (ADR-0066 item 6). Public availability, email
    code and create call it; manage routes by token do not."""
    if profile.paused_at is not None:
        raise BusinessPausedError()


async def require_bookings_entitlement(
    session: AsyncSession, profile: BookingProfile, *, what: str = "Booking page"
) -> None:
    """Public routes answer 404, not 403, for an organisation without the
    ``bookings`` entitlement, exactly like an unknown page."""
    try:
        await organisation_service.require_app_enabled(
            session, organisation_id=profile.organisation_id, app_key="bookings"
        )
    except OrganisationAppNotEntitledError as error:
        raise BookingNotFoundError(what) from error


def late_fee_of(profile: BookingProfile) -> BookingLateFee | None:
    """The profile's late-arrival rule; grace is 0 when only the fee is set."""
    if not profile.late_fee_minor:
        return None
    return BookingLateFee(
        amount_minor=profile.late_fee_minor, grace_min=profile.late_grace_min or 0
    )


def business_contact(profile: BookingProfile) -> dict[str, str | None]:
    """The profile's contact options as the public pages show them."""
    return {
        "phone": profile.contact_phone,
        "whatsapp": profile.contact_whatsapp,
        "instagram": profile.contact_instagram,
        "email": profile.contact_email,
    }


async def _upload_is_complete(
    session: AsyncSession,
    profile: BookingProfile,
    file_id: uuid.UUID | None,
    purpose: str,
) -> bool:
    """The same rule as ``uploads.file_is_usable``, read on the request session: a
    complete upload of ``purpose`` for this business."""
    found = await session.scalar(
        select(OrgUpload.id).where(
            OrgUpload.id == file_id,
            OrgUpload.organisation_id == profile.organisation_id,
            OrgUpload.purpose == purpose,
            OrgUpload.status == UploadStatus.COMPLETE.value,
        )
    )
    return found is not None


async def _logo_is_complete(session: AsyncSession, profile: BookingProfile) -> bool:
    return await _upload_is_complete(
        session, profile, profile.logo_file_id, LOGO_PURPOSE
    )


async def _cover_is_complete(session: AsyncSession, profile: BookingProfile) -> bool:
    return await _upload_is_complete(
        session, profile, profile.cover_file_id, COVER_PURPOSE
    )


async def _public_image_url(
    session: AsyncSession,
    profile: BookingProfile,
    file_id: uuid.UUID | None,
    is_complete: Callable[[AsyncSession, BookingProfile], Awaitable[bool]],
) -> str | None:
    """A public image's address, shown only while the file is still a complete upload
    of this business and the API address is https. The mail builds its image from the
    same address (``public_file_url``).

    Fails closed: any error reading the file answers None, so the public page still
    loads. A savepoint keeps a database error from aborting the storefront's own
    transaction."""
    if file_id is None:
        return None
    try:
        async with session.begin_nested():
            complete = await is_complete(session, profile)
    except Exception as error:  # fail closed: a public page must still load
        logger.warning(
            "Storefront image check failed for %s; showing no image",
            profile.public_slug,
            extra={"error_type": type(error).__name__},
        )
        return None
    if not complete:
        return None
    url = public_file_url(file_id)
    return url if url is not None and url.startswith("https://") else None


async def _public_logo_url(
    session: AsyncSession, profile: BookingProfile
) -> str | None:
    return await _public_image_url(
        session, profile, profile.logo_file_id, _logo_is_complete
    )


async def _public_cover_url(
    session: AsyncSession, profile: BookingProfile
) -> str | None:
    return await _public_image_url(
        session, profile, profile.cover_file_id, _cover_is_complete
    )


async def storefront(session: AsyncSession, profile: BookingProfile) -> dict[str, Any]:
    # Paused (ADR-0066): the page still answers with how to reach the business and
    # nothing to book.
    paused = profile.paused_at is not None
    all_services = (
        []
        if paused
        else await list_services(session, profile.organisation_id, active_only=True)
    )
    # Add-ons are never bookable alone: they leave the main list, and reach the
    # page only while the business has switched them on.
    services = [s for s in all_services if not s.is_add_on]
    providers = (
        []
        if paused
        else await list_providers(session, profile.organisation_id, active_only=True)
    )
    active_service_ids = {s.id for s in services}
    public_providers = [
        {
            "id": p["id"],
            "name": p["name"],
            "service_ids": [s for s in p["service_ids"] if s in active_service_ids],
        }
        for p in providers
    ]
    due = await deposit_payments.due_by_service(session, profile, services)
    return {
        "accepting_bookings": not paused,
        "slug": profile.public_slug,
        "display_name": profile.display_name,
        "timezone": profile.timezone,
        "currency": profile.currency,
        "cancel_cutoff_hours": profile.cancel_cutoff_hours,
        "deposit_non_refundable": profile.deposit_non_refundable,
        "booking_policy": profile.booking_policy,
        "deposit_collection": profile.deposit_collection,
        # Only while the business takes deposits itself: old bank details must not
        # stay public after it switches back to online collection.
        "deposit_instructions": (
            profile.deposit_instructions
            if profile.deposit_collection == BookingDepositCollection.BUSINESS.value
            else None
        ),
        "late_fee": late_fee_of(profile),
        "contact": business_contact(profile),
        "brand_color": profile.brand_color,
        "logo_url": await _public_logo_url(session, profile),
        "cover_url": await _public_cover_url(session, profile),
        "business_type": profile.business_type,
        "services": [
            {
                **BookingPublicService.model_validate(
                    svc, from_attributes=True
                ).model_dump(),
                "due_at_booking_minor": due[svc.id],
                "pay_after_acceptance": deposit_payments.needs_acceptance(profile, svc),
                "deposit_to_business_minor": deposit_payments.deposit_to_business(
                    profile, svc
                ),
            }
            for svc in services
        ],
        "providers": [p for p in public_providers if p["service_ids"]],
        "add_ons": _public_add_ons(profile, all_services, services),
    }


def _public_add_ons(
    profile: BookingProfile, all_services: list[Service], mains: list[Service]
) -> list[dict[str, Any]]:
    """The active add-ons offered on the page, each with the main services it
    can follow. Empty while the business has the switch off."""
    if not profile.add_ons_enabled:
        return []
    offered = []
    for add_on_service in all_services:
        if not (add_on_service.is_add_on or add_on_service.also_add_on):
            continue
        service_ids = [
            main.id
            for main in mains
            if main.id != add_on_service.id
            and add_ons.offered_with(add_on_service.add_on_categories, main.category)
        ]
        if not service_ids:
            continue
        offered.append(
            {
                "id": add_on_service.id,
                "name": add_on_service.name,
                "description": add_on_service.description,
                "duration_min": add_on_service.duration_min,
                "price_minor": add_on_service.price_minor,
                "service_ids": service_ids,
            }
        )
    return offered


# --- public home-page listing ----------------------------------------------------------

#: Businesses on one page of the home page listing.
PUBLIC_LISTING_PAGE_SIZE = 24
#: Services shown on each home page card, in the business's own order.
PUBLIC_LISTING_FEATURED_SERVICES = 3
#: Categories offered as filter chips; more stay reachable through search.
PUBLIC_LISTING_CATEGORY_LIMIT = 50


def _contains_pattern(text: str) -> str:
    """An ILIKE pattern for ``text`` anywhere in a value, with ``%``, ``_`` and
    ``\\`` matched literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def listing_conditions() -> dict[str, ColumnElement[bool]]:
    """What a business needs to appear on the home page, each condition under the
    name staff see when it is not met (``BookingListingNotShownReason``): it opted
    in, Barrels approved the listing (ADR-0066), it is enabled and not paused, holds
    the bookings entitlement, sits in an active organisation and has at least one
    active service. Evaluated in SQL. Each subquery correlates to the profile
    only, so it also works as a selected column beside a joined organisation."""
    has_service = (
        select(Service.id)
        .where(
            Service.organisation_id == BookingProfile.organisation_id,
            Service.active.is_(True),
        )
        .correlate(BookingProfile)
        .exists()
    )
    entitled = (
        select(OrganisationApp.app_key)
        .where(
            OrganisationApp.organisation_id == BookingProfile.organisation_id,
            OrganisationApp.app_key == "bookings",
            OrganisationApp.enabled.is_(True),
        )
        .correlate(BookingProfile)
        .exists()
    )
    active_organisation = (
        select(PlatformOrganisation.id)
        .where(
            PlatformOrganisation.id == BookingProfile.organisation_id,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
        )
        .correlate(BookingProfile)
        .exists()
    )
    return {
        "not_listed": BookingProfile.listed.is_(True),
        "not_approved": BookingProfile.listing_approved_at.is_not(None),
        "booking_closed": BookingProfile.enabled.is_(True),
        "paused": BookingProfile.paused_at.is_(None),
        "no_active_service": has_service,
        "not_entitled": entitled,
        "organisation_inactive": active_organisation,
    }


def _open_for_listing() -> list[ColumnElement[bool]]:
    """Filters for a business that may appear on the home page: every one of
    ``listing_conditions``."""
    return list(listing_conditions().values())


def _https_or_none(file_id: uuid.UUID | None) -> str | None:
    url = public_file_url(file_id) if file_id is not None else None
    return url if url is not None and url.startswith("https://") else None


async def _featured_services(
    session: AsyncSession, profiles: list[BookingProfile]
) -> dict[str, list[dict[str, Any]]]:
    """The first few bookable services of each business on the page, in one query:
    active, not add-ons, in the order the booking page lists them."""
    if not profiles:
        return {}
    rank = (
        func.row_number()
        .over(
            partition_by=Service.organisation_id,
            order_by=(Service.sort_order, Service.name, Service.id),
        )
        .label("rank")
    )
    ranked = (
        select(Service, rank)
        .where(
            Service.organisation_id.in_([p.organisation_id for p in profiles]),
            Service.active.is_(True),
            Service.is_add_on.is_(False),
        )
        .subquery()
    )
    featured = aliased(Service, ranked)
    rows = await session.execute(
        select(featured)
        .where(ranked.c.rank <= PUBLIC_LISTING_FEATURED_SERVICES)
        .order_by(featured.organisation_id, ranked.c.rank)
    )
    currency = {p.organisation_id: p.currency for p in profiles}
    result: dict[str, list[dict[str, Any]]] = {}
    for service in rows.scalars():
        result.setdefault(service.organisation_id, []).append(
            {
                "id": service.id,
                "name": service.name,
                "price_minor": service.price_minor,
                "currency": currency[service.organisation_id],
                "duration_min": service.duration_min,
            }
        )
    return result


def _listing_card(
    profile: BookingProfile,
    logo_id: uuid.UUID | None,
    cover_id: uuid.UUID | None,
    featured: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """A home page card. ``logo_id`` and ``cover_id`` are set only for a finished
    upload of that purpose for this business (joined in SQL); addresses must be https."""
    return {
        "slug": profile.public_slug,
        "name": profile.display_name,
        "category": profile.category,
        "short_description": profile.short_description,
        "city": profile.city,
        "brand_color": profile.brand_color,
        "logo_url": _https_or_none(logo_id),
        "cover_url": _https_or_none(cover_id),
        "business_type": profile.business_type,
        "featured_services": featured or [],
    }


async def list_public_businesses(
    session: AsyncSession,
    *,
    q: str | None,
    category: str | None,
    page: int,
    business_type: BookingBusinessType | None = None,
) -> dict[str, Any]:
    """One page of the businesses that opted in to the home page, the search
    (name, category, description or city), the category filter and the business type
    filter, plus the categories and the business types on offer. Everything is
    filtered, joined and paged in SQL; the page holds one row more than it shows, to
    learn whether more follow."""
    conditions: list[ColumnElement[bool]] = _open_for_listing()
    needle = (q or "").strip()
    if needle:
        pattern = _contains_pattern(needle)
        conditions.append(
            or_(
                BookingProfile.display_name.ilike(pattern, escape="\\"),
                BookingProfile.category.ilike(pattern, escape="\\"),
                BookingProfile.short_description.ilike(pattern, escape="\\"),
                BookingProfile.city.ilike(pattern, escape="\\"),
            )
        )
    chosen = (category or "").strip()
    if chosen:
        conditions.append(func.lower(BookingProfile.category) == chosen.lower())
    if business_type is not None:
        conditions.append(BookingProfile.business_type == business_type.value)

    logo = aliased(OrgUpload)
    cover = aliased(OrgUpload)
    rows = await session.execute(
        select(BookingProfile, logo.id, cover.id)
        .outerjoin(
            logo,
            (logo.id == BookingProfile.logo_file_id)
            & (logo.organisation_id == BookingProfile.organisation_id)
            & (logo.purpose == LOGO_PURPOSE)
            & (logo.status == UploadStatus.COMPLETE.value),
        )
        .outerjoin(
            cover,
            (cover.id == BookingProfile.cover_file_id)
            & (cover.organisation_id == BookingProfile.organisation_id)
            & (cover.purpose == COVER_PURPOSE)
            & (cover.status == UploadStatus.COMPLETE.value),
        )
        .where(*conditions)
        .order_by(func.lower(BookingProfile.display_name), BookingProfile.id)
        .offset((page - 1) * PUBLIC_LISTING_PAGE_SIZE)
        .limit(PUBLIC_LISTING_PAGE_SIZE + 1)
    )
    found = rows.all()
    categories = await session.scalars(
        select(func.min(BookingProfile.category))
        .where(
            *_open_for_listing(),
            BookingProfile.category.is_not(None),
        )
        .group_by(func.lower(BookingProfile.category))
        .order_by(func.min(BookingProfile.category))
        .limit(PUBLIC_LISTING_CATEGORY_LIMIT)
    )
    # Every type a visible listed business has, in the fixed list's order. The set is
    # at most eleven values, so ordering it here costs nothing.
    present = set(
        await session.scalars(
            select(BookingProfile.business_type)
            .where(
                *_open_for_listing(),
                BookingProfile.business_type.is_not(None),
            )
            .distinct()
        )
    )
    shown = found[:PUBLIC_LISTING_PAGE_SIZE]
    featured = await _featured_services(session, [row[0] for row in shown])
    return {
        "items": [
            _listing_card(
                profile, logo_id, cover_id, featured.get(profile.organisation_id)
            )
            for profile, logo_id, cover_id in shown
        ],
        "page": page,
        "has_more": len(found) > PUBLIC_LISTING_PAGE_SIZE,
        "categories": list(categories),
        "types_available": [
            member for member in BookingBusinessType if member.value in present
        ],
    }


async def available_slots(
    session: AsyncSession,
    profile: BookingProfile,
    *,
    service_id: uuid.UUID,
    provider_id: uuid.UUID | None,
    first_day: date,
    last_day: date,
    now: datetime | None = None,
    exclude_booking_id: uuid.UUID | None = None,
    add_on_ids: Sequence[uuid.UUID] = (),
    extra_minutes: int = 0,
) -> list[availability.Slot]:
    """Open slots. ``exclude_booking_id`` ignores one booking's own blocked range
    (used when that booking is being rescheduled). The slot length is the main
    service's plus the chosen ``add_on_ids`` (checked here) plus ``extra_minutes``
    (a booking's stored add-on lines, used when it is moved)."""
    if last_day < first_day:
        raise BookingValidationError("last_day must not be before first_day")
    if (last_day - first_day).days >= MAX_AVAILABILITY_DAYS:
        raise BookingValidationError(
            f"Ask for at most {MAX_AVAILABILITY_DAYS} days at a time"
        )
    service = await get_service(
        session, service_id, organisation_id=profile.organisation_id
    )
    if not service.active or service.is_add_on:
        raise BookingNotFoundError("Service")
    chosen = await resolve_add_ons(session, profile, service, add_on_ids)
    length_min = (
        service.duration_min
        + extra_minutes
        + sum(add_on_service.duration_min for add_on_service in chosen)
    )

    query = (
        select(Provider)
        .join(ProviderService, ProviderService.provider_id == Provider.id)
        .where(
            Provider.organisation_id == profile.organisation_id,
            Provider.active.is_(True),
            ProviderService.service_id == service.id,
        )
    )
    if provider_id is not None:
        query = query.where(Provider.id == provider_id)
    providers = list(await session.scalars(query))
    if not providers:
        return []

    tz = zone(profile.timezone)
    window_start = local_to_utc(first_day, time(0), tz) - timedelta(days=1)
    window_end = local_to_utc(last_day + timedelta(days=1), time(0), tz) + timedelta(
        days=1
    )
    ids = [p.id for p in providers]

    periods: dict[uuid.UUID, list[availability.WorkingPeriod]] = defaultdict(list)
    for hours in await session.scalars(
        select(WorkingHours).where(WorkingHours.provider_id.in_(ids))
    ):
        periods[hours.provider_id].append(
            availability.WorkingPeriod(hours.weekday, hours.start_time, hours.end_time)
        )

    exceptions: dict[uuid.UUID, list[availability.ScheduleException]] = defaultdict(
        list
    )
    for change in await session.scalars(
        select(AvailabilityException).where(
            AvailabilityException.provider_id.in_(ids),
            AvailabilityException.starts_at < window_end,
            AvailabilityException.ends_at > window_start,
        )
    ):
        exceptions[change.provider_id].append(
            availability.ScheduleException(
                change.starts_at, change.ends_at, change.kind
            )
        )
    # A business closure (BK-20) is time off for every provider at once.
    closures = await session.scalars(
        select(BusinessClosure).where(
            BusinessClosure.organisation_id == profile.organisation_id,
            BusinessClosure.starts_on <= last_day,
            BusinessClosure.ends_on >= first_day,
        )
    )
    closed = [
        availability.ScheduleException(
            *availability.closure_interval(closure.starts_on, closure.ends_on, tz),
            "time_off",
        )
        for closure in closures
    ]
    for provider in providers:
        exceptions[provider.id].extend(closed)

    busy: dict[uuid.UUID, list[availability.Interval]] = defaultdict(list)
    busy_query = select(
        Booking.provider_id, Booking.blocked_from, Booking.blocked_until
    ).where(
        Booking.provider_id.in_(ids),
        Booking.status.in_([s.value for s in ACTIVE_STATUSES]),
        Booking.blocked_from < window_end,
        Booking.blocked_until > window_start,
    )
    if exclude_booking_id is not None:
        busy_query = busy_query.where(Booking.id != exclude_booking_id)
    for blocked in await session.execute(busy_query):
        busy[blocked.provider_id].append((blocked.blocked_from, blocked.blocked_until))

    rules = availability.SlotRules(
        duration=timedelta(minutes=length_min),
        step=timedelta(minutes=profile.slot_step_min),
        buffer_before=timedelta(minutes=service.buffer_before_min),
        buffer_after=timedelta(minutes=service.buffer_after_min),
        lead_time=timedelta(minutes=profile.lead_time_min),
        horizon=timedelta(days=profile.horizon_days),
    )
    calendars = [
        availability.ProviderCalendar(
            provider_id=str(p.id),
            periods=periods.get(p.id, []),
            exceptions=exceptions.get(p.id, []),
            busy=busy.get(p.id, []),
        )
        for p in providers
    ]
    return availability.open_slots(
        calendars,
        rules,
        first_day=first_day,
        last_day=last_day,
        tz=tz,
        now=now or utc_now(),
    )


_DEADLOCK_SQLSTATE = "40P01"


def is_overlap_violation(error: DBAPIError) -> bool:
    """True when the booking exclusion constraint refused an overlapping booking.

    Two inserts racing for the same provider and range can also be resolved by
    Postgres as a deadlock (each waits on the other's index entry); the victim
    lost the race just the same, and the savepoint it ran in is still usable.
    """
    if "booking_no_overlap" in str(error.orig):
        return True
    code = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
    return code == _DEADLOCK_SQLSTATE or "deadlock detected" in str(error.orig)


def _my_bookings_order(upcoming: bool | None) -> tuple[Any, ...]:
    if upcoming is True:
        return (Booking.starts_at.asc(), Booking.id.asc())
    return (Booking.starts_at.desc(), Booking.id.desc())


async def list_my_bookings(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    upcoming: bool | None,
    pagination: PaginationParams,
    cancelled: bool | None = None,
    now: datetime | None = None,
) -> tuple[list[tuple[Booking, str, str, str]], int]:
    """The account's bookings across organisations, one SQL page.

    Soonest first when ``upcoming`` is True (starts_at, id ascending); newest first
    otherwise (past, or all when omitted).

    A booking is the account's when its customer's organisation contact is linked
    to ``user_id`` (ADR-0058). Returns ``(booking, service name, business name,
    business slug)`` rows and the total before paging. ``upcoming`` True keeps
    bookings starting at or after now, False keeps the earlier ones, None keeps all.
    ``cancelled`` True keeps only cancelled bookings, False leaves them out, None
    keeps every status. The filters are independent, so "Upcoming" is
    ``upcoming=True, cancelled=False``.
    """
    moment = now or utc_now()
    linked_customers = (
        select(Customer.id)
        .join(
            Contact,
            (Contact.id == Customer.contact_id)
            & (Contact.organisation_id == Customer.organisation_id),
        )
        .where(Contact.user_id == user_id, Contact.erased_at.is_(None))
    )
    filters: list[ColumnElement[bool]] = [Booking.customer_id.in_(linked_customers)]
    if upcoming is True:
        filters.append(Booking.starts_at >= moment)
    elif upcoming is False:
        filters.append(Booking.starts_at < moment)
    if cancelled is True:
        filters.append(Booking.status == BookingStatus.CANCELLED.value)
    elif cancelled is False:
        filters.append(Booking.status != BookingStatus.CANCELLED.value)
    total = await session.scalar(
        select(func.count()).select_from(Booking).where(*filters)
    )
    result = await session.execute(
        select(
            Booking,
            Service.name,
            BookingProfile.display_name,
            BookingProfile.public_slug,
        )
        .join(Service, Service.id == Booking.service_id)
        .join(BookingProfile, BookingProfile.organisation_id == Booking.organisation_id)
        .where(*filters)
        .order_by(*_my_bookings_order(upcoming))
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    rows = [(row[0], row[1], row[2], row[3]) for row in result.all()]
    return rows, total or 0


MY_CHOICES_LIMIT = 3
#: Statuses that mean the person really booked it. A declined request, a
#: cancellation and an expired unpaid hold are all ``cancelled``; a no-show and
#: a deposit still waiting are left out too.
SUGGESTED_STATUSES = (
    BookingStatus.PENDING.value,
    BookingStatus.CONFIRMED.value,
    BookingStatus.COMPLETED.value,
)


async def my_choices(
    session: AsyncSession, user: User, slug: str
) -> tuple[str | None, list[tuple[uuid.UUID, uuid.UUID, datetime]]]:
    """The caller's own history with one business: ``(phone, recent)``.

    Only bookings whose customer's contact in that business is linked to the
    caller (ADR-0058), the same rule as My bookings; nobody else's rows are read.
    ``recent`` is ``(service_id, provider_id, starts_at)``: the latest booking
    per service (its start time), most recent first, at most ``MY_CHOICES_LIMIT``,
    picked in SQL. Only pending, confirmed and completed bookings count
    (``SUGGESTED_STATUSES``). ``phone`` is the number of the person's most
    recently booked contact in that business that has one (ties by id), else the
    account's own: the number typed into the profile (``contact_phone``) before
    the sign-in number (``phone_e164``), which only phone sign-in ever sets.
    An unknown or switched-off slug is the public 404.
    """
    profile = await get_public_profile(session, slug)
    linked = (
        select(Customer.id, Contact.phone)
        .join(Contact, Contact.id == Customer.contact_id)
        .where(
            Customer.organisation_id == profile.organisation_id,
            Contact.organisation_id == profile.organisation_id,
            Contact.user_id == user.id,
            Contact.erased_at.is_(None),
        )
        .order_by(Customer.last_booked_at.desc().nulls_last(), Customer.id)
    )
    customers = (await session.execute(linked)).all()
    account_phone = user.contact_phone or user.phone_e164
    phone = next((phone for _, phone in customers if phone), None) or account_phone
    if not customers:
        return phone, []
    # The latest booking of each service (DISTINCT ON), then the newest three.
    latest = (
        select(Booking.service_id, Booking.provider_id, Booking.starts_at)
        .where(
            Booking.organisation_id == profile.organisation_id,
            Booking.customer_id.in_([customer_id for customer_id, _ in customers]),
            Booking.status.in_(SUGGESTED_STATUSES),
        )
        .distinct(Booking.service_id)
        .order_by(Booking.service_id, Booking.starts_at.desc(), Booking.id.desc())
        .subquery()
    )
    rows = await session.execute(
        select(latest.c.service_id, latest.c.provider_id, latest.c.starts_at)
        .order_by(latest.c.starts_at.desc(), latest.c.service_id)
        .limit(MY_CHOICES_LIMIT)
    )
    return phone, [(row[0], row[1], row[2]) for row in rows.all()]


async def list_my_organisations(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[PlatformOrganisation, str, datetime | None]]:
    """Active organisations the user belongs to that hold the bookings entitlement,
    with the user's role and the business's ``paused_at``: ``(organisation, role,
    paused_at)`` rows, filtered in SQL."""
    rows = await session.execute(
        select(PlatformOrganisation, Membership.role, BookingProfile.paused_at)
        .join(Membership, Membership.organisation_id == PlatformOrganisation.id)
        .outerjoin(
            BookingProfile, BookingProfile.organisation_id == PlatformOrganisation.id
        )
        .join(
            OrganisationApp,
            (OrganisationApp.organisation_id == PlatformOrganisation.id)
            & (OrganisationApp.app_key == "bookings")
            & OrganisationApp.enabled.is_(True),
        )
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
        )
        .order_by(PlatformOrganisation.name, PlatformOrganisation.id)
    )
    return [(o, role, paused_at) for o, role, paused_at in rows.all()]
