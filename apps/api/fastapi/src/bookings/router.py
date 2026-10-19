"""Bookings routes (ADR-0024).

Studio routes act for the organisation in ``X-Barrels-Organisation``: members
read, admins and owners change. Public routes are keyed by a profile's
``public_slug`` and need no sign-in. Routers commit; service functions flush.
"""

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Query, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgAdmin, OrgMember
from src.rate_limit import limiter

from . import service
from .schemas import (
    BookingAvailability,
    BookingExceptionCreate,
    BookingExceptionPublic,
    BookingProfilePublic,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingProviderPublic,
    BookingProviderUpdate,
    BookingServiceCreate,
    BookingServicePublic,
    BookingServiceUpdate,
    BookingSlot,
    BookingStorefront,
    BookingWorkingHoursUpdate,
    BookingWorkingPeriodPublic,
    StudioBookingPublic,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


# --- studio: profile -----------------------------------------------------------------


@router.get(
    "/studio/profile",
    response_model=BookingProfilePublic,
    summary="Get my booking profile",
    description="The organisation's booking page settings and rules.",
    operation_id="bookingsGetProfile",
    responses=READ_ERRORS,
)
async def get_profile(*, session: SessionDep, org: OrgMember) -> Any:
    return await service.get_profile(session, org.organisation_id)


@router.put(
    "/studio/profile",
    response_model=BookingProfilePublic,
    summary="Create or update my booking profile",
    description=(
        "Set the public booking address, timezone, currency and booking rules. "
        "Online booking stays off until `enabled` is true."
    ),
    operation_id="bookingsUpsertProfile",
    responses=WRITE_ERRORS,
)
async def upsert_profile(
    *, session: SessionDep, org: OrgAdmin, payload: BookingProfileUpdate
) -> Any:
    profile = await service.upsert_profile(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return profile


# --- studio: services ----------------------------------------------------------------


@router.get(
    "/studio/services",
    response_model=list[BookingServicePublic],
    summary="List my services",
    description="All services, active and inactive, in menu order.",
    operation_id="bookingsListServices",
    responses=READ_ERRORS,
)
async def list_services(*, session: SessionDep, org: OrgMember) -> Any:
    return await service.list_services(session, org.organisation_id)


@router.post(
    "/studio/services",
    response_model=BookingServicePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a service",
    description="A bookable service with its duration, buffers, price and deposit.",
    operation_id="bookingsCreateService",
    responses=WRITE_ERRORS,
)
async def create_service(
    *, session: SessionDep, org: OrgAdmin, payload: BookingServiceCreate
) -> Any:
    row = await service.create_service(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return row


@router.patch(
    "/studio/services/{service_id}",
    response_model=BookingServicePublic,
    summary="Update a service",
    description="Change a service, or set `active` to false to stop new bookings.",
    operation_id="bookingsUpdateService",
    responses=WRITE_ERRORS,
)
async def update_service(
    *,
    session: SessionDep,
    org: OrgAdmin,
    service_id: uuid.UUID,
    payload: BookingServiceUpdate,
) -> Any:
    row = await service.get_service(
        session, service_id, organisation_id=org.organisation_id
    )
    await service.update_service(session, row, payload)
    await session.commit()
    return row


# --- studio: providers, hours, time off ------------------------------------------------


@router.get(
    "/studio/providers",
    response_model=list[BookingProviderPublic],
    summary="List my providers",
    description="People (or chairs, bays, rooms) who perform services.",
    operation_id="bookingsListProviders",
    responses=READ_ERRORS,
)
async def list_providers(*, session: SessionDep, org: OrgMember) -> Any:
    return await service.list_providers(session, org.organisation_id)


@router.post(
    "/studio/providers",
    response_model=BookingProviderPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a provider",
    description="Add a provider and the services they perform.",
    operation_id="bookingsCreateProvider",
    responses=WRITE_ERRORS,
)
async def create_provider(
    *, session: SessionDep, org: OrgAdmin, payload: BookingProviderCreate
) -> Any:
    row = await service.create_provider(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return row


@router.patch(
    "/studio/providers/{provider_id}",
    response_model=BookingProviderPublic,
    summary="Update a provider",
    description="Rename, deactivate, or replace the services a provider performs.",
    operation_id="bookingsUpdateProvider",
    responses=WRITE_ERRORS,
)
async def update_provider(
    *,
    session: SessionDep,
    org: OrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingProviderUpdate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    row = await service.update_provider(session, provider, payload)
    await session.commit()
    return row


@router.get(
    "/studio/providers/{provider_id}/hours",
    response_model=list[BookingWorkingPeriodPublic],
    summary="Get a provider's weekly hours",
    description="Working periods per weekday (Monday = 0), in the profile's timezone.",
    operation_id="bookingsGetWorkingHours",
    responses=READ_ERRORS,
)
async def get_working_hours(
    *, session: SessionDep, org: OrgMember, provider_id: uuid.UUID
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    return await service.get_working_hours(session, provider)


@router.put(
    "/studio/providers/{provider_id}/hours",
    response_model=list[BookingWorkingPeriodPublic],
    summary="Replace a provider's weekly hours",
    description=(
        "Send the whole week. Several periods on one day make breaks between "
        "them; a day with no periods is a day off."
    ),
    operation_id="bookingsReplaceWorkingHours",
    responses=WRITE_ERRORS,
)
async def replace_working_hours(
    *,
    session: SessionDep,
    org: OrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingWorkingHoursUpdate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    rows = await service.replace_working_hours(session, provider, payload)
    await session.commit()
    return rows


@router.get(
    "/studio/providers/{provider_id}/exceptions",
    response_model=list[BookingExceptionPublic],
    summary="List time off and extra hours",
    description="Dated changes to a provider's weekly hours, optionally in a range.",
    operation_id="bookingsListExceptions",
    responses=READ_ERRORS,
)
async def list_exceptions(
    *,
    session: SessionDep,
    org: OrgMember,
    provider_id: uuid.UUID,
    starts_from: datetime | None = None,
    ends_before: datetime | None = None,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    return await service.list_exceptions(
        session, provider, starts_from=starts_from, ends_before=ends_before
    )


@router.post(
    "/studio/providers/{provider_id}/exceptions",
    response_model=BookingExceptionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add time off or extra hours",
    description="Block time (`time_off`) or open time outside the weekly plan (`extra_hours`).",
    operation_id="bookingsCreateException",
    responses=WRITE_ERRORS,
)
async def create_exception(
    *,
    session: SessionDep,
    org: OrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingExceptionCreate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    row = await service.create_exception(session, provider, payload)
    await session.commit()
    return row


@router.delete(
    "/studio/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove time off or extra hours",
    description="Delete one dated exception.",
    operation_id="bookingsDeleteException",
    responses=WRITE_ERRORS,
)
async def delete_exception(
    *, session: SessionDep, org: OrgAdmin, exception_id: uuid.UUID
) -> None:
    await service.delete_exception(
        session, exception_id, organisation_id=org.organisation_id
    )
    await session.commit()


@router.get(
    "/studio/bookings",
    response_model=list[StudioBookingPublic],
    summary="List bookings in a period",
    description="The agenda: bookings overlapping the range, earliest first.",
    operation_id="bookingsListStudioBookings",
    responses=READ_ERRORS,
)
async def list_bookings(
    *,
    session: SessionDep,
    org: OrgMember,
    starts_from: datetime,
    ends_before: datetime,
) -> Any:
    return await service.list_bookings(
        session,
        org.organisation_id,
        starts_from=starts_from,
        ends_before=ends_before,
    )


# --- public ----------------------------------------------------------------------------


@router.get(
    "/public/{slug}",
    response_model=BookingStorefront,
    summary="Get a business's booking page",
    description=(
        "Active services and providers for a public booking page. Unknown and "
        "disabled pages both answer 404."
    ),
    operation_id="bookingsGetStorefront",
    responses={**NOT_FOUND},
)
@limiter.limit("60/minute")
async def get_storefront(*, request: Request, session: SessionDep, slug: str) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    return await service.storefront(session, profile)


@router.get(
    "/public/{slug}/availability",
    response_model=BookingAvailability,
    summary="List open booking slots",
    description=(
        "Open start times for a service between two local dates (at most 14 "
        "days), optionally for one provider. Times are UTC; `timezone` is the "
        "business's local zone for display."
    ),
    operation_id="bookingsGetAvailability",
    responses={**BAD_REQUEST, **NOT_FOUND},
)
@limiter.limit("60/minute")
async def get_availability(
    *,
    request: Request,
    session: SessionDep,
    slug: str,
    service_id: uuid.UUID,
    first_day: date,
    last_day: date,
    provider_id: uuid.UUID | None = Query(default=None),
) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    slots = await service.available_slots(
        session,
        profile,
        service_id=service_id,
        provider_id=provider_id,
        first_day=first_day,
        last_day=last_day,
    )
    return BookingAvailability(
        timezone=profile.timezone,
        service_id=service_id,
        slots=[
            BookingSlot(
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
                provider_ids=[uuid.UUID(pid) for pid in slot.provider_ids],
            )
            for slot in slots
        ],
    )
