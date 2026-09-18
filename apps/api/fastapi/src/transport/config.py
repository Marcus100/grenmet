from pydantic_settings import BaseSettings, SettingsConfigDict


class TransportConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TRANSPORT_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    DATABASE_URL: str | None = None


transport_settings = TransportConfig()
