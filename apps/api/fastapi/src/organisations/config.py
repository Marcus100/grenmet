"""Organisation settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.utils.secret_box import validate_keys


class OrganisationsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Fernet keys (JSON array, newest first) for secrets organisations store on
    # the platform, such as a public site's Turnstile secret. Dedicated keys:
    # never reuse AUTH_TOTP_ENCRYPTION_KEYS. Unset: such secrets cannot be saved.
    ORG_SECRET_ENCRYPTION_KEYS: list[str] = []

    @model_validator(mode="after")
    def _check_keys(self) -> OrganisationsConfig:
        validate_keys(self.ORG_SECRET_ENCRYPTION_KEYS, "ORG_SECRET_ENCRYPTION_KEYS")
        return self


organisations_settings = OrganisationsConfig()
