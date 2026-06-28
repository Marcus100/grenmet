import secrets
import warnings
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


class AuthConfig(BaseSettings):
    """Auth-domain settings loaded from env. Decoupled from global Settings."""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    SESSION_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    SESSION_EXPIRE_DAYS: int = 30
    SESSION_COOKIE_NAME: str = "grenmet_session"
    SESSION_COOKIE_DOMAIN: str | None = None
    # Account lockout (Redis-backed; disabled when REDIS_URL is unset — fail-open).
    LOGIN_MAX_FAILED_ATTEMPTS: int = 10
    LOGIN_LOCKOUT_SECONDS: int = 900
    LOGIN_FAILURE_WINDOW_SECONDS: int = 900
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    def _validate_secret_strength(self, var_name: str, value: str | None) -> None:
        if self.ENVIRONMENT == "local":
            return
        if not value:
            raise ValueError(
                f"{var_name} is required in {self.ENVIRONMENT} environment"
            )
        min_lengths = {"SECRET_KEY": 32}
        min_length = min_lengths.get(var_name, 8)
        if len(value) < min_length:
            raise ValueError(
                f"{var_name} must be at least {min_length} characters long "
                f"(current: {len(value)} characters)"
            )
        if value.isdigit():
            raise ValueError(f"{var_name} cannot be only numbers")
        if value.isalpha():
            raise ValueError(f"{var_name} cannot be only letters")
        weak_passwords = ["password", "123456", "admin", "test", "secret"]
        if value.lower() in weak_passwords:
            raise ValueError(f"{var_name} uses a common weak password")

    @model_validator(mode="after")
    def _enforce_auth_secrets(self) -> Self:
        # Outside local, refuse the generated ephemeral default. The default is
        # cryptographically strong, so it passes every check below — which would
        # silently hide a missing SECRET_KEY env var. An ephemeral key differs
        # per worker and per restart, invalidating all tokens. Require it explicitly.
        if self.ENVIRONMENT != "local" and "SECRET_KEY" not in self.model_fields_set:
            raise ValueError(
                f"SECRET_KEY must be set explicitly in the {self.ENVIRONMENT} "
                "environment; refusing to fall back to the generated ephemeral default."
            )
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._validate_secret_strength("SECRET_KEY", self.SECRET_KEY)
        return self


# Global auth settings instance
auth_settings = AuthConfig()
