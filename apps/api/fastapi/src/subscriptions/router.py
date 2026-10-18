from fastapi import APIRouter, Request, status
from fastapi.responses import RedirectResponse

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST
from src.rate_limit import limiter

from . import service
from .schemas import SubscribeAccepted, SubscribeRequest

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.post(
    "",
    response_model=SubscribeAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Subscribe to a mailing list",
    description=(
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
    _ = request
    await service.subscribe(
        session=session, list_key=body.list_key, email=str(body.email)
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
