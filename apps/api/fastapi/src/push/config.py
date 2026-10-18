"""Web Push settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class PushConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # VAPID key pair (generate with `python -m src.push.cli generate-vapid`).
    # Browser push is off until all three are set.
    WEBPUSH_VAPID_PUBLIC_KEY: str | None = None
    WEBPUSH_VAPID_PRIVATE_KEY: SecretStr | None = None
    # Operator contact sent to push services, as a mailto: or https: URL.
    WEBPUSH_CONTACT: str | None = None
    # A subscription that keeps failing is dropped after this many failures.
    WEBPUSH_MAX_FAILURES: int = 10

    @property
    def enabled(self) -> bool:
        private = self.WEBPUSH_VAPID_PRIVATE_KEY
        return bool(
            self.WEBPUSH_VAPID_PUBLIC_KEY
            and private
            and private.get_secret_value()
            and self.WEBPUSH_CONTACT
        )


push_settings = PushConfig()
