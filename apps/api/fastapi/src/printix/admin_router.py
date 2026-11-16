"""Printix administration: events, ticket import, tickets, pairings (ADR-0060).

Every route needs a superuser with two-step sign-in (``PrintixAdmin``). Responses
never include a barcode value or a pairing secret, except the one creation
response that carries the secret. Each write records the acting administrator in
the audit log.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Query, UploadFile, status

from src.dependencies import SessionDep
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep

from . import constants, service
from .constants import PrintixTicketStatus
from .dependencies import PrintixAdmin
from .schemas import (
    PrintixEventCreate,
    PrintixEventOrganisationUpdate,
    PrintixEventPage,
    PrintixEventPublic,
    PrintixEventSummary,
    PrintixImportReport,
    PrintixPairingCreate,
    PrintixPairingCreated,
    PrintixPairingPublic,
    PrintixTicketPage,
    PrintixTicketPublic,
)

router = APIRouter(prefix="/printix/admin", tags=["printix-admin"])

# Each route documents only the errors it can return.
_UNAUTHENTICATED = {**AUTHENTICATED}
_FIND = {**AUTHENTICATED, **NOT_FOUND}
_FIND_OR_CONFLICT = {**AUTHENTICATED, **NOT_FOUND, **CONFLICT}


@router.post(
    "/events",
    response_model=PrintixEventPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Printix event",
    description=(
        "Creates an open event with a name, a date and the time it closes at the "
        "gate. The close time must be in the future and not before the event date."
    ),
    responses=_UNAUTHENTICATED,
)
async def create_event_endpoint(
    *, session: SessionDep, admin: PrintixAdmin, body: PrintixEventCreate
) -> Any:
    event = await service.create_event(
        session,
        name=body.name,
        event_date=body.event_date,
        closes_at=service.to_naive_utc(body.closes_at),
        actor_id=admin.id,
        organisation_id=body.organisation_id,
    )
    return service.event_public(event)


@router.get(
    "/events",
    response_model=PrintixEventPage,
    summary="List Printix events",
    description=(
        "Every Printix event, newest date first, whatever its organisation (including "
        "events with none). Organisers use the organisation route instead."
    ),
    responses=_UNAUTHENTICATED,
)
async def list_events_endpoint(
    *, session: SessionDep, _admin: PrintixAdmin, pagination: PaginationDep
) -> Any:
    return await service.list_events(
        session, organisation_id=None, page=pagination.page, size=pagination.size
    )


@router.post(
    "/events/{event_id}/organisation",
    response_model=PrintixEventPublic,
    summary="Set the organisation that owns a Printix event",
    description=(
        "Sets or clears (null) the organisation that owns the event. Organisers of that "
        "organisation see the event at once; events with none are visible only here."
    ),
    responses=_FIND,
)
async def set_event_organisation_endpoint(
    *,
    session: SessionDep,
    admin: PrintixAdmin,
    event_id: uuid.UUID,
    body: PrintixEventOrganisationUpdate,
) -> Any:
    event = await service.set_event_organisation(
        session,
        event_id,
        organisation_id=body.organisation_id,
        actor_id=admin.id,
    )
    return service.event_public(event)


@router.post(
    "/events/{event_id}/close",
    response_model=PrintixEventPublic,
    summary="Close a Printix event",
    description=(
        "Closes the event: every scan answers event_closed, no new pairing is made, "
        "and no ticket is voided, restored or imported. Revoking a pairing stays "
        "allowed. Closing a closed event changes nothing."
    ),
    responses=_FIND,
)
async def close_event_endpoint(
    *, session: SessionDep, admin: PrintixAdmin, event_id: uuid.UUID
) -> Any:
    event = await service.close_event(session, event_id, actor_id=admin.id)
    return service.event_public(event)


@router.get(
    "/events/{event_id}/summary",
    response_model=PrintixEventSummary,
    summary="Printix event summary",
    description=(
        "Issued, void, admitted and not-yet-in counts, duplicate scans refused, and "
        "admissions per gate."
    ),
    responses=_FIND,
)
async def event_summary_endpoint(
    *, session: SessionDep, _admin: PrintixAdmin, event_id: uuid.UUID
) -> Any:
    return await service.event_summary(session, event_id)


@router.post(
    "/events/{event_id}/tickets/import",
    response_model=PrintixImportReport,
    summary="Import the printer's ticket list",
    description=(
        "Uploads the printer's CSV (a number column and an optional barcode column). "
        "With dry_run (the default) it only checks the file and reports every problem "
        "with its line, plus warnings. Without dry_run it writes every row, or nothing "
        "when any row has a problem. Refused for a closed event."
    ),
    responses={
        **_FIND_OR_CONFLICT,
        413: {
            "model": ApiError,
            "description": "The file is larger than the import limit",
        },
    },
)
async def import_tickets_endpoint(
    *,
    session: SessionDep,
    admin: PrintixAdmin,
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
        actor_id=admin.id,
        allow_number_as_barcode=allow_number_as_barcode,
    )


@router.get(
    "/events/{event_id}/tickets",
    response_model=PrintixTicketPage,
    summary="List Printix tickets",
    description=(
        "Tickets of one event, in printed-number order (digits numerically), with "
        "optional filters. The total counts every ticket that matches. Barcode values "
        "are not returned."
    ),
    responses=_FIND,
)
async def list_tickets_endpoint(
    *,
    session: SessionDep,
    _admin: PrintixAdmin,
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
    )


@router.post(
    "/tickets/{ticket_id}/void",
    response_model=PrintixTicketPublic,
    summary="Void a Printix ticket",
    description=(
        "A void ticket is refused at the gate. An admitted ticket cannot be voided, "
        "and nothing changes after the event closes. Voiding a void ticket changes "
        "nothing."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def void_ticket_endpoint(
    *, session: SessionDep, admin: PrintixAdmin, ticket_id: uuid.UUID
) -> Any:
    return await service.set_ticket_void(
        session, ticket_id, void=True, actor_id=admin.id
    )


@router.post(
    "/tickets/{ticket_id}/unvoid",
    response_model=PrintixTicketPublic,
    summary="Restore a void Printix ticket",
    description=(
        "Makes a void ticket valid again. Refused after the event closes. A valid "
        "ticket changes nothing."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def unvoid_ticket_endpoint(
    *, session: SessionDep, admin: PrintixAdmin, ticket_id: uuid.UUID
) -> Any:
    return await service.set_ticket_void(
        session, ticket_id, void=False, actor_id=admin.id
    )


@router.post(
    "/events/{event_id}/pairings",
    response_model=PrintixPairingCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create a gate pairing",
    description=(
        "Creates a pairing for one gate of one event. The response carries the secret "
        "once; it is not stored and never returned again. Expiry defaults to six hours "
        "after the event closes and may be at most a day after close. Typed printed "
        "numbers are off unless allow_typed_numbers is set."
    ),
    responses=_FIND_OR_CONFLICT,
)
async def create_pairing_endpoint(
    *,
    session: SessionDep,
    admin: PrintixAdmin,
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
        actor_id=admin.id,
        allow_typed_numbers=body.allow_typed_numbers,
    )
    return service.pairing_created(pairing, secret)


@router.get(
    "/events/{event_id}/pairings",
    response_model=list[PrintixPairingPublic],
    summary="List gate pairings",
    description="Every pairing of one event, newest first. Secrets are never returned here.",
    responses=_FIND,
)
async def list_pairings_endpoint(
    *, session: SessionDep, _admin: PrintixAdmin, event_id: uuid.UUID
) -> Any:
    return await service.list_pairings(session, event_id)


@router.post(
    "/pairings/{pairing_id}/revoke",
    response_model=PrintixPairingPublic,
    summary="Revoke a gate pairing",
    description=(
        "Ends a pairing at once, for a lost or stolen phone. Its next scan is refused. "
        "Revoking a revoked pairing changes nothing."
    ),
    responses=_FIND,
)
async def revoke_pairing_endpoint(
    *, session: SessionDep, admin: PrintixAdmin, pairing_id: uuid.UUID
) -> Any:
    return await service.revoke_pairing(session, pairing_id, actor_id=admin.id)
