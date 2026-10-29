from typing import Annotated

from fastapi import APIRouter, Path, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from src.auth.policy import require_permission
from src.dependencies import CurrentUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations import sites
from src.organisations.exceptions import PublicSiteNotFoundError
from src.rate_limit import limiter
from src.turnstile import require_turnstile

from . import newsletter, pages, service
from .constants import NEWSLETTER_TEST_PERMISSION
from .schemas import (
    NewsletterTestAccepted,
    NewsletterTestRequest,
    SiteSubscribeRequest,
    SubscribeAccepted,
    SubscribeRequest,
)

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
    summary="Open the unsubscribe page",
    description=(
        "Follows an emailed unsubscribe link to the confirmation page at "
        "`/subscriptions/unsubscribe/confirm`. Changes nothing, so mail scanners that open "
        "links cannot unsubscribe anyone. The unsubscribe itself is `POST`."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("30/minute")
async def unsubscribe(*, request: Request, token: str) -> RedirectResponse:
    _ = request
    return RedirectResponse(service.unsubscribe_confirm_url(token), status_code=303)


@router.get(
    "/unsubscribe/confirm",
    response_class=HTMLResponse,
    summary="Confirm an unsubscribe",
    description=(
        "HTML page that names the mailing list behind an unsubscribe token and "
        "offers the button that unsubscribes. Changes nothing. An invalid token "
        "gets a 400 page."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("30/minute")
async def unsubscribe_confirm_page(
    *, request: Request, session: SessionDep, token: str
) -> HTMLResponse:
    _ = request
    list_name = await service.unsubscribe_context(session=session, token=token)
    if list_name is None:
        return HTMLResponse(pages.invalid(), status_code=status.HTTP_400_BAD_REQUEST)
    return HTMLResponse(
        pages.confirm_unsubscribe(
            list_name=list_name, action_url=service.unsubscribe_action_url(token)
        )
    )


@router.post(
    "/unsubscribe",
    response_class=HTMLResponse,
    summary="Unsubscribe from a mailing list",
    description=(
        "Stops the mailing list behind the token. Used by the confirmation page and "
        "by one-click mail clients (`List-Unsubscribe-Post`), so it answers with "
        "an HTML page and no redirect. Repeating it is harmless. An invalid token "
        "gets a 400 page and changes nothing."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("30/minute")
async def stop_subscription(
    *, request: Request, session: SessionDep, token: str
) -> HTMLResponse:
    _ = request
    list_name = await service.unsubscribe(session=session, token=token)
    if list_name is None:
        return HTMLResponse(pages.invalid(), status_code=status.HTTP_400_BAD_REQUEST)
    return HTMLResponse(pages.unsubscribed(list_name=list_name))


@router.post(
    "/admin/newsletter/test",
    response_model=NewsletterTestAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a test copy of the climate newsletter",
    description=(
        "Queues one test copy of today's climate newsletter to an address that has "
        "confirmed the list, with a working unsubscribe link. Nothing goes to other "
        "subscribers. Needs `newsletter.send_test`. 409 when the address has not "
        "confirmed the newsletter."
    ),
    tags=["subscriptions"],
    responses={**AUTHENTICATED, **CONFLICT},
)
async def send_newsletter_test(
    *, session: SessionDep, current_user: CurrentUser, body: NewsletterTestRequest
) -> NewsletterTestAccepted:
    require_permission(
        current_user=current_user, permission_key=NEWSLETTER_TEST_PERMISSION
    )
    await newsletter.queue_test(session=session, email=str(body.email))
    return NewsletterTestAccepted(
        message="A test copy is queued for that address.", queued=True
    )
