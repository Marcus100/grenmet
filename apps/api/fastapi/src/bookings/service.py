"""Bookings service: studio configuration and public availability.

Service functions flush; routers commit. Every query is filtered by
``organisation_id`` so one business never sees another's data.
"""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import service as organisation_service
from src.organisations.exceptions import OrganisationAppNotEntitledError
from src.utils.datetime import utc_now
from src.utils.timezones import local_to_utc, zone

from . import availability
from .exceptions import (
    BookingConflictError,
    BookingNotFoundError,
    BookingValidationError,
)
from .models import (
    ACTIVE_STATUSES,
    AvailabilityException,
    Booking,
    BookingProfile,
    Customer,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
)
from .schemas import (
    BookingExceptionCreate,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingProviderUpdate,
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
    values = payload.model_dump()
    if profile is None:
        profile = BookingProfile(organisation_id=organisation_id, **values)
        session.add(profile)
    else:
        for key, value in values.items():
            setattr(profile, key, value)
    await session.flush()
    return profile


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
    service = Service(organisation_id=organisation_id, **payload.model_dump())
    session.add(service)
    await session.flush()
    return service


async def update_service(
    session: AsyncSession, service: Service, payload: BookingServiceUpdate
) -> Service:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
    if service.deposit_minor > service.price_minor:
        raise BookingValidationError("The deposit cannot exceed the price")
    await session.flush()
    return service


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


# --- studio agenda -------------------------------------------------------------------


async def list_bookings(
    session: AsyncSession,
    organisation_id: str,
    *,
    starts_from: datetime,
    ends_before: datetime,
) -> list[dict[str, Any]]:
    rows = await session.execute(
        select(Booking, Service.name, Customer.name)
        .join(Service, Service.id == Booking.service_id)
        .join(Customer, Customer.id == Booking.customer_id)
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


async def storefront(session: AsyncSession, profile: BookingProfile) -> dict[str, Any]:
    services = await list_services(session, profile.organisation_id, active_only=True)
    providers = await list_providers(session, profile.organisation_id, active_only=True)
    active_service_ids = {s.id for s in services}
    public_providers = [
        {
            "id": p["id"],
            "name": p["name"],
            "service_ids": [s for s in p["service_ids"] if s in active_service_ids],
        }
        for p in providers
    ]
    return {
        "slug": profile.public_slug,
        "display_name": profile.display_name,
        "timezone": profile.timezone,
        "currency": profile.currency,
        "cancel_cutoff_hours": profile.cancel_cutoff_hours,
        "services": services,
        "providers": [p for p in public_providers if p["service_ids"]],
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
) -> list[availability.Slot]:
    """Open slots. ``exclude_booking_id`` ignores one booking's own blocked range
    (used when that booking is being rescheduled)."""
    if last_day < first_day:
        raise BookingValidationError("last_day must not be before first_day")
    if (last_day - first_day).days >= MAX_AVAILABILITY_DAYS:
        raise BookingValidationError(
            f"Ask for at most {MAX_AVAILABILITY_DAYS} days at a time"
        )
    service = await get_service(
        session, service_id, organisation_id=profile.organisation_id
    )
    if not service.active:
        raise BookingNotFoundError("Service")

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
        duration=timedelta(minutes=service.duration_min),
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


def is_overlap_violation(error: IntegrityError) -> bool:
    """True when the booking exclusion constraint refused an overlapping booking."""
    return "booking_no_overlap" in str(error.orig)
