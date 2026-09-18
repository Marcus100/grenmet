from pydantic_settings import BaseSettings, SettingsConfigDict


class WxProductsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="WXPRODUCTS_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )
    DATABASE_URL: str | None = None


wxproducts_settings = WxProductsConfig()
