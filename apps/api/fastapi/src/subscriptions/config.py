"""Subscription settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class SubscriptionsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Public site of each list, as a JSON object (list key -> origin). Confirm and
    # unsubscribe links redirect here, so only configured origins are ever used.
    SUBSCRIPTIONS_SITE_URLS: dict[str, str] = {"signal": "http://localhost:3004"}
    # Public origin of this API, used for the links inside confirmation emails.
    # Falls back to API_BASE_URL, then localhost.
    SUBSCRIPTIONS_API_BASE_URL: str | None = None
    # How long a confirmation link stays valid.
    SUBSCRIPTIONS_CONFIRM_TTL_DAYS: int = 7
    # A pending address is not mailed again inside this window.
    SUBSCRIPTIONS_RESEND_MINUTES: int = 10


subscriptions_settings = SubscriptionsConfig()
