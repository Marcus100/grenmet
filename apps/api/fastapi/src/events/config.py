from pydantic_settings import BaseSettings, SettingsConfigDict


class EventsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EVENTS_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    DATABASE_URL: str | None = None


events_settings = EventsConfig()
