"""Bookings settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class BookingsConfig(BaseSettings):
    """Bookings settings loaded from BOOKINGS_* environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="BOOKINGS_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    #: How long an unpaid deposit booking holds its slot before the sweeper
    #: cancels it and releases the slot.
    DEPOSIT_HOLD_MINUTES: int = 30

    # Public address of the Babydoll Beauty Bar site. The seed builds the
    # profile's manage link and the public site row from it. Move it when the
    # client's own domain goes live (apps/web/babydoll/src/data/site.ts).
    BABYDOLL_SITE_URL: str = "https://babydoll.barrels.gd"


bookings_settings = BookingsConfig()
