"""Settings and token sealing for content distribution. No database needed."""

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr, ValidationError

from src.content_distribution import tokens
from src.content_distribution.config import (
    MIN_SECRET_LENGTH,
    ContentDistributionConfig,
)
from src.content_distribution.config import (
    content_distribution_settings as settings,
)
from src.utils.secret_box import SecretBoxError


def test_live_posting_is_off_by_default() -> None:
    assert ContentDistributionConfig(_env_file=None).SOCIAL_POSTING_LIVE is False


def test_a_short_cms_secret_is_unusable() -> None:
    short = ContentDistributionConfig(
        _env_file=None, CMS_DISTRIBUTION_SECRET=SecretStr("x" * (MIN_SECRET_LENGTH - 1))
    )
    assert short.cms_secret() is None
    long_enough = ContentDistributionConfig(
        _env_file=None, CMS_DISTRIBUTION_SECRET=SecretStr("x" * MIN_SECRET_LENGTH)
    )
    assert long_enough.cms_secret() == "x" * MIN_SECRET_LENGTH


def test_unset_cms_secret_is_none() -> None:
    assert ContentDistributionConfig(_env_file=None).cms_secret() is None


def test_token_keys_must_be_fernet_keys() -> None:
    with pytest.raises(ValidationError, match="SOCIAL_TOKEN_ENCRYPTION_KEYS"):
        ContentDistributionConfig(
            _env_file=None, SOCIAL_TOKEN_ENCRYPTION_KEYS=["not-a-fernet-key"]
        )


def test_tokens_round_trip_and_are_not_stored_in_clear(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        settings,
        "SOCIAL_TOKEN_ENCRYPTION_KEYS",
        [Fernet.generate_key().decode()],
    )
    sealed = tokens.seal("page-token-value")
    assert "page-token-value" not in sealed
    assert tokens.unseal(sealed) == "page-token-value"


def test_sealing_without_keys_refuses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SOCIAL_TOKEN_ENCRYPTION_KEYS", [])
    with pytest.raises(SecretBoxError):
        tokens.seal("anything")
