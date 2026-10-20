from typing import Annotated

from fastapi import APIRouter, Path, Request, status
from fastapi.responses import RedirectResponse

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST, NOT_FOUND
from src.organisations import sites
from src.organisations.exceptions import PublicSiteNotFoundError
from src.rate_limit import limiter
from src.turnstile import require_turnstile

from . import service
from .schemas import SiteSubscribeRequest, SubscribeAccepted, SubscribeRequest

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.post(
    "",
    response_model=SubscribeAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    deprecated=True,
    summary="Subscribe to a mailing list",
    description=(
        "Deprecated: use `POST /subscriptions/public/{site_key}`. "
        "Starts a double opt-in subscription and emails a confirmation link. "
        "The reply is identical whether or not the address is already known "
        "or suppressed."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("5/minute")
async def subscribe(
    *, request: Request, session: SessionDep, body: SubscribeRequest
) -> SubscribeAccepted:
    site = await sites.resolve_public_site(session, body.list_key)
    await require_turnstile(
        request, body.turnstile_token, site.turnstile if site else None
    )
    await service.subscribe(
        session=session, list_key=body.list_key, email=str(body.email)
    )
    return SubscribeAccepted(message=service.ACCEPTED_MESSAGE)


@router.post(
    "/public/{site_key}",
    response_model=SubscribeAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Subscribe to a site's mailing list",
    description=(
        "Starts a double opt-in subscription to the list of the public site "
        "named by `site_key` and emails a confirmation link. Applies the site's "
        "Turnstile policy. The reply is identical whether or not the address is "
        "already known or suppressed. 404 when the site is unknown, its "
        "organisation is suspended or it has no mailing list."
    ),
    responses={**BAD_REQUEST, **NOT_FOUND},
)
@limiter.limit("5/minute")
async def subscribe_to_site(
    *,
    request: Request,
    session: SessionDep,
    site_key: Annotated[str, Path(max_length=40)],
    body: SiteSubscribeRequest,
) -> SubscribeAccepted:
    site = await sites.require_public_site(session, site_key)
    if not site.accepts_subscriptions:
        raise PublicSiteNotFoundError()
    await require_turnstile(request, body.turnstile_token, site.turnstile)
    await service.subscribe(
        session=session, list_key=site.key, email=str(body.email), list_name=site.name
    )
    return SubscribeAccepted(message=service.ACCEPTED_MESSAGE)


@router.get(
    "/confirm",
    status_code=status.HTTP_303_SEE_OTHER,
    response_class=RedirectResponse,
    summary="Confirm a subscription",
    description=(
        "Follows the emailed confirmation link, then redirects to the list's "
        "site with a result in the query string."
    ),
)
@limiter.limit("30/minute")
async def confirm_subscription(
    *, request: Request, session: SessionDep, token: str
) -> RedirectResponse:
    _ = request
    url = await service.confirm(session=session, token=token)
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


@router.get(
    "/unsubscribe",
    status_code=status.HTTP_303_SEE_OTHER,
    response_class=RedirectResponse,
    summary="Unsubscribe from a mailing list",
    description=(
        "Follows the emailed unsubscribe link, then redirects to the list's "
        "site with a result in the query string."
    ),
)
@limiter.limit("30/minute")
async def unsubscribe(
    *, request: Request, session: SessionDep, token: str
) -> RedirectResponse:
    _ = request
    url = await service.unsubscribe(session=session, token=token)
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)
