from dataclasses import dataclass
from typing import Any, Protocol

import stripe

from .config import BillingConfig, billing_settings
from .exceptions import (
    BillingNotConfiguredError,
    BillingProviderError,
    InvalidStripeWebhookError,
)


@dataclass(frozen=True)
class CheckoutSessionResult:
    id: str
    url: str


@dataclass(frozen=True)
class WebhookEventResult:
    id: str
    type: str
    object_id: str | None


class StripeGateway(Protocol):
    def create_subscription_checkout(
        self, *, customer_email: str, client_reference_id: str
    ) -> CheckoutSessionResult: ...

    def construct_webhook_event(
        self, *, payload: bytes, signature: str
    ) -> WebhookEventResult: ...


class StripeSdkGateway:
    """Adapter from the billing seam to Stripe's official Python SDK."""

    def __init__(self, config: BillingConfig | None = None) -> None:
        self._config = config or billing_settings

    def create_subscription_checkout(
        self, *, customer_email: str, client_reference_id: str
    ) -> CheckoutSessionResult:
        secret_key = self._config.STRIPE_SECRET_KEY
        price_id = self._config.STRIPE_PRICE_ID
        if not secret_key or not price_id:
            raise BillingNotConfiguredError()

        try:
            client = stripe.StripeClient(secret_key, max_network_retries=2)
            session = client.v1.checkout.sessions.create(
                {
                    "cancel_url": str(self._config.CHECKOUT_CANCEL_URL),
                    "client_reference_id": client_reference_id,
                    "customer_email": customer_email,
                    "line_items": [{"price": price_id, "quantity": 1}],
                    "metadata": {"user_id": client_reference_id},
                    "mode": "subscription",
                    "subscription_data": {"metadata": {"user_id": client_reference_id}},
                    "success_url": str(self._config.CHECKOUT_SUCCESS_URL),
                }
            )
        except stripe.StripeError as exc:
            raise BillingProviderError("Stripe Checkout request failed") from exc
        if not session.url:
            raise BillingProviderError("Stripe did not return a Checkout URL")
        return CheckoutSessionResult(id=session.id, url=session.url)

    def construct_webhook_event(
        self, *, payload: bytes, signature: str
    ) -> WebhookEventResult:
        webhook_secret = self._config.STRIPE_WEBHOOK_SECRET
        if not webhook_secret:
            raise BillingNotConfiguredError()

        try:
            event = stripe.Webhook.construct_event(  # type: ignore[no-untyped-call]
                payload,
                signature,
                webhook_secret,
            )
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise InvalidStripeWebhookError() from exc
        event_data: dict[str, Any] = event.to_dict()
        data_object = event_data.get("data", {}).get("object", {})
        object_id = data_object.get("id") if isinstance(data_object, dict) else None
        return WebhookEventResult(
            id=event.id,
            type=event.type,
            object_id=object_id if isinstance(object_id, str) else None,
        )


stripe_gateway = StripeSdkGateway()
