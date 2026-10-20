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


bookings_settings = BookingsConfig()
