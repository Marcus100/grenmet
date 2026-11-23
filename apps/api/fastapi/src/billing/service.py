import logging

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from . import app_subscriptions
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


async def handle_stripe_webhook(
    *,
    session: AsyncSession,
    payload: bytes,
    signature: str,
    gateway: StripeGateway,
) -> WebhookEventResult:
    """Verify the signature, then apply the event once (ADR-0065).

    Signature checking is CPU-only, but it goes through the threadpool like every
    provider-SDK call. The caller commits the session."""
    event = await run_in_threadpool(
        gateway.construct_webhook_event, payload=payload, signature=signature
    )
    logger.info(
        "Stripe webhook received",
        extra={
            "stripe_event_id": event.id,
            "stripe_event_type": event.type,
            "stripe_object_id": event.object_id,
        },
    )
    outcome = await app_subscriptions.apply_stripe_event(session, event)
    logger.info(
        "Stripe webhook handled",
        extra={
            "stripe_event_id": event.id,
            "stripe_event_type": event.type,
            "outcome": outcome,
        },
    )
    return event
