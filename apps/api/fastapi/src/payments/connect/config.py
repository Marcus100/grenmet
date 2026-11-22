"""Stripe Connect settings for New Zealand businesses (ADR-0027), ``PAYMENTS_*``.

Kept apart from the core ``PaymentsConfig`` so the connect module owns its own
knobs. Still TEST MODE: the platform key must be ``sk_test_`` (checked by the
adapter at use), and nothing here turns a live rail on. Settings that would
weaken the platform's security are refused when the settings load.
"""

from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.payments.config import PaymentsConfig


def is_https_url(value: str) -> bool:
    """True for an absolute ``https://`` address with a host."""
    parts = urlsplit(value)
    return parts.scheme == "https" and bool(parts.netloc)


class ConnectConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PAYMENTS_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    #: Signing secret of the Connect webhook endpoint (``connect: true``, events
    #: from connected accounts). Must differ from ``PAYMENTS_STRIPE_WEBHOOK_SECRET``.
    STRIPE_CONNECT_WEBHOOK_SECRET: str | None = None
    #: HTTPS page the business returns to after onboarding, and where Stripe sends
    #: it when a link has expired (one address for both).
    CONNECT_RETURN_URL: str | None = None
    #: The most a business's platform fee may be, in basis points (1/100 of a
    #: percent). Default 0: no platform fee can be set until the owner sets a cap.
    CONNECT_PLATFORM_FEE_CAP_BPS: int = Field(default=0, ge=0, le=10000)
    #: Whether a refund also refunds the platform fee. Off: Barrels keeps its fee.
    CONNECT_REFUND_APPLICATION_FEE: bool = False

    @model_validator(mode="after")
    def _refuse_unsafe_settings(self) -> ConnectConfig:
        if self.CONNECT_RETURN_URL and not is_https_url(self.CONNECT_RETURN_URL):
            raise ValueError("PAYMENTS_CONNECT_RETURN_URL must be an https:// address")
        platform_secret = PaymentsConfig().STRIPE_WEBHOOK_SECRET
        if (
            self.STRIPE_CONNECT_WEBHOOK_SECRET
            and platform_secret
            and self.STRIPE_CONNECT_WEBHOOK_SECRET == platform_secret
        ):
            raise ValueError(
                "PAYMENTS_STRIPE_CONNECT_WEBHOOK_SECRET must differ from PAYMENTS_STRIPE_WEBHOOK_SECRET"
            )
        return self


connect_settings = ConnectConfig()
