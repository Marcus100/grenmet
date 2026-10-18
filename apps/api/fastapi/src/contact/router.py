from fastapi import APIRouter, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST
from src.rate_limit import limiter

from . import service
from .schemas import ContactMessageAccepted, ContactMessageCreate

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "/messages",
    response_model=ContactMessageAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a website contact message",
    description=(
        "Public contact form. Stores the message and emails it to the site's "
        "configured inbox. Accepts an optional Turnstile token (not yet verified)."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("5/minute")
async def send_contact_message(
    *, request: Request, session: SessionDep, body: ContactMessageCreate
) -> ContactMessageAccepted:
    _ = request
    await service.submit_message(session=session, payload=body)
    return ContactMessageAccepted(ok=True)
