"""Bookings settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class BookingsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Public address of the Babydoll Beauty Bar site. The seed builds the
    # profile's manage link and the public site row from it. Move it when the
    # client's own domain goes live (apps/web/babydoll/src/data/site.ts).
    BABYDOLL_SITE_URL: str = "https://babydoll.barrels.gd"


bookings_settings = BookingsConfig()
