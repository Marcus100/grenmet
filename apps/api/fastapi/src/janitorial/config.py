from pydantic_settings import BaseSettings, SettingsConfigDict


class JanitorialConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="JANITORIAL_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    DATABASE_URL: str | None = None


janitorial_settings = JanitorialConfig()
