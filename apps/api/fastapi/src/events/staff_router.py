"""Barrels staff pickers for Events (zone ``admin``, ADR-0025 and ADR-0050).

Staff find an organiser's event or an organiser, then act on it through the
org-zone routes with `X-Barrels-Organisation`. Gated by any `events.ops.*` key held
through a role (never implied for a superuser); two-step verification is required
unless the only key held is `events.ops.door`. Responses carry no emails.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query

from src.models import UtcDateTime
from src.openapi_responses import AUTHENTICATED
from src.pagination import PaginatedResponse, PaginationDep

from . import schemas
from .dependencies import EventsSession, EventsStaff
from .service import staff_pickers

router = APIRouter(prefix="/events/admin", tags=["events"])


@router.get(
    "/events",
    response_model=PaginatedResponse[schemas.StaffEventRow],
    summary="Find an organiser's event (staff)",
    description=(
        "Events of every organiser linked to an organisation, latest start first. "
        "Filter by start window (`from` inclusive, `to` exclusive), `q` (title or "
        "organiser name) and `organiser_id`."
    ),
    operation_id="eventsAdminListEvents",
    responses=AUTHENTICATED,
)
async def list_events(
    *,
    session: EventsSession,
    staff: EventsStaff,
    pagination: PaginationDep,
    starts_from: Annotated[UtcDateTime | None, Query(alias="from")] = None,
    starts_to: Annotated[UtcDateTime | None, Query(alias="to")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    organiser_id: uuid.UUID | None = None,
) -> Any:
    return await staff_pickers.list_events(
        session,
        starts_from=starts_from,
        starts_to=starts_to,
        q=q,
        organiser_id=organiser_id,
        include_drafts=staff.sees_drafts,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/organisers",
    response_model=PaginatedResponse[schemas.StaffOrganiserRow],
    summary="Find an organiser (staff)",
    description="Organisers linked to an organisation, by name, optionally filtered by `q`.",
    operation_id="eventsAdminListOrganisers",
    responses=AUTHENTICATED,
)
async def list_organisers(
    *,
    session: EventsSession,
    staff: EventsStaff,
    pagination: PaginationDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Any:
    return await staff_pickers.list_organisers(
        session,
        q=q,
        include_drafts=staff.sees_drafts,
        page=pagination.page,
        size=pagination.size,
    )
