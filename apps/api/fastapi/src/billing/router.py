from typing import Any

from fastapi import APIRouter, Request, status

from src.dependencies import CurrentUser

from . import service
from .dependencies import StripeGatewayDep
from .schemas import CheckoutSessionPublic, WebhookReceivedPublic

router = APIRouter(prefix="/billing")


@router.post(
    "/checkout-sessions",
    response_model=CheckoutSessionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create subscription Checkout Session",
    description="Create a Stripe-hosted Checkout Session for the current user.",
    tags=["billing"],
    responses={
        status.HTTP_201_CREATED: {"description": "Checkout Session created"},
        status.HTTP_401_UNAUTHORIZED: {"description": "Authentication required"},
        status.HTTP_502_BAD_GATEWAY: {"description": "Stripe request failed"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Billing is not configured"
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


@router.post(
    "/webhooks/stripe",
    response_model=WebhookReceivedPublic,
    status_code=status.HTTP_200_OK,
    summary="Receive Stripe webhook",
    description="Verify and receive Stripe subscription events.",
    tags=["billing"],
    responses={
        status.HTTP_200_OK: {"description": "Webhook received"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid webhook"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Billing is not configured"
        },
    },
    include_in_schema=False,
)
async def receive_stripe_webhook(*, request: Request, gateway: StripeGatewayDep) -> Any:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    service.handle_stripe_webhook(
        payload=payload,
        signature=signature,
        gateway=gateway,
    )
    return WebhookReceivedPublic(received=True)
