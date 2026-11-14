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
    # public site row from it. Move it when the client's own domain goes live
    # (apps/web/babydoll/src/data/site.ts).
    BABYDOLL_SITE_URL: str = "https://babydoll.barrels.gd"

    # Public address of the bookings app (BOOKINGS_APP_URL, the same variable
    # auth reads). The manage-booking page lives there, at
    # ``<APP_URL>/<public slug>/booking/<token>``, so the seed builds each
    # profile's manage link from it. Manage links must be https, so the seed
    # falls back to the production address when this is a local http address.
    APP_URL: str = "https://bookings.barrels.gd"


bookings_settings = BookingsConfig()
