from typing import Any

from fastapi import APIRouter, Request, status

from src.dependencies import CurrentUser, SessionDep
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED, CONFLICT, NOT_FOUND

from . import app_subscriptions, service
from .dependencies import BillingOrgAdmin, StripeGatewayDep
from .schemas import (
    AppSubscriptionCheckoutCreate,
    AppSubscriptionCheckoutPublic,
    AppSubscriptionListPublic,
    CheckoutSessionPublic,
    WebhookReceivedPublic,
)

router = APIRouter(prefix="/billing")

_APP_SUBSCRIPTION_WRITE_ERRORS = {
    **AUTHENTICATED,
    **NOT_FOUND,
    **CONFLICT,
    422: {"model": ApiError, "description": "This plan has no price in that currency"},
    502: {"description": "Stripe request failed"},
    503: {
        "description": (
            "Billing is not configured, or the Stripe key does not match the billing mode"
        )
    },
}


@router.post(
    "/checkout-sessions",
    response_model=CheckoutSessionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create subscription Checkout Session",
    description=(
        "Create a Stripe-hosted Checkout Session for the current user. Test mode only: "
        "refused with 503 while live mode is on (ADR-0065). Not an app subscription; "
        "use POST /billing/org/subscriptions/checkout."
    ),
    tags=["billing"],
    responses={
        status.HTTP_201_CREATED: {"description": "Checkout Session created"},
        status.HTTP_401_UNAUTHORIZED: {
            "model": ApiError,
            "description": "Authentication required",
        },
        status.HTTP_502_BAD_GATEWAY: {"description": "Stripe request failed"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Billing is not configured, or live mode is on"
        },
    },
)
def create_subscription_checkout(
    *, current_user: CurrentUser, gateway: StripeGatewayDep
) -> Any:
    return service.create_subscription_checkout(
        current_user=current_user,
        gateway=gateway,
    )


@router.get(
    "/org/subscriptions",
    response_model=AppSubscriptionListPublic,
    status_code=status.HTTP_200_OK,
    summary="List the organisation's app subscriptions",
    description=(
        "Barrels app subscriptions of the organisation the request acts for, newest "
        "first, with each plan's amount in XCD minor units (ADR-0065). Organisation "
        "admins and owners only, signed in with an account or the bookings studio "
        "session. Needs no app entitlement: the plan screen is how it is bought. "
        "`purchasable` lists the plans a checkout can start for now."
    ),
    operation_id="billingListAppSubscriptions",
    tags=["billing"],
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def list_app_subscriptions(*, session: SessionDep, org: BillingOrgAdmin) -> Any:
    data = await app_subscriptions.list_subscriptions(
        session, organisation_id=org.organisation_id
    )
    return AppSubscriptionListPublic(
        data=data, purchasable=app_subscriptions.purchasable_prices()
    )


@router.post(
    "/org/subscriptions/checkout",
    response_model=AppSubscriptionCheckoutPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Start an app subscription checkout",
    description=(
        "Create a pending subscription for one plan and return the hosted Stripe "
        "Checkout URL. A repeat call while that Checkout is still open returns the "
        "same id and URL (201), so an abandoned checkout does not block the customer; "
        "once it has expired, a fresh Checkout replaces it. 409 when the organisation "
        "already has a live subscription to the app, or when the first checkout is paid "
        "and Stripe has not reported it yet. Test mode only: a live Stripe key is "
        "refused with 503 before anything is sent. Organisation admins and owners only, "
        "signed in with an account or the bookings studio session. Stripe returns the "
        "customer to the organisation's studio plan page."
    ),
    operation_id="billingCreateAppSubscriptionCheckout",
    tags=["billing"],
    responses=_APP_SUBSCRIPTION_WRITE_ERRORS,
)
async def create_app_subscription_checkout(
    *,
    session: SessionDep,
    org: BillingOrgAdmin,
    gateway: StripeGatewayDep,
    payload: AppSubscriptionCheckoutCreate,
) -> Any:
    result = await app_subscriptions.start_checkout(
        session,
        gateway=gateway,
        organisation_id=org.organisation_id,
        organisation_slug=org.organisation.slug,
        user=org.user,
        payload=payload,
    )
    await session.commit()
    return result


@router.post(
    "/webhooks/stripe",
    response_model=WebhookReceivedPublic,
    status_code=status.HTTP_200_OK,
    summary="Receive Stripe webhook",
    description="Verify and receive Stripe subscription events.",
    tags=["billing"],
    responses={
        status.HTTP_200_OK: {"description": "Webhook received"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid webhook",
        },
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": (
                "Billing is not configured, an event does not match the billing mode "
                "(live mode on: only live events; off: no live events), or the "
                "subscription row is not written yet (Stripe sends the event again)"
            )
        },
    },
    include_in_schema=False,
)
async def receive_stripe_webhook(
    *, request: Request, session: SessionDep, gateway: StripeGatewayDep
) -> Any:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    await service.handle_stripe_webhook(
        session=session,
        payload=payload,
        signature=signature,
        gateway=gateway,
    )
    await session.commit()
    return WebhookReceivedPublic(received=True)
