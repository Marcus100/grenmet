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


def test_meta_is_unconfigured_by_default_and_the_version_is_pinned() -> None:
    config = ContentDistributionConfig(_env_file=None)
    assert config.META_GRAPH_API_VERSION == "v24.0"
    assert config.META_PAGE_ACCESS_TOKEN is None
    assert config.platform_credentials("facebook") is None
    assert config.platform_credentials("instagram") is None


def test_meta_account_ids_are_numbers_and_the_version_is_shaped() -> None:
    with pytest.raises(ValidationError, match="numbers only"):
        ContentDistributionConfig(_env_file=None, META_PAGE_ID="page-one")
    with pytest.raises(ValidationError, match="META_GRAPH_API_VERSION"):
        ContentDistributionConfig(_env_file=None, META_GRAPH_API_VERSION="24.0")
    with pytest.raises(ValidationError, match="META_GRAPH_API_VERSION"):
        ContentDistributionConfig(
            _env_file=None, META_GRAPH_API_VERSION="v24.0/../evil"
        )


def test_each_platform_needs_its_own_account_and_the_token() -> None:
    config = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_INSTAGRAM_ACCOUNT_ID="456",
        META_PAGE_ACCESS_TOKEN=SecretStr("EAABpage-token-value-0123456789"),
    )
    facebook = config.platform_credentials("facebook")
    instagram = config.platform_credentials("instagram")
    assert facebook is not None and facebook.account_id == "123"
    assert instagram is not None and instagram.account_id == "456"
    assert facebook.access_token == "EAABpage-token-value-0123456789"
    # WhatsApp is never automated, so it never has credentials.
    assert config.platform_credentials("whatsapp") is None
    # The token never shows in a repr, so it cannot reach a log by accident.
    assert "EAABpage-token-value-0123456789" not in repr(config)

    no_instagram_account = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_PAGE_ACCESS_TOKEN=SecretStr("EAABpage-token-value-0123456789"),
    )
    assert no_instagram_account.platform_credentials("instagram") is None
    assert no_instagram_account.platform_credentials("facebook") is not None


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


def test_approved_hosts_are_comma_separated_lower_cased_hostnames() -> None:
    config = ContentDistributionConfig(
        _env_file=None,
        SOCIAL_LINK_HOSTS=" GMS.example.org , www.gms.example.org,,",
        SOCIAL_IMAGE_HOSTS="media.example.org",
    )
    assert config.link_hosts() == frozenset({"gms.example.org", "www.gms.example.org"})
    assert config.image_hosts() == frozenset({"media.example.org"})
    unset = ContentDistributionConfig(_env_file=None)
    assert unset.link_hosts() == frozenset()
    assert unset.image_hosts() == frozenset()


def test_a_padded_token_is_stripped_before_use() -> None:
    token = "EAAB" + "a1B2c3D4e5F6g7H8i9J0k1L2m3"
    config = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_PAGE_ACCESS_TOKEN=SecretStr(f"  {token}\n"),
    )
    credentials = config.platform_credentials("facebook")
    assert credentials is not None
    assert credentials.access_token == token
    assert config.token_looks_malformed() is False


@pytest.mark.parametrize(
    "value",
    [
        "EAAB first half and second half",  # a pasted value with spaces
        "EAAB first\nhalf",  # a line break inside the value
        "too-short",  # far too short to be a Meta token
        "EAAB<html>value</html>",  # something other than a token
    ],
)
def test_a_malformed_token_is_not_used_and_is_reported_without_the_value(
    value: str,
) -> None:
    config = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_INSTAGRAM_ACCOUNT_ID="456",
        META_PAGE_ACCESS_TOKEN=SecretStr(value),
    )
    assert config.token_looks_malformed() is True
    assert config.platform_credentials("facebook") is None
    assert config.platform_credentials("instagram") is None
    assert value not in repr(config)


def test_an_empty_or_whitespace_token_is_unset_not_malformed() -> None:
    config = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_PAGE_ACCESS_TOKEN=SecretStr("   "),
    )
    assert config.token_looks_malformed() is False
    assert config.platform_credentials("facebook") is None


def test_the_access_token_never_appears_in_the_credentials_repr() -> None:
    token = "EAABpage-token-value-0123456789"
    config = ContentDistributionConfig(
        _env_file=None,
        META_PAGE_ID="123",
        META_PAGE_ACCESS_TOKEN=SecretStr(token),
    )
    credentials = config.platform_credentials("facebook")
    assert credentials is not None
    assert token not in repr(credentials)
    assert "123" in repr(credentials)
