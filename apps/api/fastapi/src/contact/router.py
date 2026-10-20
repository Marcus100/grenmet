from typing import Annotated

from fastapi import APIRouter, Path, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST, NOT_FOUND
from src.organisations import sites
from src.organisations.exceptions import PublicSiteNotFoundError
from src.rate_limit import limiter
from src.turnstile import require_turnstile

from . import service
from .schemas import (
    ContactMessageAccepted,
    ContactMessageBody,
    ContactMessageCreate,
    DataRequestCreate,
)

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "/messages",
    response_model=ContactMessageAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    deprecated=True,
    summary="Send a website contact message",
    description=(
        "Deprecated: use `POST /contact/public/{site_key}/messages`. Public "
        "contact form. Stores the message and emails it to the site's inbox. "
        "Verifies the Turnstile token when enforcement is enabled."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("5/minute")
async def send_contact_message(
    *, request: Request, session: SessionDep, body: ContactMessageCreate
) -> ContactMessageAccepted:
    site_key = body.site.value
    site = await sites.resolve_public_site(session, site_key)
    await require_turnstile(
        request, body.turnstile_token, site.turnstile if site else None
    )
    await service.submit_message(
        session=session, payload=body, site_key=site_key, site=site
    )
    return ContactMessageAccepted(ok=True)


@router.post(
    "/public/{site_key}/messages",
    response_model=ContactMessageAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a contact message to a site",
    description=(
        "Public contact form of the site named by `site_key` (an organisation's "
        "public site). Stores the message and emails it to the site's inbox. "
        "Applies the site's Turnstile policy. 404 when the site is unknown, its "
        "organisation is suspended or it does not accept contact messages."
    ),
    responses={**BAD_REQUEST, **NOT_FOUND},
)
@limiter.limit("5/minute")
async def send_site_contact_message(
    *,
    request: Request,
    session: SessionDep,
    site_key: Annotated[str, Path(max_length=40)],
    body: ContactMessageBody,
) -> ContactMessageAccepted:
    site = await sites.require_public_site(session, site_key)
    if not site.accepts_contact:
        raise PublicSiteNotFoundError()
    await require_turnstile(request, body.turnstile_token, site.turnstile)
    await service.submit_message(
        session=session, payload=body, site_key=site.key, site=site
    )
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
