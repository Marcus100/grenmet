"""Printix gate scanner: admit a scanned ticket and read the live count (ADR-0060).

Zone ``public`` (ADR-0025): no account. Each call presents the pairing secret as
``Authorization: Bearer <secret>``, and the secret is checked on every call. An
admission outcome is a 200 with a stable ``outcome`` code, not an error, so a
phone can show the result at once.

Limits: every scanner route is capped per client address (gate wifi shares one
address, so the cap is generous). The summary is also capped per pairing, keyed on
a hash of the presented secret, so one phone cannot poll the server. Scan caps are
counted in the service under the pairing's lock.
"""

from typing import Any

from fastapi import APIRouter, Request, status

from src.dependencies import SessionDep
from src.models import ApiError
from src.openapi_responses import RateLimitedBody, ResponseMap
from src.rate_limit import limiter, visitor_address

from . import constants, service
from .dependencies import PairingDep, secret_from_header
from .schemas import PrintixEventSummary, PrintixScanRequest, PrintixScanResult

router = APIRouter(prefix="/printix/public", tags=["printix-scanner"])


ADDRESS_LIMIT = f"{constants.SCANNER_REQUESTS_PER_MINUTE}/minute"
SUMMARY_LIMIT = f"{constants.SUMMARY_READS_PER_MINUTE}/minute"

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
        "model": RateLimitedBody,
        "description": (
            "Too many requests from this address, or too many scans from this pairing "
            "(unknown or typed-number caps); see Retry-After"
        ),
    },
}


def _pairing_key(request: Request) -> str:
    """The summary's per-pairing bucket: a hash of the secret, never the secret."""
    secret = secret_from_header(request.headers.get("authorization"))
    if secret is None:
        return "printix-summary:none"
    return f"printix-summary:{service.hash_secret(secret)}"


@router.post(
    "/admissions",
    response_model=PrintixScanResult,
    status_code=status.HTTP_200_OK,
    summary="Admit a scanned ticket",
    description=(
        "Admits a scanned barcode value, or a typed printed number when the pairing "
        "allows typed numbers, to the pairing's event. Outcomes: admitted; "
        "already_admitted (with the first admission's time and gate); void; unknown "
        "(not a ticket for this event, whether or not it is one for another event); "
        "event_closed. Exactly one of two concurrent scans of the same ticket is "
        "admitted. Control characters are refused with 422."
    ),
    responses={**PAIRING_RESPONSES, **RATE_LIMITED},
)
@limiter.limit(ADDRESS_LIMIT, key_func=visitor_address)
async def admit_ticket_endpoint(
    *,
    request: Request,
    session: SessionDep,
    pairing: PairingDep,
    body: PrintixScanRequest,
) -> Any:
    del request  # slowapi reads it from the signature to key the limit
    return await service.admit(session, pairing, body.value)


@router.get(
    "/summary",
    response_model=PrintixEventSummary,
    summary="Live count for the pairing's event",
    description=(
        "The event's issued, admitted and not-yet-in counts, for the promoter's live "
        "view. Limited to 30 reads a minute per pairing."
    ),
    responses={**PAIRING_RESPONSES, **RATE_LIMITED},
)
@limiter.limit(ADDRESS_LIMIT, key_func=visitor_address)
@limiter.limit(SUMMARY_LIMIT, key_func=_pairing_key)
async def pairing_summary_endpoint(
    *, request: Request, session: SessionDep, pairing: PairingDep
) -> Any:
    del request  # slowapi reads it from the signature to key the limits
    return await service.event_summary(session, pairing.event_id)
