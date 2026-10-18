from fastapi import APIRouter, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST
from src.rate_limit import limiter

from . import service
from .config import push_settings
from .schemas import (
    PushAccepted,
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    VapidPublicKey,
)

router = APIRouter(prefix="/push", tags=["push"])


@router.get(
    "/vapid-public-key",
    response_model=VapidPublicKey,
    summary="Get the Web Push public key",
    description=(
        "Returns the VAPID public key a browser needs to subscribe, or "
        "`enabled: false` when browser notifications are not configured."
    ),
)
@limiter.limit("60/minute")
async def vapid_public_key(*, request: Request) -> VapidPublicKey:
    _ = request
    if not push_settings.enabled:
        return VapidPublicKey(enabled=False)
    return VapidPublicKey(
        enabled=True, public_key=push_settings.WEBPUSH_VAPID_PUBLIC_KEY
    )


@router.post(
    "/subscriptions",
    response_model=PushAccepted,
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe a browser to push alerts",
    description=(
        "Stores a browser PushSubscription for the list. Public and "
        "browser-origin only; the endpoint must belong to a known push service."
    ),
    responses={**BAD_REQUEST, 503: {"description": "Browser push is not configured"}},
)
@limiter.limit("10/minute")
async def subscribe(
    *, request: Request, session: SessionDep, body: PushSubscribeRequest
) -> PushAccepted:
    _ = request
    await service.subscribe(session=session, body=body)
    return PushAccepted(message=service.SUBSCRIBED_MESSAGE)


@router.delete(
    "/subscriptions",
    response_model=PushAccepted,
    summary="Unsubscribe a browser from push alerts",
    description="Removes the browser's subscription by endpoint. Unknown endpoints succeed.",
    responses={**BAD_REQUEST},
)
@limiter.limit("10/minute")
async def unsubscribe(
    *, request: Request, session: SessionDep, body: PushUnsubscribeRequest
) -> PushAccepted:
    _ = request
    await service.unsubscribe(session=session, endpoint=body.endpoint)
    return PushAccepted(message=service.UNSUBSCRIBED_MESSAGE)
