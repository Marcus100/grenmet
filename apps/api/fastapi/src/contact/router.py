from fastapi import APIRouter, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST
from src.rate_limit import limiter
from src.turnstile import require_turnstile

from . import service
from .schemas import ContactMessageAccepted, ContactMessageCreate, DataRequestCreate

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "/messages",
    response_model=ContactMessageAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a website contact message",
    description=(
        "Public contact form. Stores the message and emails it to the site's "
        "configured inbox. Verifies the Turnstile token when enforcement is enabled."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("5/minute")
async def send_contact_message(
    *, request: Request, session: SessionDep, body: ContactMessageCreate
) -> ContactMessageAccepted:
    await require_turnstile(request, body.turnstile_token)
    await service.submit_message(session=session, payload=body)
    return ContactMessageAccepted(ok=True)


@router.post(
    "/data-requests",
    response_model=ContactMessageAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a climate data request",
    description=(
        "Public GMS climate data request form. Stores the request, emails it to "
        "the configured inbox and sends the requester a confirmation. Verifies "
        "the Turnstile token when enforcement is enabled."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("5/minute")
async def send_data_request(
    *, request: Request, session: SessionDep, body: DataRequestCreate
) -> ContactMessageAccepted:
    await require_turnstile(request, body.turnstile_token)
    await service.submit_data_request(session=session, payload=body)
    return ContactMessageAccepted(ok=True)
