"""Printix gate scanner: admit a scanned ticket and read the live count (ADR-0060).

Zone ``public`` (ADR-0025): no account. Each call presents the pairing secret as
``Authorization: Bearer <secret>``, and the secret is checked on every call. An
admission outcome is a 200 with a stable ``outcome`` code, not an error, so a
phone can show the result at once.
"""

from typing import Any

from fastapi import APIRouter, status

from src.dependencies import SessionDep
from src.models import ApiError
from src.openapi_responses import ResponseMap

from . import service
from .dependencies import PairingDep
from .schemas import PrintixEventSummary, PrintixScanRequest, PrintixScanResult

router = APIRouter(prefix="/printix/public", tags=["printix-scanner"])

PAIRING_RESPONSES: ResponseMap = {
    401: {
        "model": ApiError,
        "description": "The pairing secret is missing, malformed or not recognised",
    },
    403: {
        "model": ApiError,
        "description": "The pairing has been revoked or has expired",
    },
}
RATE_LIMITED: ResponseMap = {
    429: {
        "model": ApiError,
        "description": "This pairing made too many scans in a minute; see Retry-After",
    },
}


@router.post(
    "/admissions",
    response_model=PrintixScanResult,
    status_code=status.HTTP_200_OK,
    summary="Admit a scanned ticket",
    description=(
        "Admits a scanned barcode value, or a typed printed number, to the pairing's "
        "event. Outcomes: admitted; already_admitted (with the first admission's time "
        "and gate); void; unknown (not a ticket for this event, whether or not it is "
        "one for another event); event_closed. Exactly one of two concurrent scans of "
        "the same ticket is admitted."
    ),
    tags=["printix-scanner"],
    responses={**PAIRING_RESPONSES, **RATE_LIMITED},
)
async def admit_ticket_endpoint(
    *, session: SessionDep, pairing: PairingDep, body: PrintixScanRequest
) -> Any:
    return await service.admit(session, pairing, body.value)


@router.get(
    "/summary",
    response_model=PrintixEventSummary,
    summary="Live count for the pairing's event",
    description="The event's issued, admitted and not-yet-in counts, for the promoter's live view.",
    tags=["printix-scanner"],
    responses={**PAIRING_RESPONSES},
)
async def pairing_summary_endpoint(*, session: SessionDep, pairing: PairingDep) -> Any:
    return await service.event_summary(session, pairing.event_id)
