import hashlib
import hmac

import pytest

from src.config import settings
from src.utils import email_hash
from src.utils.email_hash import EmailHashPepperMissingError, hash_email


def test_hash_is_hmac_sha256_hex_of_the_normalised_address() -> None:
    expected = hmac.new(b"pepper", b"reader@example.com", hashlib.sha256).hexdigest()
    assert hash_email("  Reader@Example.COM ", pepper="pepper") == expected
    assert len(expected) == 64


def test_hash_is_deterministic_and_depends_on_the_pepper() -> None:
    assert hash_email("a@example.com", pepper="one") == hash_email(
        "A@example.com", pepper="one"
    )
    assert hash_email("a@example.com", pepper="one") != hash_email(
        "a@example.com", pepper="two"
    )
    assert hash_email("a@example.com", pepper="one") != hash_email(
        "b@example.com", pepper="one"
    )


def test_local_environment_falls_back_to_a_dev_pepper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMAIL_HASH_PEPPER", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "local")
    assert hash_email("a@example.com") == hash_email(
        "a@example.com", pepper=email_hash._LOCAL_DEV_PEPPER
    )


def test_non_local_environment_refuses_an_empty_pepper(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "EMAIL_HASH_PEPPER", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(EmailHashPepperMissingError, match="EMAIL_HASH_PEPPER"):
        hash_email("a@example.com")
