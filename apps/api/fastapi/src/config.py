import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use .env file from project root
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str | None = None
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    BACKEND_CORS_ORIGINS: Annotated[list[AnyUrl] | str, BeforeValidator(parse_cors)] = (
        []
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        base = [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS]
        return base + (
            [self.FRONTEND_HOST.rstrip("/")]
            if isinstance(self.FRONTEND_HOST, str) and self.FRONTEND_HOST
            else []
        )

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return MultiHostUrl.build(  # type: ignore[return-value]
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: EmailStr | None = None
    # Resend API configuration (preferred provider)
    RESEND_API_KEY: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        # Enabled if a valid FROM email is configured and either:
        # - RESEND_API_KEY is set (Resend provider), or
        # - SMTP host is set (SMTP provider)
        has_from = bool(self.EMAILS_FROM_EMAIL)
        has_provider = bool(self.RESEND_API_KEY or self.SMTP_HOST)
        return bool(has_from and has_provider)

    # Alias for backward compatibility
    @computed_field  # type: ignore[prop-decorator]
    @property
    def EMAILS_ENABLED(self) -> bool:
        return self.emails_enabled

    EMAIL_TEST_USER: EmailStr = "test@barrels.gd"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

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
        """Validate secret strength for production environments."""
        if self.ENVIRONMENT == "local":
            return  # Skip validation for local development

        if not value:
            raise ValueError(
                f"{var_name} is required in {self.ENVIRONMENT} environment"
            )

        # Define minimum lengths for different secrets
        min_lengths = {
            "SECRET_KEY": 32,
            "POSTGRES_PASSWORD": 16,
            "FIRST_SUPERUSER_PASSWORD": 12,
        }

        min_length = min_lengths.get(var_name, 8)

        if len(value) < min_length:
            raise ValueError(
                f"{var_name} must be at least {min_length} characters long "
                f"(current: {len(value)} characters)"
            )

        # Check for weak patterns
        if value.isdigit():
            raise ValueError(f"{var_name} cannot be only numbers")

        if value.isalpha():
            raise ValueError(f"{var_name} cannot be only letters")

        # Check for common weak passwords
        weak_passwords = ["password", "123456", "admin", "test", "secret"]
        if value.lower() in weak_passwords:
            raise ValueError(f"{var_name} uses a common weak password")

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        # Check for default values
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        # Validate secret strength for production
        self._validate_secret_strength("SECRET_KEY", self.SECRET_KEY)
        self._validate_secret_strength("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._validate_secret_strength(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self


# Global settings instance for convenience
# Use this for simple imports, but prefer get_settings() dependency for testability
settings = Settings()  # type: ignore


# Dependency for injecting settings
# This allows test overrides and follows best practices
def get_settings() -> Settings:
    """
    Dependency to get settings instance.

    Use this in FastAPI dependencies when you need testable settings.
    The function can be overridden in tests to provide custom settings.

    Example:
        @router.get("/")
        def my_route(settings: Annotated[Settings, Depends(get_settings)]):
            return {"project": settings.PROJECT_NAME}
    """
    return settings
