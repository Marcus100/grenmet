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

LIVE_KEY_REFUSAL = "Live mode is on: only a live Stripe key is accepted"
LIVE_EVENT_REFUSAL = "Live mode is on: only live-mode Stripe events are accepted"

logger = logging.getLogger(__name__)

#: Off (the default): only Stripe TEST keys may call Stripe (ADR-0027).
#: On (BILLING_STRIPE_LIVE_ENABLED, ADR-0065 "Going live"): only LIVE keys may.
TEST_KEY_PREFIX = "sk_test_"
LIVE_KEY_PREFIX = "sk_live_"


@dataclass(frozen=True)
class CheckoutSessionResult:
    id: str
    url: str


@dataclass(frozen=True)
class CheckoutSessionState:
    """A Checkout Session as Stripe reports it now: ``open``, ``complete`` or
    ``expired``. ``url`` is set while the session is open."""

    id: str
    status: str
    url: str | None


@dataclass(frozen=True)
class WebhookEventResult:
    id: str
    type: str
    object_id: str | None
    #: Stripe ``created`` (Unix seconds); 0 when the caller did not read it.
    created: int = 0
    #: ``data.object`` of the event, as Stripe sent it (no expansion).
    data_object: dict[str, Any] = field(default_factory=dict)
    #: Stripe ``livemode``; ``None`` when the event does not say.
    livemode: bool | None = None


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
        success_url: str,
        cancel_url: str,
    ) -> CheckoutSessionResult: ...

    def get_app_subscription_checkout(
        self, *, session_id: str
    ) -> CheckoutSessionState: ...

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
        # The invoicing-era route creates no app subscription row, so it stays
        # test-only whatever the live switch says (ADR-0065: removed or moved before
        # live mode). Refused before any request.
        if self._config.STRIPE_LIVE_ENABLED:
            logger.error("Legacy billing checkout refused: live mode is on")
            raise BillingLiveModeRefusedError(
                "Live mode is on: this checkout route is test-only"
            )
        secret_key = self._stripe_key()
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
        success_url: str,
        cancel_url: str,
    ) -> CheckoutSessionResult:
        """A subscription Checkout Session for one Barrels app plan (test mode only).

        The return URLs are chosen by the service per organisation; this adapter never
        reads a global return URL for app subscriptions.

        The key guard runs before the client exists, so a key of the wrong mode sends
        nothing."""
        secret_key = self._stripe_key()

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
            "cancel_url": cancel_url,
            "client_reference_id": subscription_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "metadata": metadata,
            "mode": "subscription",
            "subscription_data": subscription_data,
            "success_url": success_url,
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

    def get_app_subscription_checkout(self, *, session_id: str) -> CheckoutSessionState:
        """Read a Checkout Session back from Stripe, with the key for the billing mode."""
        secret_key = self._stripe_key()
        try:
            client = stripe.StripeClient(secret_key, max_network_retries=2)
            session = client.v1.checkout.sessions.retrieve(session_id)
        except stripe.StripeError as exc:
            raise BillingProviderError("Stripe Checkout request failed") from exc
        return CheckoutSessionState(
            id=session.id,
            status=session.status or "",
            url=session.url if session.status == "open" else None,
        )

    def _stripe_key(self) -> str:
        return _require_stripe_key(
            self._config.STRIPE_SECRET_KEY,
            live_enabled=self._config.STRIPE_LIVE_ENABLED,
        )

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
        livemode = event_data.get("livemode")
        # Checked after the signature, before anything is written: a test event is
        # refused in live mode and a live event is refused in test mode (ADR-0065).
        live_event = livemode if isinstance(livemode, bool) else None
        if not _event_mode_allowed(
            live_event, live_enabled=self._config.STRIPE_LIVE_ENABLED
        ):
            logger.warning(
                "Stripe event refused: its mode does not match the billing mode",
                extra={
                    "stripe_event_type": event.type,
                    "live_enabled": self._config.STRIPE_LIVE_ENABLED,
                },
            )
            raise BillingLiveModeRefusedError(
                LIVE_EVENT_REFUSAL
                if self._config.STRIPE_LIVE_ENABLED
                else "Only Stripe test mode is permitted"
            )
        return WebhookEventResult(
            id=event.id,
            type=event.type,
            object_id=object_id if isinstance(object_id, str) else None,
            created=created if isinstance(created, int) else 0,
            data_object=data_object if isinstance(data_object, dict) else {},
            livemode=livemode if isinstance(livemode, bool) else None,
        )


def _require_stripe_key(secret_key: str | None, *, live_enabled: bool) -> str:
    """Return the key if it is the Stripe secret key for the billing mode; refuse
    anything else before a request. A test key with live mode on, or a live key with
    it off, is a mixed state and fails closed (ADR-0065)."""
    if not secret_key:
        raise BillingNotConfiguredError()
    prefix = LIVE_KEY_PREFIX if live_enabled else TEST_KEY_PREFIX
    if not secret_key.startswith(prefix):
        logger.error(
            "Refusing a Stripe key that does not match the billing mode",
            extra={"live_enabled": live_enabled},
        )
        raise BillingLiveModeRefusedError(
            LIVE_KEY_REFUSAL if live_enabled else "Only Stripe test mode is permitted"
        )
    return secret_key


def _event_mode_allowed(livemode: bool | None, *, live_enabled: bool) -> bool:
    """Live mode on: only ``livemode: true`` events. Off: every event that is not
    ``livemode: true``, as before the switch existed. An event that does not say its
    mode counts as test while the switch is off, and is refused while it is on."""
    if live_enabled:
        return livemode is True
    return livemode is not True


stripe_gateway = StripeSdkGateway()
