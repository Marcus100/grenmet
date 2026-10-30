"""Settings for content distribution (social posting). Owned by this domain.

The CMS shares ``CMS_DISTRIBUTION_SECRET`` with this API. Live posting to Facebook
and Instagram needs three things at once: the feature flag ``social-live-posting``
(``src/feature_flags``, switched per environment), the Meta settings below, and the
page access token. Until all three are present the handlers record a dry run and
say why. The token is read from the environment and is never stored in the
database. ``SOCIAL_TOKEN_ENCRYPTION_KEYS`` is for sealing platform tokens at rest
(``src/utils/secret_box.py``) and stays empty until a token is stored that way.
"""

import re
from dataclasses import dataclass

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.utils import secret_box

from .constants import PLATFORM_FACEBOOK, PLATFORM_INSTAGRAM

MIN_SECRET_LENGTH = 32
# The Graph API version is pinned here, not per request. Check it against Meta's
# version list before switching live posting on: Meta retires each version about
# two years after release.
GRAPH_API_VERSION_PATTERN = re.compile(r"v[0-9]{1,2}\.[0-9]{1,2}")
# Graph object ids are numeric. Validated because they become URL path segments.
GRAPH_ID_PATTERN = re.compile(r"[0-9]{1,32}")


@dataclass(frozen=True)
class PlatformCredentials:
    """What one live platform needs. ``access_token`` is a secret: never log it."""

    account_id: str
    access_token: str


class ContentDistributionConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )

    # Shared with the CMS (apps/web/cms) as the X-CMS-Secret header. Unset, or
    # shorter than MIN_SECRET_LENGTH, the internal route answers 503.
    CMS_DISTRIBUTION_SECRET: SecretStr | None = None
    # Fernet keys for platform tokens (secret_box, newest first). Empty for now.
    SOCIAL_TOKEN_ENCRYPTION_KEYS: list[str] = []
    # Graph API version used for every Meta call.
    META_GRAPH_API_VERSION: str = "v24.0"
    # The Facebook Page that receives the posts.
    META_PAGE_ID: str | None = None
    # The Instagram business account linked to that Page.
    META_INSTAGRAM_ACCOUNT_ID: str | None = None
    # Long-lived Page access token with the publishing permissions (secret).
    META_PAGE_ACCESS_TOKEN: SecretStr | None = None

    @field_validator("SOCIAL_TOKEN_ENCRYPTION_KEYS")
    @classmethod
    def _keys_must_be_fernet(cls, keys: list[str]) -> list[str]:
        secret_box.validate_keys(keys, "SOCIAL_TOKEN_ENCRYPTION_KEYS")
        return keys

    @field_validator("META_GRAPH_API_VERSION")
    @classmethod
    def _version_shape(cls, version: str) -> str:
        if not GRAPH_API_VERSION_PATTERN.fullmatch(version):
            raise ValueError("META_GRAPH_API_VERSION must look like v24.0")
        return version

    @field_validator("META_PAGE_ID", "META_INSTAGRAM_ACCOUNT_ID")
    @classmethod
    def _graph_id_shape(cls, value: str | None) -> str | None:
        if value is not None and not GRAPH_ID_PATTERN.fullmatch(value):
            raise ValueError("Meta account ids are numbers only")
        return value

    def cms_secret(self) -> str | None:
        """The shared secret, or None when it is unset or too short to use."""
        if self.CMS_DISTRIBUTION_SECRET is None:
            return None
        value = self.CMS_DISTRIBUTION_SECRET.get_secret_value()
        return value if len(value) >= MIN_SECRET_LENGTH else None

    def platform_credentials(self, platform: str) -> PlatformCredentials | None:
        """What a live post to ``platform`` needs, or None when any part is missing."""
        if self.META_PAGE_ACCESS_TOKEN is None:
            return None
        token = self.META_PAGE_ACCESS_TOKEN.get_secret_value()
        if not token:
            return None
        if platform == PLATFORM_FACEBOOK:
            account = self.META_PAGE_ID
        elif platform == PLATFORM_INSTAGRAM:
            account = self.META_INSTAGRAM_ACCOUNT_ID
        else:
            return None
        if not account:
            return None
        return PlatformCredentials(account_id=account, access_token=token)


content_distribution_settings = ContentDistributionConfig()
