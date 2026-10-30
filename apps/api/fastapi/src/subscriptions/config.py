"""Subscription settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SubscriptionsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Public site of each list, as a JSON object (list key -> origin). Confirm and
    # unsubscribe links redirect here, so only configured origins are ever used.
    SUBSCRIPTIONS_SITE_URLS: dict[str, str] = {
        "signal": "http://localhost:3004",
        "barrels": "http://localhost:4173",
        "gms-alerts": "http://localhost:3003",
        "gms-newsletter": "http://localhost:3003",
    }
    # Public origin of this API, used for the links inside confirmation emails.
    # Falls back to API_BASE_URL, then localhost.
    SUBSCRIPTIONS_API_BASE_URL: str | None = None
    # How long a confirmation link stays valid.
    SUBSCRIPTIONS_CONFIRM_TTL_DAYS: int = 7
    # A pending address is not mailed again inside this window.
    SUBSCRIPTIONS_RESEND_MINUTES: int = 10
    # Daily climate digest. Off by default: the 07:30 job queues nothing until
    # the owner switches it on (test list only before that).
    NEWSLETTER_DIGEST_ENABLED: bool = False
    # JSON feed of posts flagged "include in newsletter" (see newsletter.py).
    # Unset: the digest has no posts section.
    NEWSLETTER_POSTS_FEED_URL: str | None = None
    # Pacing: at most this many digest mails are due per interval, so a large
    # list drains over several minutes instead of in one burst.
    NEWSLETTER_BATCH_SIZE: int = Field(default=50, ge=1)
    NEWSLETTER_BATCH_INTERVAL_SECONDS: int = Field(default=60, ge=0)


subscriptions_settings = SubscriptionsConfig()
