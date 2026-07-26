import logging

from src.auth.models import User

from .gateway import CheckoutSessionResult, StripeGateway, WebhookEventResult

logger = logging.getLogger(__name__)


def create_subscription_checkout(
    *, current_user: User, gateway: StripeGateway
) -> CheckoutSessionResult:
    checkout_session = gateway.create_subscription_checkout(
        customer_email=str(current_user.email),
        client_reference_id=str(current_user.id),
    )
    logger.info(
        "Stripe Checkout Session created",
        extra={
            "stripe_checkout_session_id": checkout_session.id,
            "user_id": str(current_user.id),
        },
    )
    return checkout_session


def handle_stripe_webhook(
    *, payload: bytes, signature: str, gateway: StripeGateway
) -> WebhookEventResult:
    event = gateway.construct_webhook_event(payload=payload, signature=signature)
    logger.info(
        "Stripe webhook received",
        extra={
            "stripe_event_id": event.id,
            "stripe_event_type": event.type,
            "stripe_object_id": event.object_id,
        },
    )
    return event
