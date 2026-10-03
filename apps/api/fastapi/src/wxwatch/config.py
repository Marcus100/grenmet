from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class WxWatchConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="WXWATCH_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )
    DATABASE_URL: str | None = None
    INGEST_TOKEN: SecretStr | None = None
    LOCAL_IMAGES_DIR: Path | None = None
    LOCAL_ASSET_ROOTS: dict[str, Path] = Field(default_factory=dict)


wxwatch_settings = WxWatchConfig()
