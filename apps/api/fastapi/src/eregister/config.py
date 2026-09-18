from pydantic_settings import BaseSettings, SettingsConfigDict


class ERegisterConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EREGISTER_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )
    DATABASE_URL: str | None = None


eregister_settings = ERegisterConfig()
