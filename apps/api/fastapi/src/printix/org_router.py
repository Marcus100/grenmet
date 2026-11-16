"""Printix organiser routes: read-only (ADR-0060 organiser amendment, ADR-0025 zone ``org``).

Acts for the organisation named in ``X-Barrels-Organisation``. Every route needs an
organisation member signed in to the ``printix`` app, holding ``printix.events.manage``
or ``printix.gates.manage`` (either is enough to read), with an enrolled authenticator
and a session that passed it. A superuser has no bypass here. An event of another
organisation, or one with no organisation, is 404.

Writes (create, import, void, close, pairings) come in later slices.
"""

import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, NOT_FOUND
from src.pagination import PaginationDep

from . import service
from .dependencies import PrintixOrgEventReader
from .schemas import PrintixEventPage, PrintixEventSummary

router = APIRouter(prefix="/printix/org", tags=["printix-org"])

# Each route documents only the errors it can return. A missing header is 400, a
# non-member or unknown organisation 404, a missing key or authenticator 403.
_ORGANISER = {**AUTHENTICATED, **BAD_REQUEST}
_FIND = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}


@router.get(
    "/events",
    response_model=PrintixEventPage,
    summary="List my organisation's Printix events",
    description=(
        "The events of the organisation named in X-Barrels-Organisation, newest date "
        "first. Needs printix.events.manage or printix.gates.manage, the printix app "
        "and an authenticator session. Events with no organisation are not listed."
    ),
    responses=_ORGANISER,
)
async def list_org_events_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgEventReader,
    pagination: PaginationDep,
) -> Any:
    return await service.list_events(
        session,
        organisation_id=context.organisation_id,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/events/{event_id}/summary",
    response_model=PrintixEventSummary,
    summary="Printix event summary for my organisation",
    description=(
        "The same summary as the administrator route, for an event of the organisation "
        "named in X-Barrels-Organisation. Needs printix.events.manage or "
        "printix.gates.manage. Another organisation's event, or one with none, is 404."
    ),
    responses=_FIND,
)
async def org_event_summary_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgEventReader,
    event_id: uuid.UUID,
) -> Any:
    return await service.event_summary(
        session, event_id, organisation_id=context.organisation_id
    )
