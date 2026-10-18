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
    # Inbox for messages from the Barrels Grenada website (barrels.gd).
    BARRELS_CONTACT_RECIPIENT: str | None = None
    # Inbox for climate data requests from the GMS website. Unset: requests are
    # stored and logged only.
    GMS_DATA_REQUEST_RECIPIENT: str | None = None


contact_settings = ContactConfig()


def recipient_for(site: str) -> str | None:
    """Inbox configured for one website. Each site has its own setting."""
    if site == "barrels":
        return contact_settings.BARRELS_CONTACT_RECIPIENT
    return contact_settings.MBIA_CONTACT_RECIPIENT
