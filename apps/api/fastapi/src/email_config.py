"""Email-domain settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import EmailStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


class EmailConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
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

    # React Email render endpoint (web-auth Next.js app).
    # When set, FastAPI calls this URL to render HTML instead of using Jinja2.
    # Example (local):  http://localhost:3000
    # Example (Docker): http://web-auth:3000
    EMAIL_RENDER_URL: str | None = None
    # Shared secret sent in X-Email-Render-Secret header.
    # Must match EMAIL_RENDER_SECRET in the web-auth .env.local.
    EMAIL_RENDER_SECRET: str | None = None

    # Resend webhook signing secret (from Resend dashboard → Webhooks → Signing secret).
    # Used to verify incoming webhook payloads.
    RESEND_WEBHOOK_SECRET: str | None = None

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
