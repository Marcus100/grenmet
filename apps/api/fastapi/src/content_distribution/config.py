"""Settings for content distribution (social posting). Owned by this domain.

The CMS shares ``CMS_DISTRIBUTION_SECRET`` with this API. ``SOCIAL_POSTING_LIVE``
stays false until real platform accounts and tokens exist: while false, the
handlers record what they would post and never call a platform. Tokens for live
posting are stored encrypted with the keys in ``SOCIAL_TOKEN_ENCRYPTION_KEYS``
(``src/utils/secret_box.py``); none are set yet.
"""

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.utils import secret_box

MIN_SECRET_LENGTH = 32


class ContentDistributionConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    # Shared with the CMS (apps/web/cms) as the X-CMS-Secret header. Unset, or
    # shorter than MIN_SECRET_LENGTH, the internal route answers 503.
    CMS_DISTRIBUTION_SECRET: SecretStr | None = None
    # False: dry run only. True: the handlers refuse to post until live posting
    # is built, so a stray flag can never send to a real account.
    SOCIAL_POSTING_LIVE: bool = False
    # Fernet keys for platform tokens (secret_box, newest first). Empty for now.
    SOCIAL_TOKEN_ENCRYPTION_KEYS: list[str] = []

    @field_validator("SOCIAL_TOKEN_ENCRYPTION_KEYS")
    @classmethod
    def _keys_must_be_fernet(cls, keys: list[str]) -> list[str]:
        secret_box.validate_keys(keys, "SOCIAL_TOKEN_ENCRYPTION_KEYS")
        return keys

    def cms_secret(self) -> str | None:
        """The shared secret, or None when it is unset or too short to use."""
        if self.CMS_DISTRIBUTION_SECRET is None:
            return None
        value = self.CMS_DISTRIBUTION_SECRET.get_secret_value()
        return value if len(value) >= MIN_SECRET_LENGTH else None


content_distribution_settings = ContentDistributionConfig()
