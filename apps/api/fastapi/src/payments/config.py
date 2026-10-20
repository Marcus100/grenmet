from pydantic_settings import BaseSettings, SettingsConfigDict


class PaymentsConfig(BaseSettings):
    """Payments settings loaded from PAYMENTS_* environment variables.

    The Stripe adapter is disabled while ``STRIPE_SECRET_KEY`` is unset, and it
    is TEST MODE ONLY (ADR-0027): a key that does not start with ``sk_test_`` is
    refused at use, so a live card rail cannot be switched on by configuration.
    """

    model_config = SettingsConfigDict(
        env_prefix="PAYMENTS_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    #: Where Stripe Checkout sends the customer afterwards (HTTPS pages of ours).
    STRIPE_SUCCESS_URL: str | None = None
    STRIPE_CANCEL_URL: str | None = None
    STRIPE_API_BASE: str = "https://api.stripe.com"
    #: How old a signed webhook may be before it is refused as a replay.
    WEBHOOK_TOLERANCE_SECONDS: int = 300
    REQUEST_TIMEOUT_SECONDS: float = 10.0


payments_settings = PaymentsConfig()
