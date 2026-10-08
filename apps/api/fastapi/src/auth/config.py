import secrets
import warnings
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthConfig(BaseSettings):
    """Auth-domain settings loaded from env. Decoupled from global Settings."""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        hide_input_in_errors=True,
        extra="ignore",
    )

    API_V1_STR: str = "/api/v1"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    AUTH_FRONTEND_URL: str = "http://localhost:3000"
    ALLOW_PUBLIC_SIGNUP: bool = True
    # App-scoped sign-in (src/auth/apps.py). Each self-service app has its own
    # sign-in pages, session cookie and Google redirect; see ADR-0016.
    EVENTS_APP_URL: str = "http://localhost:3009"
    EVENTS_GOOGLE_REDIRECT_URI: str = ""
    # Shared with the Events web server; it must present this to redeem a
    # single sign-on code (ADR-0017). Empty disables single sign-on for Events.
    EVENTS_SSO_CLIENT_SECRET: str = ""
    # Staff apps that sign in through auth.barrels.gd (ADR-0017). An empty
    # secret switches single sign-on off for that app.
    GAA_ADMIN_APP_URL: str = "http://localhost:3001"
    GAA_ADMIN_SSO_CLIENT_SECRET: str = ""
    CMS_APP_URL: str = "http://localhost:3006"
    CMS_SSO_CLIENT_SECRET: str = ""
    # Public sites with "Sign in" (ADR-0017 step 4); members join automatically.
    WEATHER_APP_URL: str = "http://localhost:3003"
    WEATHER_SSO_CLIENT_SECRET: str = ""
    MBIA_APP_URL: str = "http://localhost:3005"
    MBIA_SSO_CLIENT_SECRET: str = ""
    SIGNAL_APP_URL: str = "http://localhost:3004"
    SIGNAL_SSO_CLIENT_SECRET: str = ""
    DOCS_APP_URL: str = "http://localhost:3002"
    DOCS_SSO_CLIENT_SECRET: str = ""
    ELECTIONS_APP_URL: str = "http://localhost:3007"
    ELECTIONS_SSO_CLIENT_SECRET: str = ""
    # One-time codes by SMS/WhatsApp. "disabled" until a provider is chosen
    # (every message costs money); "console" logs codes for local development.
    PHONE_OTP_PROVIDER: Literal["disabled", "console"] = "disabled"

    # Staged rollout: enforcement only after operator enrolment/recovery acceptance.
    AUTH_PRIVILEGED_MFA_MODE: Literal["disabled", "enforce"] = "disabled"
    # Dedicated Fernet keys: first encrypts; remaining keys decrypt during rotation.
    AUTH_TOTP_ENCRYPTION_KEYS: list[str] = []

    SECRET_KEY: str = secrets.token_urlsafe(32)
    # Legacy OAuth2 bearer token (login/access-token). Short-lived by default: the
    # primary web path is the cookie-session (15-min access + 30-day rotating
    # session via /login/session/refresh), so bearer tokens need not be long-lived.
    # Override ACCESS_TOKEN_EXPIRE_MINUTES for non-interactive/service clients if needed.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    SESSION_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    SESSION_EXPIRE_DAYS: int = 30
    # GAA Admin's host-only session cookie (ADR-0017). Its same-origin proxy
    # forwards it to the cookie-authenticated routes (src/auth/browser.py).
    BROWSER_SESSION_COOKIE_NAME: str = "admin_session"
    # Account lockout (Redis-backed; disabled when REDIS_URL is unset — fail-open).
    LOGIN_MAX_FAILED_ATTEMPTS: int = 10
    LOGIN_LOCKOUT_SECONDS: int = 900
    LOGIN_FAILURE_WINDOW_SECONDS: int = 900
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"
    # bcrypt cost factor. 12 is the modern recommended minimum and is
    # enforced as a floor outside local; test runs lower it (BCRYPT_ROUNDS=4)
    # because each hash+verify at cost 12 costs ~440ms, which dominated CI.
    BCRYPT_ROUNDS: int = 12

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
        if self.ENVIRONMENT != "local" and self.BCRYPT_ROUNDS < 12:
            raise ValueError(
                f"BCRYPT_ROUNDS must be at least 12 in the {self.ENVIRONMENT} "
                f"environment (got {self.BCRYPT_ROUNDS}); a lowered cost factor "
                "is a test-only optimisation."
            )
        if (
            self.AUTH_PRIVILEGED_MFA_MODE == "enforce"
            and not self.AUTH_TOTP_ENCRYPTION_KEYS
        ):
            raise ValueError(
                "Privileged MFA enforcement requires AUTH_TOTP_ENCRYPTION_KEYS"
            )
        from cryptography.fernet import Fernet

        for key in self.AUTH_TOTP_ENCRYPTION_KEYS:
            try:
                Fernet(key.encode())
            except ValueError, TypeError:
                raise ValueError(
                    "AUTH_TOTP_ENCRYPTION_KEYS must contain Fernet keys"
                ) from None
        return self


# Global auth settings instance
auth_settings = AuthConfig()
