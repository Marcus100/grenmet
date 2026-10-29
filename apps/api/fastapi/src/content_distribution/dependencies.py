"""Service-to-service auth for the CMS hook (a shared secret, not a user session)."""

import hmac
from typing import Annotated

from fastapi import Header

from .config import content_distribution_settings
from .exceptions import CmsSecretInvalid, ContentDistributionNotConfigured


def authenticate_cms(x_cms_secret: Annotated[str | None, Header()] = None) -> None:
    expected = content_distribution_settings.cms_secret()
    if expected is None:
        raise ContentDistributionNotConfigured()
    if not x_cms_secret or not hmac.compare_digest(
        x_cms_secret.encode(), expected.encode()
    ):
        raise CmsSecretInvalid()
