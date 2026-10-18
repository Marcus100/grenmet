"""Contact-form settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class ContactConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Inbox for messages from the MBIA website. Unset: messages are stored and
    # logged only, nothing is emailed.
    MBIA_CONTACT_RECIPIENT: str | None = None


contact_settings = ContactConfig()
