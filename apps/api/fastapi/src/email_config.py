"""Email-domain settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import EmailStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


class EmailConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "App"  # Used for default EMAILS_FROM_NAME
    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: EmailStr | None = None
    RESEND_API_KEY: str | None = None
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48
    EMAIL_TEST_USER: EmailStr = "test@weather.gd"

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    @property
    def emails_enabled(self) -> bool:
        has_from = bool(self.EMAILS_FROM_EMAIL)
        has_provider = bool(self.RESEND_API_KEY or self.SMTP_HOST)
        return bool(has_from and has_provider)

    @property
    def EMAILS_ENABLED(self) -> bool:
        return self.emails_enabled


email_settings = EmailConfig()
