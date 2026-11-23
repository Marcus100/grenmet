from typing import Literal

from pydantic import model_validator
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
    #: The daily refund reconciliation job (#869) checks captured provider payments
    #: created in this many days, at most ``REFUND_RECONCILE_BATCH`` per run.
    REFUND_RECONCILE_WINDOW_DAYS: int = 180
    REFUND_RECONCILE_BATCH: int = 200
    #: The run stops cleanly after this long, before the worker's 300 s job timeout.
    REFUND_RECONCILE_BUDGET_SECONDS: float = 240.0
    #: A payment's listing stops paging (incomplete, totals not compared) once less
    #: than this much of the run's budget is left.
    REFUND_RECONCILE_PAGE_MARGIN_SECONDS: float = 20.0

    # --- WiPay (Grenada; ADR-0027 amendment, 21 Nov 2026) ---------------------------
    #: The HTTPS address WiPay sends the customer back to (the public return route).
    #: Unset = WiPay checkouts are refused (503), never started without a return path.
    WIPAY_RESPONSE_URL: str | None = None
    #: Who pays WiPay's fee: ``merchant_absorb`` keeps the deposit the customer sees.
    WIPAY_FEE_STRUCTURE: Literal["customer_pay", "merchant_absorb", "split"] = (
        "merchant_absorb"
    )
    WIPAY_METHOD: Literal["credit_card_co", "3co_simple"] = "credit_card_co"
    #: The WiPay processing platform (Grenada). CARICOM platforms come later.
    WIPAY_COUNTRY_CODE: str = "GD"
    #: The ``origin`` label WiPay echoes back (letters, digits, hyphens, underscores).
    WIPAY_ORIGIN: str = "BarrelsBookings"

    # --- Barrels platform fee (owner decision 21 Nov 2026) --------------------------
    #: Off. No Barrels fee is charged on Grenada payments until the legal reading of
    #: the Payment System and Services Act 2025 is in. Turning it on is refused here:
    #: nothing implements it yet, so it cannot be switched on by configuration.
    GRENADA_PLATFORM_FEE_ENABLED: bool = False

    @model_validator(mode="after")
    def _no_platform_fee_yet(self) -> PaymentsConfig:
        if self.GRENADA_PLATFORM_FEE_ENABLED:
            raise ValueError(
                "The Grenada platform fee is not built; the legal reading of the "
                "Payment System and Services Act 2025 is pending"
            )
        return self


payments_settings = PaymentsConfig()
