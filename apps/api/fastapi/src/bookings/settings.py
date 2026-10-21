"""Settings screen support (A1.2): one-call snapshot and bulk reordering.

Kept apart from ``router.py`` and ``service.py`` so the CRUD routes stay small.
Reads accept a member or an API key with ``bookings.read``; reordering needs an
admin member or ``bookings.write``. Service functions flush, routes commit.
"""

import uuid
from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations import service as organisation_service
from src.organisations.api_key_auth import OrgAccess, org_or_key
from src.organisations.models import MembershipRole

from . import service
from .exceptions import BookingNotFoundError
from .models import BookingProfile, Provider, Service, WorkingHours
from .schemas import (
    BookingOrder,
    BookingProviderPublic,
    BookingServicePublic,
    BookingSettings,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])

_Read = Annotated[
    OrgAccess, Depends(org_or_key("bookings", "bookings.read", session_app="bookings"))
]
_Write = Annotated[
    OrgAccess,
    Depends(
        org_or_key(
            "bookings",
            "bookings.write",
            MembershipRole.ADMIN,
            session_app="bookings",
        )
    ),
]
_READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
_WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


async def load_settings(session: AsyncSession, organisation_id: str) -> dict[str, Any]:
    profile = await session.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == organisation_id)
    )
    services = await service.list_services(session, organisation_id)
    providers = await service.list_providers(session, organisation_id)
    hours: dict[uuid.UUID, list[WorkingHours]] = defaultdict(list)
    if providers:
        rows = await session.scalars(
            select(WorkingHours)
            .where(WorkingHours.provider_id.in_([p["id"] for p in providers]))
            .order_by(WorkingHours.weekday, WorkingHours.start_time)
        )
        for row in rows:
            hours[row.provider_id].append(row)
    return {
        "profile": profile,
        "services": services,
        "providers": [
            {**p, "working_hours": hours.get(p["id"], [])} for p in providers
        ],
        "deposits_available": await organisation_service.is_app_enabled(
            session, organisation_id=organisation_id, app_key="payments"
        ),
    }


async def apply_order(
    session: AsyncSession,
    model: type[Service] | type[Provider],
    organisation_id: str,
    ids: list[uuid.UUID],
    what: str,
) -> None:
    """Set ``sort_order`` to each id's position. Every id must belong to the
    organisation (404 otherwise); rows left out keep their value."""
    found = set(
        await session.scalars(
            select(model.id).where(
                model.id.in_(ids), model.organisation_id == organisation_id
            )
        )
    )
    if found != set(ids):
        raise BookingNotFoundError(what)
    for position, row_id in enumerate(ids):
        await session.execute(
            update(model).where(model.id == row_id).values(sort_order=position)
        )
    await session.flush()


@router.get(
    "/org/settings",
    response_model=BookingSettings,
    summary="Get my booking settings",
    description=(
        "The profile, services, providers (with the services they offer and "
        "weekly hours) and whether deposits can be collected, in one call."
    ),
    operation_id="bookingsGetSettings",
    responses=_READ_ERRORS,
)
async def get_settings(*, session: SessionDep, org: _Read) -> Any:
    return await load_settings(session, org.organisation_id)


@router.put(
    "/org/services/order",
    response_model=list[BookingServicePublic],
    summary="Reorder services",
    description="Set the menu order: each service's `sort_order` becomes its position.",
    operation_id="bookingsReorderServices",
    responses=_WRITE_ERRORS,
)
async def reorder_services(
    *, session: SessionDep, org: _Write, payload: BookingOrder
) -> Any:
    await apply_order(session, Service, org.organisation_id, payload.ids, "Service")
    await session.commit()
    return await service.list_services(session, org.organisation_id)


@router.put(
    "/org/providers/order",
    response_model=list[BookingProviderPublic],
    summary="Reorder providers",
    description="Set the provider order: each `sort_order` becomes its position.",
    operation_id="bookingsReorderProviders",
    responses=_WRITE_ERRORS,
)
async def reorder_providers(
    *, session: SessionDep, org: _Write, payload: BookingOrder
) -> Any:
    await apply_order(session, Provider, org.organisation_id, payload.ids, "Provider")
    await session.commit()
    return await service.list_providers(session, org.organisation_id)
