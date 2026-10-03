"""Notification settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class NotificationConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Comma-separated recipient domains email may go to (e.g. "barrels.gd" while
    # testing). Empty allows every domain. Guards non-production environments
    # against emailing real staff.
    NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS: str = ""
    # Base URL of the staff portal; email links are this plus the in-app path.
    NOTIFICATIONS_WEB_BASE_URL: str = "http://localhost:3001"
    NOTIFICATIONS_BATCH_SIZE: int = 50
    NOTIFICATIONS_MAX_ATTEMPTS: int = 5

    @property
    def allowed_domains(self) -> frozenset[str]:
        return frozenset(
            domain.strip().lower().lstrip("@")
            for domain in self.NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS.split(",")
            if domain.strip()
        )

    def email_allowed(self, email: str) -> bool:
        domains = self.allowed_domains
        if not domains:
            return True
        return email.rsplit("@", 1)[-1].lower() in domains


notification_settings = NotificationConfig()
