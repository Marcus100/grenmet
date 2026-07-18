from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class BillingConfig(BaseSettings):
    """Billing settings loaded from BILLING_* environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="BILLING_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PRICE_ID: str | None = None
    CHECKOUT_SUCCESS_URL: HttpUrl = HttpUrl(
        "http://localhost:8000/scalar?checkout=success&session_id={CHECKOUT_SESSION_ID}"
    )
    CHECKOUT_CANCEL_URL: HttpUrl = HttpUrl(
        "http://localhost:8000/scalar?checkout=cancelled"
    )


billing_settings = BillingConfig()
