from decimal import Decimal

from pydantic import Field, HttpUrl
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
    #: App subscription prices (ADR-0065): ``"<plan_key>:<currency>": "<Stripe price id>"``.
    STRIPE_PRICES: dict[str, str] = Field(default_factory=dict)
    #: Live mode switch (ADR-0065 "Going live"). Off: test keys only and live
    #: events refused. On: live keys only and live-mode events only. Owner-set.
    STRIPE_LIVE_ENABLED: bool = False
    #: Fallback return URLs, used only when an organisation has no slug or the
    #: bookings app address is unset. App subscriptions return to the organisation's
    #: studio plan page instead (ADR-0065 amendment).
    CHECKOUT_SUCCESS_URL: HttpUrl = HttpUrl(
        "http://localhost:8000/scalar?checkout=success&session_id={CHECKOUT_SESSION_ID}"
    )
    CHECKOUT_CANCEL_URL: HttpUrl = HttpUrl(
        "http://localhost:8000/scalar?checkout=cancelled"
    )

    # Invoicing (Barrels invoices its own service-line clients). Owner decision
    # 2026-10-18: XCD, net 30. The legal entity, VAT rate and number format are
    # PROVISIONAL until the business registration and tax advice are confirmed.
    INVOICE_CURRENCY: str = "XCD"
    INVOICE_PAYMENT_TERMS_DAYS: int = Field(default=30, ge=0, le=365)
    INVOICE_LEGAL_ENTITY_NAME: str = "Barrels Grenada"  # provisional
    INVOICE_DEFAULT_TAX_RATE: Decimal = Field(
        default=Decimal("15"), ge=0, le=100
    )  # VAT percent, provisional
    INVOICE_NUMBER_PREFIX: str = "BG"  # number is <prefix>-YYYY-NNNN, provisional
    INVOICE_NUMBER_PADDING: int = Field(default=4, ge=1, le=10)
    INVOICE_REMINDER_GRACE_DAYS: int = Field(default=2, ge=0, le=14)


billing_settings = BillingConfig()
