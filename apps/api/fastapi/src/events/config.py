from pydantic_settings import BaseSettings, SettingsConfigDict


class EventsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EVENTS_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    #: How long an unpaid paid-tier order holds its tickets before the sweeper
    #: cancels it and releases the stock (N4b).
    ORDER_HOLD_MINUTES: int = 30
    #: Refund policy for an organiser cancelling one paid order: refunded when the
    #: event starts at least this many hours away, kept inside the window. An
    #: event the organiser cancels is refunded in full.
    REFUND_CUTOFF_HOURS: int = 48


events_settings = EventsConfig()
