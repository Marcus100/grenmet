"""Printix organiser routes (ADR-0060 organiser amendment, ADR-0025 zone ``org``).

Acts for the organisation named in ``X-Barrels-Organisation``. Every route needs an
organisation member signed in to the ``printix`` app, with an enrolled authenticator and
a session that passed it, holding the one key the route names (decision 3):

- ``printix.events.manage``: create and close an event, import the ticket list, list
  tickets, void and restore a ticket;
- ``printix.gates.manage``: create, list and revoke gate pairings (the QR code);
- either key: list the events and read an event's summary.

Every event, ticket and pairing is looked up through its event's organisation in SQL,
so another organisation's record, or one with no organisation, is 404. No superuser
bypass. Writes record the organiser as the actor. Each route has a per-user limit.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Query, UploadFile, status

from src.dependencies import SessionDep
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep

from . import constants, service
from .constants import PrintixTicketStatus
from .dependencies import (
    PrintixOrgEventReader,
    PrintixOrgEventsReadAccess,
    PrintixOrgEventsWriteAccess,
    PrintixOrgGatesReadAccess,
    PrintixOrgGatesWriteAccess,
)
from .schemas import (
    PrintixEventPage,
    PrintixEventPublic,
    PrintixEventSummary,
    PrintixImportReport,
    PrintixOrgEventCreate,
    PrintixPairingCreate,
    PrintixPairingCreated,
    PrintixPairingPublic,
    PrintixTicketPage,
    PrintixTicketPublic,
)

router = APIRouter(prefix="/printix/org", tags=["printix-org"])

# Each route documents only the errors it can return. A missing header is 400, a
# non-member or another organisation's record 404, a missing key or authenticator 403,
# a conflict (closed event, admitted ticket) 409, and the per-user limit 429.
_ORGANISER = {**AUTHENTICATED, **BAD_REQUEST}
_FIND = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
_FIND_OR_CONFLICT = {**_FIND, **CONFLICT}
_IMPORT = {
    **_FIND_OR_CONFLICT,
    413: {"model": ApiError, "description": "The file is larger than the import limit"},
}


# --- Reads ------------------------------------------------------------------


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


@router.get(
    "/events/{event_id}/tickets",
    response_model=PrintixTicketPage,
    summary="List tickets of my organisation's event",
    description=(
        "Tickets of one event in printed-number order, with the same filters as the "
        "administrator route. Barcode values are never returned. Needs printix.events.manage."
    ),
    responses=_FIND,
)
async def list_org_tickets_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgEventsReadAccess,
    event_id: uuid.UUID,
    pagination: PaginationDep,
    ticket_status: Annotated[
        PrintixTicketStatus | None,
        Query(alias="status", description="Only valid or only void tickets."),
    ] = None,
    admitted: Annotated[
        bool | None,
        Query(description="True for admitted tickets, false for those not yet in."),
    ] = None,
) -> Any:
    return await service.list_tickets(
        session,
        event_id,
        status=ticket_status,
        admitted=admitted,
        page=pagination.page,
        size=pagination.size,
        organisation_id=context.organisation_id,
    )


@router.get(
    "/events/{event_id}/pairings",
    response_model=list[PrintixPairingPublic],
    summary="List gate QR codes of my organisation's event",
    description=(
        "Every gate pairing of one event, newest first. Secrets are never returned here; "
        "the secret is shown once, when the code is made. Needs printix.gates.manage."
    ),
    responses=_FIND,
)
async def list_org_pairings_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgGatesReadAccess,
    event_id: uuid.UUID,
) -> Any:
    return await service.list_pairings(
        session, event_id, organisation_id=context.organisation_id
    )


# --- Event writes (printix.events.manage) ------------------------------------


@router.post(
    "/events",
    response_model=PrintixEventPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Printix event for my organisation",
    description=(
        "Creates an open event owned by the organisation named in X-Barrels-Organisation "
        "(never taken from the body). The close time must be in the future and not before "
        "the event date. Needs printix.events.manage."
    ),
    responses=_ORGANISER,
)
async def create_org_event_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgEventsWriteAccess,
    body: PrintixOrgEventCreate,
) -> Any:
    event = await service.create_event(
        session,
        name=body.name,
        event_date=body.event_date,
        closes_at=service.to_naive_utc(body.closes_at),
        actor_id=context.user.id,
        organisation_id=context.organisation_id,
    )
    return service.event_public(event)


@router.post(
    "/events/{event_id}/close",
    response_model=PrintixEventPublic,
    summary="Close my organisation's Printix event",
    description=(
        "Closes the event: every scan answers event_closed and no ticket is voided, restored "
        "or imported. Revoking a pairing stays allowed. Needs printix.events.manage."
    ),
    responses=_FIND,
)
async def close_org_event_endpoint(
    *, session: SessionDep, context: PrintixOrgEventsWriteAccess, event_id: uuid.UUID
) -> Any:
    event = await service.close_event(
        session,
        event_id,
        actor_id=context.user.id,
        organisation_id=context.organisation_id,
    )
    return service.event_public(event)


@router.post(
    "/events/{event_id}/tickets/import",
    response_model=PrintixImportReport,
    summary="Import the printer's ticket list for my organisation's event",
    description=(
        "Uploads the printer's CSV (a number column and an optional barcode column). With "
        "dry_run (the default) it writes nothing and reports every problem with its line, "
        "plus the number of barcodes shorter than 12 characters and of barcodes equal to "
        "their printed number (offline scanning stays off while either is above zero). "
        "Without dry_run it writes every row, or nothing when any row has a problem. "
        "Needs printix.events.manage."
    ),
    responses=_IMPORT,
)
async def import_org_tickets_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgEventsWriteAccess,
    event_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="The printer's ticket list (CSV).")],
    dry_run: Annotated[
        bool, Query(description="Check only. Writes nothing when true.")
    ] = True,
    allow_number_as_barcode: Annotated[
        bool,
        Query(
            description=(
                "Accept rows with no barcode, whose barcode is then their three-digit "
                "printed number. Refused on a real import without this flag."
            )
        ),
    ] = False,
) -> Any:
    content = await file.read(constants.MAX_IMPORT_BYTES + 1)
    return await service.import_tickets(
        session,
        event_id,
        content,
        dry_run=dry_run,
        actor_id=context.user.id,
        allow_number_as_barcode=allow_number_as_barcode,
        organisation_id=context.organisation_id,
    )


@router.post(
    "/tickets/{ticket_id}/void",
    response_model=PrintixTicketPublic,
    summary="Void a ticket of my organisation's event",
    description=(
        "A void ticket is refused at the gate. An admitted ticket cannot be voided, and "
        "nothing changes after the event closes. Needs printix.events.manage."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def void_org_ticket_endpoint(
    *, session: SessionDep, context: PrintixOrgEventsWriteAccess, ticket_id: uuid.UUID
) -> Any:
    return await service.set_ticket_void(
        session,
        ticket_id,
        void=True,
        actor_id=context.user.id,
        organisation_id=context.organisation_id,
    )


@router.post(
    "/tickets/{ticket_id}/unvoid",
    response_model=PrintixTicketPublic,
    summary="Restore a void ticket of my organisation's event",
    description=(
        "Makes a void ticket valid again. Refused after the event closes. Needs "
        "printix.events.manage."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def unvoid_org_ticket_endpoint(
    *, session: SessionDep, context: PrintixOrgEventsWriteAccess, ticket_id: uuid.UUID
) -> Any:
    return await service.set_ticket_void(
        session,
        ticket_id,
        void=False,
        actor_id=context.user.id,
        organisation_id=context.organisation_id,
    )


# --- Gate QR codes (printix.gates.manage) -------------------------------------


@router.post(
    "/events/{event_id}/pairings",
    response_model=PrintixPairingCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Make a gate QR code for my organisation's event",
    description=(
        "Makes a pairing for one gate of the event. The response carries the secret once, "
        "for the QR code on the organiser's screen; it is never stored or returned again. "
        "Expiry defaults to six hours after the event closes and may be at most a day after "
        "close. Typed printed numbers are off unless allow_typed_numbers is set. Needs "
        "printix.gates.manage."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def create_org_pairing_endpoint(
    *,
    session: SessionDep,
    context: PrintixOrgGatesWriteAccess,
    event_id: uuid.UUID,
    body: PrintixPairingCreate,
) -> Any:
    pairing, secret = await service.create_pairing(
        session,
        event_id,
        gate=body.gate,
        expires_at=(
            service.to_naive_utc(body.expires_at)
            if body.expires_at is not None
            else None
        ),
        actor_id=context.user.id,
        allow_typed_numbers=body.allow_typed_numbers,
        organisation_id=context.organisation_id,
    )
    return service.pairing_created(pairing, secret)


@router.post(
    "/pairings/{pairing_id}/revoke",
    response_model=PrintixPairingPublic,
    summary="Cancel a gate QR code of my organisation",
    description=(
        "Ends a pairing at once. Its next scan is refused. Revoking a revoked pairing changes "
        "nothing. Needs printix.gates.manage."
    ),
    responses=_FIND,
)
async def revoke_org_pairing_endpoint(
    *, session: SessionDep, context: PrintixOrgGatesWriteAccess, pairing_id: uuid.UUID
) -> Any:
    return await service.revoke_pairing(
        session,
        pairing_id,
        actor_id=context.user.id,
        organisation_id=context.organisation_id,
    )
