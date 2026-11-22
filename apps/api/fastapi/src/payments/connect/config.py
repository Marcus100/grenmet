"""Stripe Connect settings for New Zealand businesses (ADR-0027), ``PAYMENTS_*``.

Kept apart from the core ``PaymentsConfig`` so the connect module owns its own
knobs. Still TEST MODE: the platform key must be ``sk_test_`` (checked by the
adapter at use), and nothing here turns a live rail on.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConnectConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PAYMENTS_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    #: Signing secret of the Connect webhook endpoint (``connect: true``, events
    #: from connected accounts). Separate from ``PAYMENTS_STRIPE_WEBHOOK_SECRET``.
    STRIPE_CONNECT_WEBHOOK_SECRET: str | None = None
    #: HTTPS page the business returns to after onboarding, and where Stripe sends
    #: it when a link has expired (one address for both).
    CONNECT_RETURN_URL: str | None = None
    #: The most a business's platform fee may be, in basis points (1/100 of a
    #: percent). Default 0: no platform fee can be set until the owner sets a cap.
    CONNECT_PLATFORM_FEE_CAP_BPS: int = Field(default=0, ge=0, le=10000)
    #: Whether a refund also refunds the platform fee. Off: Barrels keeps its fee.
    CONNECT_REFUND_APPLICATION_FEE: bool = False


connect_settings = ConnectConfig()
