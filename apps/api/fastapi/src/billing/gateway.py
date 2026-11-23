import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, cast

import stripe
from stripe import RequestOptions

from src import provider_health

from .config import BillingConfig, billing_settings

if TYPE_CHECKING:
    from stripe.params.checkout import SessionCreateParams
from .exceptions import (
    BillingLiveModeRefusedError,
    BillingNotConfiguredError,
    BillingProviderError,
    InvalidStripeWebhookError,
)

logger = logging.getLogger(__name__)

#: Only Stripe TEST keys may create app subscription checkouts (ADR-0027).
TEST_KEY_PREFIX = "sk_test_"


@dataclass(frozen=True)
class CheckoutSessionResult:
    id: str
    url: str


@dataclass(frozen=True)
class WebhookEventResult:
    id: str
    type: str
    object_id: str | None
    #: Stripe ``created`` (Unix seconds); 0 when the caller did not read it.
    created: int = 0
    #: ``data.object`` of the event, as Stripe sent it (no expansion).
    data_object: dict[str, Any] = field(default_factory=dict)


class StripeGateway(Protocol):
    def create_subscription_checkout(
        self, *, customer_email: str, client_reference_id: str
    ) -> CheckoutSessionResult: ...

    def create_app_subscription_checkout(
        self,
        *,
        subscription_id: str,
        organisation_id: str,
        plan_key: str,
        app_key: str,
        price_id: str,
        customer_id: str | None,
        customer_email: str | None,
        trial_period_days: int | None,
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
        # Test mode only (ADR-0027): a live key is refused before any request.
        secret_key = _require_test_key(self._config.STRIPE_SECRET_KEY)
        price_id = self._config.STRIPE_PRICE_ID
        if not price_id:
            raise BillingNotConfiguredError()

        try:
            client = stripe.StripeClient(secret_key, max_network_retries=2)
            # Only Stripe's own trouble counts as a provider failure; a request it
            # rejects (for example a bad email) is not an outage.
            with provider_health.watch(
                "stripe",
                "checkout",
                errors=(stripe.APIConnectionError, stripe.APIError),
            ):
                session = client.v1.checkout.sessions.create(
                    {
                        "cancel_url": str(self._config.CHECKOUT_CANCEL_URL),
                        "client_reference_id": client_reference_id,
                        "customer_email": customer_email,
                        "line_items": [{"price": price_id, "quantity": 1}],
                        "metadata": {"user_id": client_reference_id},
                        "mode": "subscription",
                        "subscription_data": {
                            "metadata": {"user_id": client_reference_id}
                        },
                        "success_url": str(self._config.CHECKOUT_SUCCESS_URL),
                    }
                )
        except stripe.StripeError as exc:
            raise BillingProviderError("Stripe Checkout request failed") from exc
        if not session.url:
            raise BillingProviderError("Stripe did not return a Checkout URL")
        return CheckoutSessionResult(id=session.id, url=session.url)

    def create_app_subscription_checkout(
        self,
        *,
        subscription_id: str,
        organisation_id: str,
        plan_key: str,
        app_key: str,
        price_id: str,
        customer_id: str | None,
        customer_email: str | None,
        trial_period_days: int | None,
    ) -> CheckoutSessionResult:
        """A subscription Checkout Session for one Barrels app plan (test mode only).

        The key guard runs before the client exists, so a live key sends nothing."""
        secret_key = _require_test_key(self._config.STRIPE_SECRET_KEY)

        metadata = {
            "organisation_id": organisation_id,
            "app_subscription_id": subscription_id,
            "plan_key": plan_key,
            "app_key": app_key,
        }
        subscription_data: dict[str, Any] = {"metadata": metadata}
        if trial_period_days:
            subscription_data["trial_period_days"] = trial_period_days
        params: dict[str, Any] = {
            "cancel_url": str(self._config.CHECKOUT_CANCEL_URL),
            "client_reference_id": subscription_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "metadata": metadata,
            "mode": "subscription",
            "subscription_data": subscription_data,
            "success_url": str(self._config.CHECKOUT_SUCCESS_URL),
        }
        if customer_id:
            params["customer"] = customer_id
        elif customer_email:
            params["customer_email"] = customer_email

        # One Checkout Session per subscription row: an SDK retry replays this key.
        options: RequestOptions = {
            "idempotency_key": f"app-subscription-checkout-{subscription_id}"
        }
        try:
            client = stripe.StripeClient(secret_key, max_network_retries=2)
            session = client.v1.checkout.sessions.create(
                cast("SessionCreateParams", params), options
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
            event = stripe.Webhook.construct_event(
                payload,
                signature,
                webhook_secret,
            )
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise InvalidStripeWebhookError() from exc
        event_data: dict[str, Any] = event.to_dict()
        data = event_data.get("data", {})
        data_object = data.get("object", {}) if isinstance(data, dict) else {}
        object_id = data_object.get("id") if isinstance(data_object, dict) else None
        created = event_data.get("created")
        return WebhookEventResult(
            id=event.id,
            type=event.type,
            object_id=object_id if isinstance(object_id, str) else None,
            created=created if isinstance(created, int) else 0,
            data_object=data_object if isinstance(data_object, dict) else {},
        )


def _require_test_key(secret_key: str | None) -> str:
    """Return the key if it is a Stripe TEST secret key; refuse anything else."""
    if not secret_key:
        raise BillingNotConfiguredError()
    if not secret_key.startswith(TEST_KEY_PREFIX):
        logger.error("Refusing a non-test Stripe key: live billing is disabled")
        raise BillingLiveModeRefusedError()
    return secret_key


stripe_gateway = StripeSdkGateway()
